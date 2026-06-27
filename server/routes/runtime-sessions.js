const { Router } = require("express");
const crypto = require("crypto");
const {
  PersistencePolicy,
  RuntimeStatus,
  RuntimeErrorCode,
} = require("../runtime/contracts");
const { SessionRegistry } = require("../runtime/session-registry");
const { RuntimeManager } = require("../runtime/runtime-manager");
const { TmuxRuntime } = require("../runtime/providers/tmux-runtime");
const { PtyRuntime } = require("../runtime/providers/pty-runtime");

const router = Router();
const registry = new SessionRegistry();
let runtimeManager = null;
let runtimeManagerForTests = null;

const VALID_STATUSES = new Set(Object.values(RuntimeStatus));
const VALID_PERSISTENCE = new Set(Object.values(PersistencePolicy));
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function clampInt(raw, fallback, min, max) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function error(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function runtimeErrorStatus(code) {
  if (code === RuntimeErrorCode.NOT_FOUND) return 404;
  if (
    code === RuntimeErrorCode.INVALID_REQUEST ||
    code === RuntimeErrorCode.UNSUPPORTED_PERSISTENCE
  ) {
    return 400;
  }
  if (code === RuntimeErrorCode.PROVIDER_UNAVAILABLE) return 503;
  if (code === RuntimeErrorCode.UNSUPPORTED_OPERATION) return 501;
  return 500;
}

function getRuntimeManager() {
  if (runtimeManagerForTests) return runtimeManagerForTests;
  if (!runtimeManager) {
    runtimeManager = new RuntimeManager({
      tmuxRuntime: new TmuxRuntime(),
      ptyRuntime: new PtyRuntime({ nodePty: require("node-pty") }),
      registry,
    });
  }
  return runtimeManager;
}

function createSessionId() {
  return `runtime-${crypto.randomUUID()}`;
}

function summary(record) {
  return {
    sessionId: record.sessionId,
    title: record.title,
    cwd: record.cwd,
    command: record.command,
    args: record.args,
    persistence: record.persistence,
    status: record.status,
    capabilities: record.capabilities,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastAttachedAt: record.lastAttachedAt,
    exitedAt: record.exitedAt,
  };
}

function debugSummary(record) {
  return {
    ...summary(record),
    provider: record.provider,
    providerId: record.providerId,
    metadata: record.metadata,
  };
}

function parseFilters(req, res) {
  const filters = {};
  if (req.query.status) {
    filters.status = String(req.query.status);
    if (!VALID_STATUSES.has(filters.status)) {
      error(res, 400, RuntimeErrorCode.INVALID_REQUEST, "Invalid runtime status.");
      return null;
    }
  }
  if (req.query.persistence) {
    filters.persistence = String(req.query.persistence);
    if (!VALID_PERSISTENCE.has(filters.persistence)) {
      error(res, 400, RuntimeErrorCode.INVALID_REQUEST, "Invalid runtime persistence.");
      return null;
    }
  }
  if (typeof req.query.cwd === "string" && req.query.cwd.trim() !== "") {
    filters.cwd = req.query.cwd.trim();
  }
  return filters;
}

router.post("/", (req, res) => {
  const body = req.body || {};
  if (body.provider) {
    return error(
      res,
      400,
      RuntimeErrorCode.INVALID_REQUEST,
      "Runtime provider is selected by RuntimeManager."
    );
  }
  if (!VALID_PERSISTENCE.has(body.persistence)) {
    return error(res, 400, RuntimeErrorCode.INVALID_REQUEST, "Invalid runtime persistence.");
  }

  const sessionId = body.sessionId || createSessionId();
  const title = body.title || "Claude session";
  const cwd = body.cwd || process.cwd();
  const command = body.command || "claude";
  const args = Array.isArray(body.args) ? body.args : [];
  const env = body.env && typeof body.env === "object" && !Array.isArray(body.env) ? body.env : {};
  let insertedSession = false;
  const { stmts } = require("../db");

  if (!stmts.getSession.get(sessionId)) {
    stmts.insertSession.run(
      sessionId,
      title,
      "active",
      cwd,
      null,
      JSON.stringify({ runtime_created: true })
    );
    insertedSession = true;
  }

  try {
    const record = getRuntimeManager().create({
      sessionId,
      title,
      cwd,
      command,
      args,
      env,
      persistence: body.persistence,
    });
    res.status(201).json({ item: summary(record) });
  } catch (err) {
    if (insertedSession) {
      try {
        require("../db").db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      } catch {
        // Best-effort cleanup. The runtime error below is the user-facing failure.
      }
    }
    return error(
      res,
      runtimeErrorStatus(err.code),
      err.code || RuntimeErrorCode.PROVIDER_ERROR,
      err.message || "Runtime session create failed."
    );
  }
});

router.get("/", (req, res) => {
  const filters = parseFilters(req, res);
  if (!filters) return;

  const limit = clampInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  let records = registry.list({
    status: filters.status,
    persistence: filters.persistence,
  });
  if (filters.cwd) records = records.filter((record) => record.cwd === filters.cwd);

  const total = records.length;
  const items = records.slice(offset, offset + limit).map(summary);
  res.json({ items, total, limit, offset });
});

router.get("/:sessionId/debug", (req, res) => {
  const record = registry.get(req.params.sessionId);
  if (!record) {
    return error(res, 404, RuntimeErrorCode.NOT_FOUND, "Runtime session not found.");
  }
  res.json({ item: debugSummary(record) });
});

router.get("/:sessionId", (req, res) => {
  const record = registry.get(req.params.sessionId);
  if (!record) {
    return error(res, 404, RuntimeErrorCode.NOT_FOUND, "Runtime session not found.");
  }
  res.json({ item: summary(record) });
});

function __setRuntimeManagerForTests(manager) {
  runtimeManagerForTests = manager;
}

module.exports = router;
module.exports.__setRuntimeManagerForTests = __setRuntimeManagerForTests;
