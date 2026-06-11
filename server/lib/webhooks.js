/**
 * @file Universal webhook delivery for fired alerts. A "target" is an outbound
 * destination — Slack, Discord, Microsoft Teams, or any generic HTTP endpoint.
 * When the alerting engine fires an alert (server/lib/alerts.js), it calls
 * dispatchAlert(), which formats a per-platform payload and POSTs it to every
 * enabled target (optionally scoped to specific rules) with a timeout and
 * bounded retry/backoff. Every attempt-chain is recorded in webhook_deliveries.
 *
 * Delivery is detached and fully fail-safe: it never throws into, slows, or
 * blocks the alert path or hook ingestion.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const crypto = require("crypto");
const { stmts } = require("../db");

const WEBHOOK_TYPES = ["slack", "discord", "teams", "generic"];

// Tunables (env-overridable so tests can shrink timeouts/backoff). All read at
// module load — restart to change.
function posEnv(name, fallback) {
  const raw = parseInt(process.env[name], 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}
const TIMEOUT_MS = posEnv("WEBHOOK_TIMEOUT_MS", 10_000);
const MAX_ATTEMPTS = posEnv("WEBHOOK_MAX_ATTEMPTS", 3);
const RETRY_BASE_MS = posEnv("WEBHOOK_RETRY_BASE_MS", 1500);

// Enabled-target cache. Alert fires are hot; targets only change through the
// CRUD routes, which call invalidateWebhookCache().
let targetsCache = null;

function invalidateWebhookCache() {
  targetsCache = null;
}

/** Parse the JSON columns and coerce the enabled flag for a raw target row. */
function normalizeTarget(row) {
  if (!row) return null;
  let headers = null;
  let ruleIds = null;
  try {
    headers = row.headers ? JSON.parse(row.headers) : null;
  } catch {
    /* tolerate hand-edited bad JSON — extra headers simply not applied */
  }
  try {
    ruleIds = row.rule_ids ? JSON.parse(row.rule_ids) : null;
  } catch {
    /* tolerate bad JSON — target falls back to "all rules" */
  }
  return { ...row, enabled: row.enabled === 1, headers, rule_ids: ruleIds };
}

function loadEnabledTargets() {
  if (targetsCache) return targetsCache;
  targetsCache = stmts.listEnabledWebhookTargets.all().map(normalizeTarget);
  return targetsCache;
}

// ── Payload formatting ──────────────────────────────────────────────────────

function truncate(value, max) {
  const s = String(value == null ? "" : value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function parseDetails(alert) {
  if (alert.details == null) return null;
  if (typeof alert.details === "object") return alert.details;
  try {
    return JSON.parse(alert.details);
  } catch {
    return alert.details;
  }
}

// Slack incoming webhook: header + section + context. `text` is the required
// notification/fallback string.
function formatSlack(alert) {
  const ctx = [`Type: \`${alert.rule_type}\``];
  if (alert.session_id) ctx.push(`Session: \`${truncate(alert.session_id, 64)}\``);
  if (alert.agent_id) ctx.push(`Agent: \`${truncate(alert.agent_id, 64)}\``);
  ctx.push(alert.triggered_at);
  return {
    text: truncate(`🔔 ${alert.rule_name}: ${alert.message}`, 3000),
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: truncate(`🔔 ${alert.rule_name}`, 150), emoji: true },
      },
      { type: "section", text: { type: "mrkdwn", text: truncate(alert.message, 2900) } },
      { type: "context", elements: [{ type: "mrkdwn", text: truncate(ctx.join("  •  "), 1900) }] },
    ],
  };
}

// Discord webhook: a single rich embed. Field values cap at 1024, description
// at 4096, title at 256.
function formatDiscord(alert) {
  const fields = [{ name: "Type", value: truncate(alert.rule_type, 1024), inline: true }];
  if (alert.session_id) {
    fields.push({ name: "Session", value: truncate(alert.session_id, 1024), inline: true });
  }
  if (alert.agent_id) {
    fields.push({ name: "Agent", value: truncate(alert.agent_id, 1024), inline: true });
  }
  return {
    username: "Claude Code Monitor",
    embeds: [
      {
        title: truncate(`🔔 ${alert.rule_name}`, 256),
        description: truncate(alert.message, 4000),
        color: 0xef4444,
        fields,
        footer: { text: "Claude Code Agent Monitor" },
        timestamp: alert.triggered_at,
      },
    ],
  };
}

// Microsoft Teams: legacy O365-connector MessageCard format, accepted by the
// classic "Incoming Webhook" connector (*.webhook.office.com). For the newer
// Power Automate "Workflows" connector, use a `generic` target with a flow.
function formatTeams(alert) {
  const facts = [{ name: "Type", value: alert.rule_type }];
  if (alert.session_id) facts.push({ name: "Session", value: alert.session_id });
  if (alert.agent_id) facts.push({ name: "Agent", value: alert.agent_id });
  facts.push({ name: "Triggered", value: alert.triggered_at });
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: "EF4444",
    summary: truncate(`${alert.rule_name}: ${alert.message}`, 200),
    title: `🔔 ${alert.rule_name}`,
    text: truncate(alert.message, 4000),
    sections: [{ facts, markdown: false }],
  };
}

// Generic endpoint: clean, stable JSON envelope. Works for custom servers,
// Zapier, n8n, Power Automate, etc.
function formatGeneric(alert) {
  return {
    event: "alert.triggered",
    source: "claude-code-agent-monitor",
    sent_at: new Date().toISOString(),
    alert: {
      id: alert.id ?? null,
      rule_id: alert.rule_id ?? null,
      rule_name: alert.rule_name,
      rule_type: alert.rule_type,
      session_id: alert.session_id ?? null,
      agent_id: alert.agent_id ?? null,
      message: alert.message,
      details: parseDetails(alert),
      triggered_at: alert.triggered_at,
    },
  };
}

function formatPayload(type, alert) {
  switch (type) {
    case "slack":
      return formatSlack(alert);
    case "discord":
      return formatDiscord(alert);
    case "teams":
      return formatTeams(alert);
    case "generic":
    default:
      return formatGeneric(alert);
  }
}

/**
 * Build the HTTP request for a target + alert: the serialized body and headers,
 * including custom headers and an optional HMAC-SHA256 signature for generic
 * targets. Exported for testing.
 */
function buildRequest(target, alert) {
  const payload = formatPayload(target.type, alert);
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "claude-code-agent-monitor/webhooks",
  };

  if (target.type === "generic" && target.headers && typeof target.headers === "object") {
    for (const [k, v] of Object.entries(target.headers)) {
      // Never let a custom header clobber Content-Type or the signature.
      if (typeof k !== "string" || typeof v !== "string") continue;
      const lower = k.toLowerCase();
      if (lower === "content-type" || lower === "x-webhook-signature") continue;
      headers[k] = v;
    }
  }

  if (target.type === "generic" && target.secret) {
    const ts = new Date().toISOString();
    const sig = crypto.createHmac("sha256", target.secret).update(`${ts}.${body}`).digest("hex");
    headers["X-Webhook-Timestamp"] = ts;
    headers["X-Webhook-Signature"] = `sha256=${sig}`;
  }

  return { url: target.url, body, headers };
}

// ── Delivery ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (t.unref) t.unref();
  });
}

async function postOnce(url, body, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (timer.unref) timer.unref();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "follow",
    });
    // Drain the body so the socket frees promptly; ignore decode errors.
    try {
      await res.text();
    } catch {
      /* body drain is best-effort */
    }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, error: null };
  } catch (err) {
    const timedOut = err?.name === "AbortError";
    return {
      ok: false,
      status: null,
      error: timedOut ? "timeout" : err?.message || "network error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function recordDelivery(target, alertId, { status, statusCode, attempts, error }) {
  try {
    stmts.insertWebhookDelivery.run(
      target.id,
      target.name,
      target.type,
      alertId == null ? null : alertId,
      status,
      statusCode == null ? null : statusCode,
      attempts,
      error == null ? null : truncate(error, 500)
    );
    stmts.pruneWebhookDeliveries.run();
  } catch (err) {
    console.warn("[WEBHOOK] delivery log write failed:", err?.message || err);
  }
}

/**
 * Deliver one alert to one target with bounded retry. Retries on transport
 * errors, HTTP 429, and 5xx; gives up immediately on other 4xx (misconfigured
 * URL / bad payload won't fix themselves). Always records the outcome and
 * never throws. Returns `{ ok, status, attempts, error }`.
 */
async function deliver(target, alert) {
  let built;
  try {
    built = buildRequest(target, alert);
  } catch (err) {
    recordDelivery(target, alert.id, {
      status: "failed",
      statusCode: null,
      attempts: 0,
      error: `payload build failed: ${err?.message || err}`,
    });
    return { ok: false, status: null, attempts: 0, error: "payload build failed" };
  }

  let attempts = 0;
  let status = null;
  let error = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const res = await postOnce(built.url, built.body, built.headers);
    status = res.status;
    error = res.error;
    if (res.ok) {
      recordDelivery(target, alert.id, {
        status: "success",
        statusCode: status,
        attempts,
        error: null,
      });
      return { ok: true, status, attempts };
    }
    const retryable = status == null || status === 429 || status >= 500;
    if (!retryable || attempts >= MAX_ATTEMPTS) break;
    await sleep(RETRY_BASE_MS * attempts);
  }

  recordDelivery(target, alert.id, {
    status: "failed",
    statusCode: status,
    attempts,
    error: error || (status ? `HTTP ${status}` : "request failed"),
  });
  return {
    ok: false,
    status,
    attempts,
    error: error || (status ? `HTTP ${status}` : "request failed"),
  };
}

/** A target receives an alert when it has no rule scope, or the alert's rule is in scope. */
function targetAppliesTo(target, alert) {
  if (!Array.isArray(target.rule_ids) || target.rule_ids.length === 0) return true;
  return target.rule_ids.includes(alert.rule_id);
}

/**
 * Fan an alert out to every enabled, in-scope target. Returns a promise that
 * settles when all deliveries finish (used by tests); callers in the alert
 * path invoke it fire-and-forget. Never rejects.
 */
function dispatchAlert(alert) {
  let targets;
  try {
    targets = loadEnabledTargets();
  } catch (err) {
    console.warn("[WEBHOOK] target load failed:", err?.message || err);
    return Promise.resolve([]);
  }
  const applicable = targets.filter((t) => {
    try {
      return targetAppliesTo(t, alert);
    } catch {
      return false;
    }
  });
  if (applicable.length === 0) return Promise.resolve([]);
  return Promise.allSettled(applicable.map((t) => deliver(t, alert)));
}

/**
 * Send a synthetic test alert to a single (already DB-loaded, un-redacted)
 * target. Awaits the result so the route can report success/failure inline.
 */
function sendTest(target) {
  const alert = {
    id: null,
    rule_id: null,
    rule_name: "Webhook test",
    rule_type: "test",
    session_id: null,
    agent_id: null,
    message: `Test notification from Claude Code Agent Monitor to "${target.name}". If you can read this, delivery works.`,
    details: { test: true, target: target.name, type: target.type },
    triggered_at: new Date().toISOString(),
  };
  return deliver(target, alert);
}

module.exports = {
  WEBHOOK_TYPES,
  invalidateWebhookCache,
  loadEnabledTargets,
  normalizeTarget,
  formatPayload,
  buildRequest,
  deliver,
  dispatchAlert,
  sendTest,
  targetAppliesTo,
};
