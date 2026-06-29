const crypto = require("crypto");
const {
  PersistencePolicy,
  RuntimeProviderName,
  RuntimeStatus,
  defineCapabilities,
  createRuntimeRef,
} = require("../contracts");
const { RuntimeError, RuntimeErrorCode } = require("../errors");

function defaultCommand() {
  return process.env.RUNTIME_CLAUDE_COMMAND || process.env.CLAUDE_COMMAND || "claude";
}

function cleanRuntimeEnv(env = {}) {
  const next = { ...process.env, ...env };
  delete next.CLAUDECODE;
  delete next.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST;
  return next;
}

class PtyRuntime {
  constructor({ nodePty, idFactory = () => `pty-${crypto.randomUUID()}`, onExit = null } = {}) {
    if (!nodePty) throw new Error("PtyRuntime requires node-pty");
    this.name = RuntimeProviderName.PTY;
    this.capabilities = defineCapabilities({
      attach: true,
      resize: true,
      write: true,
      terminate: true,
      persistent: false,
      externalAttach: false,
      supportsCreate: true,
    });
    this.nodePty = nodePty;
    this.idFactory = idFactory;
    this.onExit = onExit;
    this.processes = new Map();
  }

  setExitHandler(onExit) {
    this.onExit = onExit;
  }

  supports(request = {}) {
    return request.persistence === PersistencePolicy.EPHEMERAL;
  }

  create(request = {}) {
    if (!this.supports(request)) {
      throw new RuntimeError(
        RuntimeErrorCode.UNSUPPORTED_PERSISTENCE,
        "PtyRuntime only supports ephemeral persistence"
      );
    }
    if (request.command && request.command !== defaultCommand()) {
      throw new RuntimeError(
        RuntimeErrorCode.INVALID_REQUEST,
        "PtyRuntime command policy only allows the configured Claude command"
      );
    }

    const providerId = request.providerId || this.idFactory();
    const sessionId = request.sessionId || providerId;
    const command = request.command || defaultCommand();
    const args = Array.isArray(request.args) ? request.args : [];
    const cwd = request.cwd || process.env.HOME || process.cwd();
    const env = cleanRuntimeEnv(request.env);
    const proc = this.nodePty.spawn(command, args, {
      name: "xterm-256color",
      cols: request.cols || 220,
      rows: request.rows || 50,
      cwd,
      env: { ...env, TERM: "xterm-256color" },
    });

    const state = {
      proc,
      ref: createRuntimeRef({
        sessionId,
        provider: RuntimeProviderName.PTY,
        providerId,
        persistence: PersistencePolicy.EPHEMERAL,
        status: RuntimeStatus.RUNNING,
        capabilities: this.capabilities,
        metadata: {
          pty: {
            pid: proc.pid,
          },
        },
        title: request.title,
        cwd,
        command,
        args,
        env: {},
      }),
    };

    proc.onExit((exit) => {
      state.exit = exit;
      state.ref = {
        ...state.ref,
        status: RuntimeStatus.EXITED,
      };
      this.processes.delete(providerId);
      if (this.onExit) this.onExit(state.ref, exit);
    });

    this.processes.set(providerId, state);
    return state.ref;
  }

  attach(ref) {
    const state = this.processes.get(ref?.providerId);
    if (!state) {
      // PTY handles are in-memory only. Startup reconciliation in a later PR
      // should mark old PTY registry records stale/exited rather than rehydrate.
      throw new RuntimeError(RuntimeErrorCode.NOT_ATTACHABLE, "pty runtime is not attachable");
    }
    const proc = state.proc;
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
      dispose() {},
    };
  }

  write(ref, data) {
    this.attach(ref).write(data);
  }

  resize(ref, cols, rows) {
    this.attach(ref).resize(cols, rows);
  }

  terminate(ref) {
    const state = this.processes.get(ref?.providerId);
    if (!state) return;
    state.proc.kill();
    state.ref = {
      ...state.ref,
      status: RuntimeStatus.EXITED,
    };
    this.processes.delete(ref.providerId);
  }

  status(ref) {
    const state = this.processes.get(ref?.providerId);
    return state?.ref.status || RuntimeStatus.EXITED;
  }
}

module.exports = { PtyRuntime, cleanRuntimeEnv };
