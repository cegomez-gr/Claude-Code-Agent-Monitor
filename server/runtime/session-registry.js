const {
  PersistencePolicy,
  RuntimeProviderName,
  RuntimeStatus,
} = require("./contracts");
const { RuntimeError, RuntimeErrorCode } = require("./errors");

const VALID_PERSISTENCE = new Set(Object.values(PersistencePolicy));
const VALID_PROVIDERS = new Set(Object.values(RuntimeProviderName));
const VALID_STATUSES = new Set(Object.values(RuntimeStatus));

function stringify(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toRecord(row) {
  if (!row) return null;
  return {
    sessionId: row.session_id,
    title: row.title || undefined,
    cwd: row.cwd || undefined,
    command: row.command,
    args: parseJson(row.args, []),
    env: parseJson(row.env, {}),
    persistence: row.persistence,
    provider: row.provider,
    providerId: row.provider_id,
    status: row.status,
    capabilities: parseJson(row.capabilities, {}),
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAttachedAt: row.last_attached_at || undefined,
    exitedAt: row.exited_at || undefined,
  };
}

function assertRequired(record, field) {
  if (record[field] == null || record[field] === "") {
    throw new RuntimeError(RuntimeErrorCode.INVALID_REQUEST, `runtime session requires ${field}`);
  }
}

function validateRecord(record) {
  for (const field of ["sessionId", "command", "persistence", "provider", "providerId", "status"]) {
    assertRequired(record, field);
  }
  if (!VALID_PERSISTENCE.has(record.persistence)) {
    throw new RuntimeError(RuntimeErrorCode.INVALID_REQUEST, "invalid runtime persistence");
  }
  if (!VALID_PROVIDERS.has(record.provider)) {
    throw new RuntimeError(RuntimeErrorCode.INVALID_REQUEST, "invalid runtime provider");
  }
  if (!VALID_STATUSES.has(record.status)) {
    throw new RuntimeError(RuntimeErrorCode.INVALID_REQUEST, "invalid runtime status");
  }
}

class SessionRegistry {
  constructor({ db } = {}) {
    this.db = db || require("../db").db;
    this.statements = {
      insert: this.db.prepare(`
        INSERT INTO runtime_sessions
          (session_id, title, cwd, command, args, env, persistence, provider, provider_id,
           status, capabilities, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      upsert: this.db.prepare(`
        INSERT INTO runtime_sessions
          (session_id, title, cwd, command, args, env, persistence, provider, provider_id,
           status, capabilities, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          title = excluded.title,
          cwd = excluded.cwd,
          command = excluded.command,
          args = excluded.args,
          env = excluded.env,
          persistence = excluded.persistence,
          provider = excluded.provider,
          provider_id = excluded.provider_id,
          status = excluded.status,
          capabilities = excluded.capabilities,
          metadata = excluded.metadata,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `),
      get: this.db.prepare("SELECT * FROM runtime_sessions WHERE session_id = ?"),
      getByProvider: this.db.prepare(
        "SELECT * FROM runtime_sessions WHERE provider = ? AND provider_id = ?"
      ),
      list: this.db.prepare("SELECT * FROM runtime_sessions ORDER BY updated_at DESC, created_at DESC"),
      listByStatus: this.db.prepare(
        "SELECT * FROM runtime_sessions WHERE status = ? ORDER BY updated_at DESC, created_at DESC"
      ),
      listByPersistence: this.db.prepare(
        "SELECT * FROM runtime_sessions WHERE persistence = ? ORDER BY updated_at DESC, created_at DESC"
      ),
      listByStatusAndPersistence: this.db.prepare(
        "SELECT * FROM runtime_sessions WHERE status = ? AND persistence = ? ORDER BY updated_at DESC, created_at DESC"
      ),
      updateStatus: this.db.prepare(`
        UPDATE runtime_sessions SET
          status = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          exited_at = CASE WHEN ? IS NOT NULL THEN ? ELSE exited_at END
        WHERE session_id = ?
      `),
      updateAttachment: this.db.prepare(`
        UPDATE runtime_sessions SET
          last_attached_at = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE session_id = ?
      `),
      updateMetadata: this.db.prepare(`
        UPDATE runtime_sessions SET
          metadata = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE session_id = ?
      `),
      remove: this.db.prepare("DELETE FROM runtime_sessions WHERE session_id = ?"),
    };
  }

  create(record) {
    validateRecord(record);
    this.statements.insert.run(...this.serialize(record));
    return this.get(record.sessionId);
  }

  upsert(record) {
    validateRecord(record);
    this.statements.upsert.run(...this.serialize(record));
    return this.get(record.sessionId);
  }

  get(sessionId) {
    return toRecord(this.statements.get.get(sessionId));
  }

  getByProvider(provider, providerId) {
    return toRecord(this.statements.getByProvider.get(provider, providerId));
  }

  list(filters = {}) {
    if (filters.status && filters.persistence) {
      return this.statements.listByStatusAndPersistence
        .all(filters.status, filters.persistence)
        .map(toRecord);
    }
    if (filters.status) return this.statements.listByStatus.all(filters.status).map(toRecord);
    if (filters.persistence) {
      return this.statements.listByPersistence.all(filters.persistence).map(toRecord);
    }
    return this.statements.list.all().map(toRecord);
  }

  updateStatus(sessionId, status, timestamps = {}) {
    if (!VALID_STATUSES.has(status)) {
      throw new RuntimeError(RuntimeErrorCode.INVALID_REQUEST, "invalid runtime status");
    }
    const exitedAt = timestamps.exitedAt || (status === RuntimeStatus.EXITED ? timestamps.now : null);
    this.statements.updateStatus.run(status, exitedAt, exitedAt, sessionId);
    return this.get(sessionId);
  }

  updateAttachment(sessionId, attachedAt) {
    this.statements.updateAttachment.run(attachedAt, sessionId);
    return this.get(sessionId);
  }

  updateMetadata(sessionId, metadata) {
    this.statements.updateMetadata.run(stringify(metadata, {}), sessionId);
    return this.get(sessionId);
  }

  remove(sessionId) {
    this.statements.remove.run(sessionId);
  }

  serialize(record) {
    return [
      record.sessionId,
      record.title || null,
      record.cwd || null,
      record.command,
      stringify(record.args, []),
      stringify(record.env, {}),
      record.persistence,
      record.provider,
      record.providerId,
      record.status,
      stringify(record.capabilities, {}),
      stringify(record.metadata, {}),
    ];
  }
}

module.exports = { SessionRegistry };
