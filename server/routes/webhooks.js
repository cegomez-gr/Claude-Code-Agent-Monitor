/**
 * @file Express router for universal webhook targets: CRUD for outbound
 * destinations (Slack / Discord / Teams / generic HTTP), a synchronous "send
 * test" probe, and a per-target delivery log. Secrets are never returned —
 * URLs are masked and secret/header values are redacted in every response.
 * Delivery formatting and dispatch live in server/lib/webhooks.js.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const { stmts } = require("../db");
const {
  WEBHOOK_TYPES,
  invalidateWebhookCache,
  normalizeTarget,
  sendTest,
} = require("../lib/webhooks");

const router = Router();

// ── Serialization (redacted) ──────────────────────────────────────────────

// Reveal the host + last 4 chars so a user can recognize which webhook this is
// without exposing the embedded secret token.
function maskUrl(url) {
  try {
    const u = new URL(url);
    const tail = url.length > 4 ? url.slice(-4) : "";
    return `${u.protocol}//${u.host}/…${tail}`;
  } catch {
    return "…";
  }
}

// Header values can carry auth tokens — return only the keys, values masked.
function redactHeaders(headers) {
  if (!headers || typeof headers !== "object") return null;
  const keys = Object.keys(headers);
  if (keys.length === 0) return null;
  const out = {};
  for (const k of keys) out[k] = "••••";
  return out;
}

function serializeTarget(row) {
  const t = normalizeTarget(row);
  let last = null;
  try {
    last = stmts.lastWebhookDeliveryForTarget.get(t.id) || null;
  } catch {
    /* delivery log read is best-effort */
  }
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    enabled: t.enabled,
    url_preview: maskUrl(t.url),
    has_secret: !!t.secret,
    headers: t.type === "generic" ? redactHeaders(t.headers) : null,
    rule_ids: t.rule_ids && t.rule_ids.length ? t.rule_ids : null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    last_delivery: last
      ? {
          status: last.status,
          status_code: last.status_code,
          attempts: last.attempts,
          error: last.error,
          created_at: last.created_at,
        }
      : null,
  };
}

// ── Validation ────────────────────────────────────────────────────────────

function bad(res, message) {
  return res.status(400).json({ error: { code: "INVALID_INPUT", message } });
}

function validateUrl(url, type) {
  if (typeof url !== "string" || !url.trim()) return { ok: false, error: "url is required" };
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return { ok: false, error: "url must be a valid URL" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, error: "url must use http or https" };
  }
  // Slack / Discord / Teams endpoints are always https.
  if (type !== "generic" && u.protocol !== "https:") {
    return { ok: false, error: `${type} webhook URL must use https` };
  }
  return { ok: true, url: url.trim() };
}

function validateHeaders(headers) {
  if (headers == null) return { ok: true, value: null };
  if (typeof headers !== "object" || Array.isArray(headers)) {
    return { ok: false, error: "headers must be an object of string values" };
  }
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof k !== "string" || !k.trim()) {
      return { ok: false, error: "header names must be non-empty strings" };
    }
    if (typeof v !== "string") {
      return { ok: false, error: `header "${k}" value must be a string` };
    }
    out[k] = v;
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}

function validateRuleIds(ruleIds) {
  if (ruleIds == null) return { ok: true, value: null };
  if (!Array.isArray(ruleIds)) return { ok: false, error: "rule_ids must be an array" };
  for (const id of ruleIds) {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false, error: "rule_ids must be non-empty strings" };
    }
  }
  return { ok: true, value: ruleIds.length ? ruleIds : null };
}

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /api/webhooks — list targets (redacted)
router.get("/", (_req, res) => {
  res.json({ targets: stmts.listWebhookTargets.all().map(serializeTarget) });
});

// POST /api/webhooks — create a target
router.post("/", (req, res) => {
  const { name, type, url, enabled, secret, headers, rule_ids } = req.body || {};

  if (!name || typeof name !== "string" || !name.trim()) return bad(res, "name is required");
  if (!WEBHOOK_TYPES.includes(type)) {
    return bad(res, `type must be one of: ${WEBHOOK_TYPES.join(", ")}`);
  }
  const u = validateUrl(url, type);
  if (!u.ok) return bad(res, u.error);

  // secret + custom headers only apply to generic targets.
  const h = validateHeaders(type === "generic" ? headers : null);
  if (!h.ok) return bad(res, h.error);
  const r = validateRuleIds(rule_ids);
  if (!r.ok) return bad(res, r.error);

  let sec = null;
  if (type === "generic" && secret != null) {
    if (typeof secret !== "string") return bad(res, "secret must be a string");
    sec = secret.trim() || null;
  }

  const id = uuidv4();
  stmts.insertWebhookTarget.run(
    id,
    name.trim(),
    type,
    u.url,
    enabled === false ? 0 : 1,
    sec,
    h.value ? JSON.stringify(h.value) : null,
    r.value ? JSON.stringify(r.value) : null
  );
  invalidateWebhookCache();
  res.status(201).json({ target: serializeTarget(stmts.getWebhookTarget.get(id)) });
});

// PATCH /api/webhooks/:id — partial update. url/secret/headers/rule_ids are
// only changed when their key is present in the body (omit = leave as-is).
router.patch("/:id", (req, res) => {
  const existing = stmts.getWebhookTarget.get(req.params.id);
  if (!existing) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Webhook target not found" } });
  }
  const body = req.body || {};
  const { name, url, enabled, secret, headers, rule_ids } = body;

  if (name != null && (typeof name !== "string" || !name.trim())) {
    return bad(res, "name must be a non-empty string");
  }

  let urlVal = null;
  if (url != null) {
    const u = validateUrl(url, existing.type);
    if (!u.ok) return bad(res, u.error);
    urlVal = u.url;
  }

  // For each nullable-value column, a "set" flag tells SQL whether to overwrite.
  let secretSet = 0;
  let secretVal = null;
  if ("secret" in body && existing.type === "generic") {
    if (secret !== null && typeof secret !== "string")
      return bad(res, "secret must be a string or null");
    secretSet = 1;
    secretVal = secret ? String(secret).trim() || null : null;
  }

  let headersSet = 0;
  let headersVal = null;
  if ("headers" in body && existing.type === "generic") {
    const h = validateHeaders(headers);
    if (!h.ok) return bad(res, h.error);
    headersSet = 1;
    headersVal = h.value ? JSON.stringify(h.value) : null;
  }

  let ruleSet = 0;
  let ruleVal = null;
  if ("rule_ids" in body) {
    const r = validateRuleIds(rule_ids);
    if (!r.ok) return bad(res, r.error);
    ruleSet = 1;
    ruleVal = r.value ? JSON.stringify(r.value) : null;
  }

  stmts.updateWebhookTarget.run(
    name != null ? name.trim() : null,
    urlVal,
    enabled == null ? null : enabled ? 1 : 0,
    secretSet,
    secretVal,
    headersSet,
    headersVal,
    ruleSet,
    ruleVal,
    req.params.id
  );
  invalidateWebhookCache();
  res.json({ target: serializeTarget(stmts.getWebhookTarget.get(req.params.id)) });
});

// DELETE /api/webhooks/:id — delete a target (its delivery log cascades away)
router.delete("/:id", (req, res) => {
  const existing = stmts.getWebhookTarget.get(req.params.id);
  if (!existing) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Webhook target not found" } });
  }
  stmts.deleteWebhookTarget.run(req.params.id);
  invalidateWebhookCache();
  res.json({ ok: true });
});

// POST /api/webhooks/:id/test — send a synthetic alert and report the result.
// Always 200 (the request itself succeeded); `ok` carries the delivery result.
router.post("/:id/test", async (req, res) => {
  const row = stmts.getWebhookTarget.get(req.params.id);
  if (!row) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Webhook target not found" } });
  }
  const result = await sendTest(normalizeTarget(row));
  res.json({
    ok: result.ok,
    status: result.status ?? null,
    attempts: result.attempts,
    error: result.error || null,
  });
});

// GET /api/webhooks/:id/deliveries — recent delivery log for a target
router.get("/:id/deliveries", (req, res) => {
  const row = stmts.getWebhookTarget.get(req.params.id);
  if (!row) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Webhook target not found" } });
  }
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 200));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const deliveries = stmts.listWebhookDeliveriesForTarget.all(req.params.id, limit, offset);
  res.json({ deliveries, limit, offset });
});

module.exports = router;
module.exports.WEBHOOK_TYPES = WEBHOOK_TYPES;
