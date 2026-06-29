const PersistencePolicy = Object.freeze({
  EPHEMERAL: "ephemeral",
  PERSISTENT: "persistent",
});

const RuntimeProviderName = Object.freeze({
  PTY: "pty",
  TMUX: "tmux",
});

const RuntimeStatus = Object.freeze({
  STARTING: "starting",
  RUNNING: "running",
  DETACHED: "detached",
  EXITED: "exited",
  STALE: "stale",
  ERROR: "error",
});

const RuntimeErrorCode = Object.freeze({
  PROVIDER_UNAVAILABLE: "RUNTIME_PROVIDER_UNAVAILABLE",
  NOT_FOUND: "RUNTIME_NOT_FOUND",
  NOT_ATTACHABLE: "RUNTIME_NOT_ATTACHABLE",
  ATTACH_FAILED: "RUNTIME_ATTACH_FAILED",
  CREATE_FAILED: "RUNTIME_CREATE_FAILED",
  ALREADY_EXISTS: "RUNTIME_ALREADY_EXISTS",
  PERMISSION_DENIED: "RUNTIME_PERMISSION_DENIED",
  INVALID_REQUEST: "RUNTIME_INVALID_REQUEST",
  UNSUPPORTED_PERSISTENCE: "RUNTIME_UNSUPPORTED_PERSISTENCE",
  UNSUPPORTED_OPERATION: "RUNTIME_UNSUPPORTED_OPERATION",
  PROVIDER_ERROR: "RUNTIME_PROVIDER_ERROR",
});

function defineCapabilities({
  attach = false,
  resize = false,
  write = false,
  terminate = false,
  persistent = false,
  externalAttach = false,
  supportsCreate = false,
} = {}) {
  return Object.freeze({
    attach,
    resize,
    write,
    terminate,
    persistent,
    externalAttach,
    supportsCreate,
  });
}

function createRuntimeRef({
  sessionId,
  provider,
  providerId,
  persistence,
  status,
  capabilities,
  metadata,
  ...internal
}) {
  return {
    sessionId,
    provider,
    providerId,
    persistence,
    status,
    capabilities,
    metadata: metadata || {},
    ...internal,
  };
}

module.exports = {
  PersistencePolicy,
  RuntimeProviderName,
  RuntimeStatus,
  RuntimeErrorCode,
  defineCapabilities,
  createRuntimeRef,
};
