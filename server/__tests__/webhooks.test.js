/**
 * @file Tests for the universal webhook delivery layer: payload formatting per
 * platform (slack/discord/teams/generic), HMAC signing, target CRUD with secret
 * redaction, validation, the synchronous test probe, rule-scoped dispatch,
 * disabled-target skipping, retry/backoff with delivery-log recording, and the
 * clear-data wipe.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("crypto");

// Test DB + fast retry tunables must be set BEFORE requiring server modules
// (server/lib/webhooks.js reads the WEBHOOK_* env at module load).
const TEST_DB = path.join(os.tmpdir(), `dashboard-webhooks-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;
process.env.WEBHOOK_MAX_ATTEMPTS = "2";
process.env.WEBHOOK_RETRY_BASE_MS = "10";
process.env.WEBHOOK_TIMEOUT_MS = "3000";

const { createApp, startServer } = require("../index");
const { db, stmts } = require("../db");
const webhooks = require("../lib/webhooks");

let server;
let BASE;

// Mock receiver — records every inbound request; behavior is tunable per-test.
const received = [];
let nextStatus = 200;
let failTimes = 0; // respond 500 this many times before honoring nextStatus
let recvServer;
let RECV_URL;

function resetReceiver() {
  received.length = 0;
  nextStatus = 200;
  failTimes = 0;
}

// Wipe all targets/deliveries between tests so an enabled target from one test
// never receives another test's dispatch (which would also fire real requests
// at example.com URLs from the CRUD tests).
beforeEach(() => {
  db.prepare("DELETE FROM webhook_deliveries").run();
  db.prepare("DELETE FROM webhook_targets").run();
  webhooks.invalidateWebhookCache();
  resetReceiver();
});

function fetchJson(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...options.headers },
    };
    const req = http.request(opts, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

const post = (p, body) => fetchJson(p, { method: "POST", body });
const patch = (p, body) => fetchJson(p, { method: "PATCH", body });
const del = (p) => fetchJson(p, { method: "DELETE" });

const SAMPLE_ALERT = {
  id: 42,
  rule_id: "rule-abc",
  rule_name: "Too many errors",
  rule_type: "event_pattern",
  session_id: "sess-1",
  agent_id: "agent-1",
  message: "5 matching events in 2 min (threshold 5)",
  details: JSON.stringify({ observed_count: 5 }),
  triggered_at: "2026-06-10T12:00:00.000Z",
};

before(async () => {
  recvServer = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(b);
      } catch {
        parsed = b;
      }
      received.push({ method: req.method, headers: req.headers, body: parsed });
      let status = nextStatus;
      if (failTimes > 0) {
        failTimes -= 1;
        status = 500;
      }
      res.statusCode = status;
      res.end("ok");
    });
  });
  await new Promise((r) => recvServer.listen(0, "127.0.0.1", r));
  RECV_URL = `http://127.0.0.1:${recvServer.address().port}/hook`;

  const app = createApp();
  server = await startServer(app, 0);
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
  if (recvServer) recvServer.close();
  try {
    db.close();
  } catch {
    /* ignore */
  }
});

describe("payload formatting", () => {
  it("slack: header + section + context blocks with fallback text", () => {
    const p = webhooks.formatPayload("slack", SAMPLE_ALERT);
    assert.ok(p.text.includes("Too many errors"));
    assert.equal(p.blocks[0].type, "header");
    assert.equal(p.blocks[1].type, "section");
    assert.equal(p.blocks[2].type, "context");
    assert.ok(p.blocks[1].text.text.includes("threshold 5"));
  });

  it("discord: single rich embed with fields", () => {
    const p = webhooks.formatPayload("discord", SAMPLE_ALERT);
    assert.equal(p.embeds.length, 1);
    assert.ok(p.embeds[0].title.includes("Too many errors"));
    assert.equal(p.embeds[0].timestamp, SAMPLE_ALERT.triggered_at);
    assert.ok(p.embeds[0].fields.some((f) => f.name === "Session"));
  });

  it("teams: MessageCard with facts", () => {
    const p = webhooks.formatPayload("teams", SAMPLE_ALERT);
    assert.equal(p["@type"], "MessageCard");
    assert.ok(p.sections[0].facts.some((f) => f.name === "Type"));
  });

  it("generic: stable envelope with parsed details", () => {
    const p = webhooks.formatPayload("generic", SAMPLE_ALERT);
    assert.equal(p.event, "alert.triggered");
    assert.equal(p.alert.rule_name, "Too many errors");
    assert.deepEqual(p.alert.details, { observed_count: 5 });
  });

  it("generic: HMAC signature header when secret set", () => {
    const target = { type: "generic", url: "https://x.test", secret: "s3cr3t" };
    const { body, headers } = webhooks.buildRequest(target, SAMPLE_ALERT);
    const ts = headers["X-Webhook-Timestamp"];
    const expected =
      "sha256=" + crypto.createHmac("sha256", "s3cr3t").update(`${ts}.${body}`).digest("hex");
    assert.equal(headers["X-Webhook-Signature"], expected);
  });

  it("generic: custom headers cannot clobber Content-Type or signature", () => {
    const target = {
      type: "generic",
      url: "https://x.test",
      headers: { "Content-Type": "text/plain", "X-Webhook-Signature": "fake", "X-Custom": "ok" },
    };
    const { headers } = webhooks.buildRequest(target, SAMPLE_ALERT);
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["X-Custom"], "ok");
    assert.notEqual(headers["X-Webhook-Signature"], "fake");
  });
});

describe("target CRUD + redaction", () => {
  it("creates a generic target and never returns the raw url/secret", async () => {
    const res = await post("/api/webhooks", {
      name: "My endpoint",
      type: "generic",
      url: "https://example.com/hook/SECRET-TOKEN-1234",
      secret: "signing-secret",
      headers: { Authorization: "Bearer abc" },
    });
    assert.equal(res.status, 201);
    const t = res.body.target;
    assert.equal(t.name, "My endpoint");
    assert.equal(t.has_secret, true);
    assert.ok(!("secret" in t));
    assert.ok(!t.url_preview.includes("SECRET-TOKEN"));
    assert.ok(t.url_preview.includes("example.com"));
    assert.deepEqual(t.headers, { Authorization: "••••" }); // value masked
  });

  it("rejects an invalid url and a bad type", async () => {
    const r1 = await post("/api/webhooks", { name: "x", type: "generic", url: "not a url" });
    assert.equal(r1.status, 400);
    const r2 = await post("/api/webhooks", {
      name: "x",
      type: "carrier-pigeon",
      url: "https://x.io",
    });
    assert.equal(r2.status, 400);
  });

  it("requires https for slack/discord/teams", async () => {
    const r = await post("/api/webhooks", {
      name: "x",
      type: "slack",
      url: "http://insecure.test/x",
    });
    assert.equal(r.status, 400);
  });

  it("patches enabled without touching the url/secret", async () => {
    const created = await post("/api/webhooks", {
      name: "patch-me",
      type: "generic",
      url: "https://example.com/abc",
      secret: "keep-me",
    });
    const id = created.body.target.id;
    const res = await patch(`/api/webhooks/${id}`, { enabled: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.target.enabled, false);
    assert.equal(res.body.target.has_secret, true); // secret preserved
    // raw row still has the secret
    assert.equal(stmts.getWebhookTarget.get(id).secret, "keep-me");
  });

  it("deletes a target", async () => {
    const created = await post("/api/webhooks", {
      name: "delete-me",
      type: "generic",
      url: "https://example.com/del",
    });
    const id = created.body.target.id;
    const res = await del(`/api/webhooks/${id}`);
    assert.equal(res.status, 200);
    assert.equal(stmts.getWebhookTarget.get(id), undefined);
  });
});

describe("delivery", () => {
  it("dispatches a fired alert to an enabled target with the generic payload", async () => {
    resetReceiver();
    const created = await post("/api/webhooks", {
      name: "live",
      type: "generic",
      url: RECV_URL,
    });
    await webhooks.dispatchAlert(SAMPLE_ALERT);
    assert.equal(received.length, 1);
    assert.equal(received[0].body.event, "alert.triggered");
    assert.equal(received[0].body.alert.rule_name, "Too many errors");
    // a success delivery row was recorded
    const last = stmts.lastWebhookDeliveryForTarget.get(created.body.target.id);
    assert.equal(last.status, "success");
  });

  it("skips disabled targets", async () => {
    resetReceiver();
    const created = await post("/api/webhooks", {
      name: "off",
      type: "generic",
      url: RECV_URL,
      enabled: false,
    });
    await webhooks.dispatchAlert(SAMPLE_ALERT);
    assert.equal(received.length, 0);
    assert.equal(stmts.lastWebhookDeliveryForTarget.get(created.body.target.id), undefined);
  });

  it("honors rule_ids scoping", async () => {
    resetReceiver();
    await post("/api/webhooks", {
      name: "scoped",
      type: "generic",
      url: RECV_URL,
      rule_ids: ["some-other-rule"],
    });
    await webhooks.dispatchAlert(SAMPLE_ALERT); // rule_id "rule-abc" not in scope
    assert.equal(received.length, 0);
  });

  it("retries on 5xx then records success", async () => {
    resetReceiver();
    failTimes = 1; // first attempt 500, second 200
    const created = await post("/api/webhooks", {
      name: "retry",
      type: "generic",
      url: RECV_URL,
    });
    await webhooks.dispatchAlert(SAMPLE_ALERT);
    assert.equal(received.length, 2); // one failed + one retried
    const last = stmts.lastWebhookDeliveryForTarget.get(created.body.target.id);
    assert.equal(last.status, "success");
    assert.equal(last.attempts, 2);
  });

  it("records a failure when all attempts return 5xx", async () => {
    resetReceiver();
    nextStatus = 500;
    failTimes = 0;
    const created = await post("/api/webhooks", {
      name: "fail",
      type: "generic",
      url: RECV_URL,
    });
    const settled = await webhooks.dispatchAlert(SAMPLE_ALERT);
    assert.equal(settled[0].value.ok, false);
    const last = stmts.lastWebhookDeliveryForTarget.get(created.body.target.id);
    assert.equal(last.status, "failed");
    assert.equal(last.status_code, 500);
  });

  it("does not retry on 4xx", async () => {
    resetReceiver();
    nextStatus = 400;
    const created = await post("/api/webhooks", {
      name: "badreq",
      type: "generic",
      url: RECV_URL,
    });
    await webhooks.dispatchAlert(SAMPLE_ALERT);
    assert.equal(received.length, 1); // no retry
    assert.equal(stmts.lastWebhookDeliveryForTarget.get(created.body.target.id).status, "failed");
  });
});

describe("test probe + clear-data", () => {
  it("POST /:id/test delivers a synthetic alert and reports ok", async () => {
    resetReceiver();
    const created = await post("/api/webhooks", {
      name: "probe",
      type: "generic",
      url: RECV_URL,
    });
    const res = await post(`/api/webhooks/${created.body.target.id}/test`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].body.alert.rule_type, "test");
  });

  it("clear-data wipes the delivery log but keeps targets", async () => {
    resetReceiver();
    const created = await post("/api/webhooks", { name: "keep", type: "generic", url: RECV_URL });
    await webhooks.dispatchAlert(SAMPLE_ALERT);
    assert.ok(stmts.lastWebhookDeliveryForTarget.get(created.body.target.id));
    await post("/api/settings/clear-data");
    assert.equal(stmts.lastWebhookDeliveryForTarget.get(created.body.target.id), undefined);
    assert.ok(stmts.getWebhookTarget.get(created.body.target.id)); // target survives
  });
});
