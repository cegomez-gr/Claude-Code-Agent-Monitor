const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  PersistencePolicy,
  RuntimeProviderName,
  RuntimeStatus,
  RuntimeErrorCode,
  defineCapabilities,
  createRuntimeRef,
} = require("../runtime/contracts");
const { RuntimeError, normalizeRuntimeError } = require("../runtime/errors");

describe("runtime contracts", () => {
  it("defines the architecture-approved runtime values", () => {
    assert.deepEqual(Object.values(PersistencePolicy), ["ephemeral", "persistent"]);
    assert.deepEqual(Object.values(RuntimeProviderName), ["pty", "tmux"]);
    assert.deepEqual(Object.values(RuntimeStatus), ["starting", "running", "detached", "exited", "stale", "error"]);
    assert.equal(RuntimeErrorCode.ATTACH_FAILED, "RUNTIME_ATTACH_FAILED");
    assert.equal(RuntimeErrorCode.INVALID_REQUEST, "RUNTIME_INVALID_REQUEST");
  });

  it("keeps create support separate from attach capability", () => {
    const capabilities = defineCapabilities({
      attach: true,
      resize: true,
      write: true,
      persistent: true,
      supportsCreate: false,
    });

    assert.equal(capabilities.attach, true);
    assert.equal(capabilities.supportsCreate, false);
  });

  it("creates runtime refs without requiring provider-specific frontend fields", () => {
    const ref = createRuntimeRef({
      sessionId: "session-1",
      provider: "tmux",
      providerId: "claude-main",
      persistence: "persistent",
      status: "running",
      capabilities: defineCapabilities({ attach: true }),
      metadata: {
        tmux: {
          sessionName: "claude-main",
          externallyDiscovered: true,
          dashboardOwned: false,
        },
      },
    });

    assert.equal(ref.sessionId, "session-1");
    assert.equal(ref.provider, "tmux");
    assert.equal(ref.metadata.tmux.sessionName, "claude-main");
  });
});

describe("runtime errors", () => {
  it("preserves normalized runtime errors", () => {
    const err = new RuntimeError(RuntimeErrorCode.NOT_FOUND, "session not found");

    assert.equal(normalizeRuntimeError(err), err);
  });

  it("maps provider exceptions to normalized runtime errors", () => {
    const providerError = new Error("tmux attach-session failed with stderr");
    providerError.code = "ENOENT";

    const err = normalizeRuntimeError(providerError, {
      code: RuntimeErrorCode.ATTACH_FAILED,
      message: "runtime attach failed",
    });

    assert.equal(err.code, "RUNTIME_ATTACH_FAILED");
    assert.equal(err.message, "runtime attach failed");
    assert.deepEqual(err.details, { cause: "ENOENT" });
  });
});
