const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { spawnTmuxAttach } = require("../../lib/terminal-attach");
const { hasTmuxSession, SAFE_TMUX, withTmuxPath } = require("../../lib/tmux");
const {
  PersistencePolicy,
  RuntimeProviderName,
  RuntimeStatus,
  defineCapabilities,
  createRuntimeRef,
} = require("../contracts");
const { RuntimeError, RuntimeErrorCode } = require("../errors");

function unsupported(method) {
  return new RuntimeError(
    RuntimeErrorCode.UNSUPPORTED_OPERATION,
    `TmuxRuntime.${method} is not implemented`
  );
}

function defaultCommand() {
  return process.env.RUNTIME_CLAUDE_COMMAND || process.env.CLAUDE_COMMAND || "claude";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function cleanRuntimeEnv(env = {}) {
  const next = { ...process.env, ...env };
  delete next.CLAUDECODE;
  delete next.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST;
  return withTmuxPath(next);
}

class TmuxRuntime {
  constructor({
    nodePty,
    hasSession = hasTmuxSession,
    execFile = execFileSync,
    idFactory = () => `tmux-${crypto.randomUUID()}`,
  } = {}) {
    this.name = RuntimeProviderName.TMUX;
    this.capabilities = defineCapabilities({
      attach: true,
      resize: true,
      write: true,
      terminate: false,
      persistent: true,
      externalAttach: true,
      supportsCreate: true,
    });
    this.nodePty = nodePty;
    this.hasSession = hasSession;
    this.execFile = execFile;
    this.idFactory = idFactory;
  }

  supports(request = {}) {
    return request.persistence === PersistencePolicy.PERSISTENT;
  }

  attach(ref) {
    if (!this.nodePty) {
      throw new RuntimeError(
        RuntimeErrorCode.PROVIDER_UNAVAILABLE,
        "TmuxRuntime.attach requires node-pty"
      );
    }
    if (!ref?.session && !ref?.cwd) throw new Error("TmuxRuntime.attach requires a session row or cwd");
    if (!ref.providerId) throw new Error("TmuxRuntime.attach requires a tmux providerId");
    const proc = spawnTmuxAttach({
      nodePty: this.nodePty,
      session: ref.session || { cwd: ref.cwd },
      tmuxSession: ref.providerId,
    });
    return {
      onData(callback) {
        proc.onData(callback);
      },
      onExit(callback) {
        proc.onExit(callback);
      },
      write(data) {
        proc.write(data);
      },
      resize(cols, rows) {
        proc.resize(cols, rows);
      },
      dispose() {
        proc.kill();
      },
    };
  }

  async exists(providerId) {
    return this.hasSession(providerId);
  }

  create(request = {}) {
    if (!this.supports(request)) {
      throw new RuntimeError(
        RuntimeErrorCode.UNSUPPORTED_PERSISTENCE,
        "TmuxRuntime only supports persistent persistence"
      );
    }
    if (request.command && request.command !== defaultCommand()) {
      throw new RuntimeError(
        RuntimeErrorCode.INVALID_REQUEST,
        "TmuxRuntime command policy only allows the configured Claude command"
      );
    }

    const providerId = request.providerId || this.idFactory();
    if (!SAFE_TMUX.test(providerId)) {
      throw new RuntimeError(RuntimeErrorCode.INVALID_REQUEST, "invalid tmux session name");
    }

    const sessionId = request.sessionId || providerId;
    const command = request.command || defaultCommand();
    const args = Array.isArray(request.args) ? request.args : [];
    const cwd = request.cwd || process.env.HOME || process.cwd();
    const shellCommand = [command, ...args].map(shellQuote).join(" ");

    try {
      this.execFile(
        "tmux",
        ["new-session", "-d", "-s", providerId, "-c", cwd, shellCommand],
        {
          timeout: 5000,
          env: cleanRuntimeEnv(request.env),
        }
      );
    } catch (err) {
      throw new RuntimeError(RuntimeErrorCode.CREATE_FAILED, "tmux session create failed", {
        cause: err?.code || err?.name || "Error",
      });
    }

    return createRuntimeRef({
      sessionId,
      provider: RuntimeProviderName.TMUX,
      providerId,
      persistence: PersistencePolicy.PERSISTENT,
      status: RuntimeStatus.RUNNING,
      capabilities: this.capabilities,
      metadata: {
        tmux: {
          sessionName: providerId,
          externallyDiscovered: false,
          dashboardOwned: true,
        },
      },
      title: request.title,
      cwd,
      command,
      args,
      env: {},
    });
  }

  terminate() {
    throw unsupported("terminate");
  }

  discover() {
    throw unsupported("discover");
  }

  reconcile() {
    throw unsupported("reconcile");
  }
}

module.exports = { TmuxRuntime, shellQuote };
