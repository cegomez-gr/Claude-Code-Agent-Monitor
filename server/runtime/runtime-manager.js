const {
  PersistencePolicy,
  RuntimeProviderName,
  RuntimeStatus,
  createRuntimeRef,
} = require("./contracts");
const { RuntimeError, RuntimeErrorCode, normalizeRuntimeError } = require("./errors");
const { SessionRegistry } = require("./session-registry");
const { mirrorTmuxMetadata } = require("./tmux-registry");

function parseMetadata(row) {
  try {
    return JSON.parse(row.metadata || "{}");
  } catch {
    return {};
  }
}

class RuntimeManager {
  constructor({ tmuxRuntime, ptyRuntime, getSession, listLegacyTmuxSessions, registry } = {}) {
    if (!tmuxRuntime) throw new Error("RuntimeManager requires tmuxRuntime");
    this.tmuxRuntime = tmuxRuntime;
    this.ptyRuntime = ptyRuntime || null;
    this.registry = registry || new SessionRegistry();
    if (this.ptyRuntime?.setExitHandler) {
      this.ptyRuntime.setExitHandler((ref) => {
        this.registry.updateStatus(ref.sessionId, RuntimeStatus.EXITED, {
          exitedAt: new Date().toISOString(),
        });
      });
    }
    this.getSession =
      getSession ||
      ((sessionId) => {
        const { stmts } = require("../db");
        return stmts.getSession.get(sessionId);
      });
    this.listLegacyTmuxSessions =
      listLegacyTmuxSessions ||
      (() => {
        const { db } = require("../db");
        return db
          .prepare(
            "SELECT * FROM sessions WHERE metadata IS NOT NULL AND metadata LIKE '%tmux_session%'"
          )
          .all();
      });
  }

  create(request = {}) {
    if (request.provider) {
      throw new RuntimeError(RuntimeErrorCode.INVALID_REQUEST, "runtime provider is selected by RuntimeManager");
    }
    if (request.persistence === PersistencePolicy.EPHEMERAL) {
      if (!this.ptyRuntime) {
        throw new RuntimeError(RuntimeErrorCode.PROVIDER_UNAVAILABLE, "pty runtime provider unavailable");
      }
      try {
        const ref = this.ptyRuntime.create(request);
        this.registry.upsert(ref);
        return this.registry.get(ref.sessionId);
      } catch (err) {
        throw normalizeRuntimeError(err, {
          code: RuntimeErrorCode.CREATE_FAILED,
          message: "runtime create failed",
        });
      }
    }
    if (request.persistence === PersistencePolicy.PERSISTENT) {
      try {
        const ref = this.tmuxRuntime.create(request);
        this.registry.upsert(ref);
        return this.registry.get(ref.sessionId);
      } catch (err) {
        throw normalizeRuntimeError(err, {
          code: RuntimeErrorCode.CREATE_FAILED,
          message: "runtime create failed",
        });
      }
    }
    throw new RuntimeError(RuntimeErrorCode.UNSUPPORTED_PERSISTENCE, "unsupported runtime persistence");
  }

  attach(sessionId) {
    const registryRef = this.registry.get(sessionId);
    if (registryRef) {
      if (["stale", "exited", "error"].includes(registryRef.status)) {
        throw new RuntimeError(RuntimeErrorCode.NOT_ATTACHABLE, "runtime session is not attachable");
      }
      return this.attachRef({
        ...registryRef,
        ...(registryRef.provider === RuntimeProviderName.TMUX
          ? { session: this.getSession(sessionId) }
          : {}),
      });
    }

    const row = this.getSession(sessionId);
    if (!row) {
      throw new RuntimeError(RuntimeErrorCode.NOT_FOUND, "session not found");
    }

    const meta = parseMetadata(row);
    const tmuxSession = meta.tmux_session;
    if (!tmuxSession) {
      throw new RuntimeError(RuntimeErrorCode.NOT_ATTACHABLE, "no tmux session");
    }

    return this.attachRef(createRuntimeRef({
      sessionId,
      provider: RuntimeProviderName.TMUX,
      providerId: tmuxSession,
      persistence: PersistencePolicy.PERSISTENT,
      status: RuntimeStatus.RUNNING,
      capabilities: this.tmuxRuntime.capabilities,
      metadata: {
        tmux: {
          sessionName: tmuxSession,
          externallyDiscovered: true,
          dashboardOwned: false,
        },
      },
      // Legacy attach context. Registry-backed refs should replace this in a
      // later PR; it is not part of the normal frontend/API runtime contract.
      session: row,
    }));
  }

  attachRef(ref) {
    const provider = this.providerFor(ref.provider);
    try {
      const attachment = provider.attach(ref);
      this.registry.updateAttachment(ref.sessionId, new Date().toISOString());
      return attachment;
    } catch (err) {
      throw normalizeRuntimeError(err, {
        code: RuntimeErrorCode.ATTACH_FAILED,
        message: "runtime attach failed",
      });
    }
  }

  write(sessionId, data) {
    const ref = this.requireRuntimeRef(sessionId);
    this.providerFor(ref.provider).write(ref, data);
  }

  resize(sessionId, cols, rows) {
    const ref = this.requireRuntimeRef(sessionId);
    this.providerFor(ref.provider).resize(ref, cols, rows);
  }

  terminate(sessionId) {
    const ref = this.requireRuntimeRef(sessionId);
    this.providerFor(ref.provider).terminate(ref);
    this.registry.updateStatus(sessionId, RuntimeStatus.EXITED, {
      exitedAt: new Date().toISOString(),
    });
  }

  get(sessionId) {
    return this.registry.get(sessionId);
  }

  list(filters = {}) {
    return this.registry.list(filters);
  }

  requireRuntimeRef(sessionId) {
    const ref = this.registry.get(sessionId);
    if (!ref) throw new RuntimeError(RuntimeErrorCode.NOT_FOUND, "runtime session not found");
    return ref;
  }

  providerFor(providerName) {
    if (providerName === RuntimeProviderName.TMUX) return this.tmuxRuntime;
    if (providerName === RuntimeProviderName.PTY && this.ptyRuntime) return this.ptyRuntime;
    throw new RuntimeError(RuntimeErrorCode.PROVIDER_UNAVAILABLE, "runtime provider unavailable");
  }

  async reconcile() {
    const result = {
      tmux: {
        checked: 0,
        running: 0,
        stale: 0,
        imported: 0,
        skipped: 0,
      },
      pty: {
        checked: 0,
        running: 0,
        exited: 0,
        skipped: 0,
      },
    };

    const records = this.registry
      .list({ persistence: PersistencePolicy.PERSISTENT })
      .filter((record) => record.provider === RuntimeProviderName.TMUX);

    for (const record of records) {
      result.tmux.checked += 1;
      const found = await this.tmuxRuntime.exists(record.providerId);
      if (found) {
        result.tmux.running += 1;
        if (record.status !== RuntimeStatus.RUNNING) {
          this.registry.updateStatus(record.sessionId, RuntimeStatus.RUNNING);
        }
      } else if (record.status !== RuntimeStatus.EXITED) {
        result.tmux.stale += 1;
        if (record.status !== RuntimeStatus.STALE) {
          this.registry.updateStatus(record.sessionId, RuntimeStatus.STALE);
        }
      } else {
        result.tmux.skipped += 1;
      }
    }

    for (const session of this.listLegacyTmuxSessions()) {
      if (this.registry.get(session.id)) continue;
      const meta = parseMetadata(session);
      const tmuxSession = meta.tmux_session;
      if (!tmuxSession) continue;
      const mirrored = mirrorTmuxMetadata({ session, tmuxSession, registry: this.registry });
      const found = await this.tmuxRuntime.exists(tmuxSession);
      if (!found) {
        this.registry.updateStatus(mirrored.sessionId, RuntimeStatus.STALE);
        result.tmux.stale += 1;
      } else {
        result.tmux.running += 1;
      }
      result.tmux.imported += 1;
    }

    const ptyRecords = this.registry
      .list({ persistence: PersistencePolicy.EPHEMERAL })
      .filter((record) => record.provider === RuntimeProviderName.PTY);

    for (const record of ptyRecords) {
      result.pty.checked += 1;
      if ([RuntimeStatus.EXITED, RuntimeStatus.STALE, RuntimeStatus.ERROR].includes(record.status)) {
        result.pty.skipped += 1;
        continue;
      }

      const status = this.ptyRuntime?.status
        ? this.ptyRuntime.status(record)
        : RuntimeStatus.EXITED;

      if (status === RuntimeStatus.RUNNING) {
        result.pty.running += 1;
        if (record.status !== RuntimeStatus.RUNNING) {
          this.registry.updateStatus(record.sessionId, RuntimeStatus.RUNNING);
        }
      } else {
        result.pty.exited += 1;
        this.registry.updateStatus(record.sessionId, RuntimeStatus.EXITED, {
          exitedAt: new Date().toISOString(),
        });
      }
    }

    return result;
  }
}

module.exports = { RuntimeManager, RuntimeManagerError: RuntimeError };
