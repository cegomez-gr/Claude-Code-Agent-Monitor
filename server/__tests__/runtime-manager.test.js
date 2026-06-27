const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { RuntimeManager } = require("../runtime/runtime-manager");

function createTmuxRuntime() {
  const attachCalls = [];
  const createCalls = [];
  const liveSessions = new Set();
  return {
    attachCalls,
    createCalls,
    liveSessions,
    create(request) {
      createCalls.push(request);
      return {
        sessionId: request.sessionId,
        title: request.title,
        cwd: request.cwd,
        command: "claude",
        args: [],
        env: {},
        provider: "tmux",
        providerId: "tmux-1",
        persistence: "persistent",
        status: "running",
        capabilities: { attach: true, write: true, resize: true, persistent: true },
        metadata: { tmux: { sessionName: "tmux-1", dashboardOwned: true } },
      };
    },
    attach(ref) {
      attachCalls.push(ref);
      return { attachment: true };
    },
    async exists(providerId) {
      return liveSessions.has(providerId);
    },
  };
}

function createPtyRuntime() {
  const createCalls = [];
  const attachCalls = [];
  const writes = [];
  const resizes = [];
  const terminations = [];
  let exitHandler = null;
  return {
    createCalls,
    attachCalls,
    writes,
    resizes,
    terminations,
    setExitHandler(callback) {
      exitHandler = callback;
    },
    create(request) {
      createCalls.push(request);
      return {
        sessionId: request.sessionId,
        title: request.title,
        cwd: request.cwd,
        command: "claude",
        args: [],
        env: {},
        provider: "pty",
        providerId: "pty-1",
        persistence: "ephemeral",
        status: "running",
        capabilities: { attach: true, write: true, resize: true, terminate: true },
        metadata: { pty: { pid: 1234 } },
      };
    },
    attach(ref) {
      attachCalls.push(ref);
      return { attachment: true };
    },
    write(ref, data) {
      writes.push({ ref, data });
    },
    resize(ref, cols, rows) {
      resizes.push({ ref, cols, rows });
    },
    terminate(ref) {
      terminations.push(ref);
      exitHandler?.({ ...ref, status: "exited" }, { exitCode: 0 });
    },
  };
}

function createRegistry(ref = null) {
  const attachmentUpdates = [];
  const records = new Map(ref ? [[ref.sessionId, { ...ref }]] : []);
  const statusUpdates = [];
  return {
    attachmentUpdates,
    statusUpdates,
    get(sessionId) {
      return records.get(sessionId) || null;
    },
    list(filters = {}) {
      return Array.from(records.values()).filter((record) => {
        if (filters.persistence && record.persistence !== filters.persistence) return false;
        if (filters.status && record.status !== filters.status) return false;
        return true;
      });
    },
    upsert(record) {
      records.set(record.sessionId, { ...record });
      return records.get(record.sessionId);
    },
    updateStatus(sessionId, status) {
      const record = records.get(sessionId);
      if (!record) return null;
      record.status = status;
      statusUpdates.push({ sessionId, status });
      return record;
    },
    updateAttachment(sessionId, attachedAt) {
      attachmentUpdates.push({ sessionId, attachedAt });
    },
  };
}

describe("RuntimeManager attach-only legacy resolution", () => {
  it("resolves existing session metadata into a tmux runtime attachment", () => {
    const tmuxRuntime = createTmuxRuntime();
    const registry = createRegistry();
    const manager = new RuntimeManager({
      tmuxRuntime,
      registry,
      getSession(sessionId) {
        assert.equal(sessionId, "session-1");
        return {
          id: "session-1",
          cwd: "/tmp/project",
          metadata: JSON.stringify({ tmux_session: "claude-main" }),
        };
      },
    });

    const attachment = manager.attach("session-1");

    assert.deepEqual(attachment, { attachment: true });
    assert.equal(tmuxRuntime.attachCalls.length, 1);
    assert.deepEqual(tmuxRuntime.attachCalls[0], {
      sessionId: "session-1",
      provider: "tmux",
      providerId: "claude-main",
      persistence: "persistent",
      status: "running",
      capabilities: undefined,
      metadata: {
        tmux: {
          sessionName: "claude-main",
          externallyDiscovered: true,
          dashboardOwned: false,
        },
      },
      session: {
        id: "session-1",
        cwd: "/tmp/project",
        metadata: JSON.stringify({ tmux_session: "claude-main" }),
      },
    });
    assert.equal(registry.attachmentUpdates.length, 1);
    assert.equal(registry.attachmentUpdates[0].sessionId, "session-1");
  });

  it("attaches registry-backed tmux records before falling back to legacy metadata", () => {
    const tmuxRuntime = createTmuxRuntime();
    const registry = createRegistry({
      sessionId: "session-1",
      provider: "tmux",
      providerId: "registry-tmux",
      persistence: "persistent",
      status: "running",
      cwd: "/tmp/registry",
      capabilities: { attach: true, supportsCreate: false },
      metadata: {
        tmux: {
          sessionName: "registry-tmux",
          externallyDiscovered: true,
          dashboardOwned: false,
        },
      },
    });
    const manager = new RuntimeManager({
      tmuxRuntime,
      registry,
      getSession() {
        return {
          id: "session-1",
          cwd: "/tmp/legacy",
          metadata: JSON.stringify({ tmux_session: "legacy-tmux" }),
        };
      },
    });

    const attachment = manager.attach("session-1");

    assert.deepEqual(attachment, { attachment: true });
    assert.equal(tmuxRuntime.attachCalls.length, 1);
    assert.equal(tmuxRuntime.attachCalls[0].providerId, "registry-tmux");
    assert.equal(tmuxRuntime.attachCalls[0].session.cwd, "/tmp/legacy");
    assert.equal(registry.attachmentUpdates.length, 1);
  });

  it("does not attach stale registry-backed tmux records", () => {
    const tmuxRuntime = createTmuxRuntime();
    const manager = new RuntimeManager({
      tmuxRuntime,
      registry: createRegistry({
        sessionId: "session-1",
        provider: "tmux",
        providerId: "missing-tmux",
        persistence: "persistent",
        status: "stale",
        cwd: "/tmp/project",
      }),
      getSession() {
        return {
          id: "session-1",
          cwd: "/tmp/project",
          metadata: JSON.stringify({ tmux_session: "missing-tmux" }),
        };
      },
    });

    assert.throws(
      () => manager.attach("session-1"),
      (err) => err.code === "RUNTIME_NOT_ATTACHABLE" && err.message === "runtime session is not attachable"
    );
    assert.equal(tmuxRuntime.attachCalls.length, 0);
  });

  it("throws the legacy not-found close reason when the session is missing", () => {
    const manager = new RuntimeManager({
      tmuxRuntime: createTmuxRuntime(),
      registry: createRegistry(),
      getSession() {
        return null;
      },
    });

    assert.throws(
      () => manager.attach("missing"),
      (err) => err.code === "RUNTIME_NOT_FOUND" && err.message === "session not found"
    );
  });

  it("throws the legacy no-tmux close reason when metadata has no tmux session", () => {
    const manager = new RuntimeManager({
      tmuxRuntime: createTmuxRuntime(),
      registry: createRegistry(),
      getSession() {
        return { id: "session-1", metadata: "{}" };
      },
    });

    assert.throws(
      () => manager.attach("session-1"),
      (err) => err.code === "RUNTIME_NOT_ATTACHABLE" && err.message === "no tmux session"
    );
  });

  it("normalizes provider attach failures", () => {
    const manager = new RuntimeManager({
      tmuxRuntime: {
        capabilities: { attach: true, supportsCreate: false },
        attach() {
          throw new Error("raw tmux failure");
        },
      },
      registry: createRegistry(),
      getSession() {
        return {
          id: "session-1",
          metadata: JSON.stringify({ tmux_session: "claude-main" }),
        };
      },
    });

    assert.throws(
      () => manager.attach("session-1"),
      (err) => err.code === "RUNTIME_ATTACH_FAILED" && err.message === "runtime attach failed"
    );
  });

  it("reconciles known tmux records against live tmux sessions", async () => {
    const tmuxRuntime = createTmuxRuntime();
    tmuxRuntime.liveSessions.add("live-tmux");
    const registry = createRegistry();
    registry.upsert({
      sessionId: "live-session",
      provider: "tmux",
      providerId: "live-tmux",
      persistence: "persistent",
      status: "stale",
    });
    registry.upsert({
      sessionId: "missing-session",
      provider: "tmux",
      providerId: "missing-tmux",
      persistence: "persistent",
      status: "running",
    });
    registry.upsert({
      sessionId: "pty-session",
      provider: "pty",
      providerId: "pty-1",
      persistence: "ephemeral",
      status: "running",
    });
    const manager = new RuntimeManager({
      tmuxRuntime,
      registry,
      listLegacyTmuxSessions() {
        return [];
      },
    });

    const result = await manager.reconcile();

    assert.equal(registry.get("live-session").status, "running");
    assert.equal(registry.get("missing-session").status, "stale");
    assert.equal(registry.get("pty-session").status, "exited");
    assert.deepEqual(result.tmux, {
      checked: 2,
      running: 1,
      stale: 1,
      imported: 0,
      skipped: 0,
    });
    assert.deepEqual(result.pty, {
      checked: 1,
      running: 0,
      exited: 1,
      skipped: 0,
    });
  });

  it("marks non-rehydratable PTY records exited during reconciliation", async () => {
    const registry = createRegistry();
    registry.upsert({
      sessionId: "running-pty",
      provider: "pty",
      providerId: "pty-running-before-restart",
      persistence: "ephemeral",
      status: "running",
      command: "claude",
    });
    registry.upsert({
      sessionId: "starting-pty",
      provider: "pty",
      providerId: "pty-starting-before-restart",
      persistence: "ephemeral",
      status: "starting",
      command: "claude",
    });
    registry.upsert({
      sessionId: "already-exited-pty",
      provider: "pty",
      providerId: "pty-exited",
      persistence: "ephemeral",
      status: "exited",
      command: "claude",
    });
    const manager = new RuntimeManager({
      tmuxRuntime: createTmuxRuntime(),
      registry,
      listLegacyTmuxSessions() {
        return [];
      },
    });

    const result = await manager.reconcile();

    assert.equal(registry.get("running-pty").status, "exited");
    assert.equal(registry.get("starting-pty").status, "exited");
    assert.equal(registry.get("already-exited-pty").status, "exited");
    assert.deepEqual(result.pty, {
      checked: 3,
      running: 0,
      exited: 2,
      skipped: 1,
    });
  });

  it("preserves PTY records that are still running in the active provider", async () => {
    const registry = createRegistry();
    registry.upsert({
      sessionId: "live-pty",
      provider: "pty",
      providerId: "pty-live",
      persistence: "ephemeral",
      status: "detached",
      command: "claude",
    });
    const manager = new RuntimeManager({
      tmuxRuntime: createTmuxRuntime(),
      ptyRuntime: {
        status(ref) {
          assert.equal(ref.providerId, "pty-live");
          return "running";
        },
      },
      registry,
      listLegacyTmuxSessions() {
        return [];
      },
    });

    const result = await manager.reconcile();

    assert.equal(registry.get("live-pty").status, "running");
    assert.deepEqual(result.pty, {
      checked: 1,
      running: 1,
      exited: 0,
      skipped: 0,
    });
  });

  it("imports hook-discovered tmux metadata that lacks a runtime record", async () => {
    const tmuxRuntime = createTmuxRuntime();
    tmuxRuntime.liveSessions.add("legacy-live");
    const registry = createRegistry();
    const manager = new RuntimeManager({
      tmuxRuntime,
      registry,
      listLegacyTmuxSessions() {
        return [
          {
            id: "legacy-session",
            name: "Legacy session",
            cwd: "/tmp/legacy",
            transcript_path: "/tmp/legacy.jsonl",
            metadata: JSON.stringify({ tmux_session: "legacy-live" }),
          },
          {
            id: "legacy-missing",
            name: "Legacy missing",
            cwd: "/tmp/missing",
            metadata: JSON.stringify({ tmux_session: "legacy-missing-tmux" }),
          },
        ];
      },
    });

    const result = await manager.reconcile();

    assert.equal(registry.get("legacy-session").providerId, "legacy-live");
    assert.equal(registry.get("legacy-session").status, "running");
    assert.equal(registry.get("legacy-session").metadata.tmux.externallyDiscovered, true);
    assert.equal(registry.get("legacy-missing").providerId, "legacy-missing-tmux");
    assert.equal(registry.get("legacy-missing").status, "stale");
    assert.equal(result.tmux.imported, 2);
    assert.equal(result.tmux.running, 1);
    assert.equal(result.tmux.stale, 1);
  });

  it("creates ephemeral runtimes through PTY from persistence intent only", () => {
    const ptyRuntime = createPtyRuntime();
    const registry = createRegistry();
    const manager = new RuntimeManager({
      tmuxRuntime: createTmuxRuntime(),
      ptyRuntime,
      registry,
    });

    const ref = manager.create({
      sessionId: "ephemeral-1",
      title: "Ephemeral",
      cwd: "/tmp/project",
      persistence: "ephemeral",
    });

    assert.equal(ref.provider, "pty");
    assert.equal(ref.providerId, "pty-1");
    assert.equal(ptyRuntime.createCalls.length, 1);
    assert.equal(ptyRuntime.createCalls[0].persistence, "ephemeral");
    assert.equal(registry.get("ephemeral-1").provider, "pty");

    assert.throws(
      () => manager.create({ sessionId: "bad", persistence: "ephemeral", provider: "tmux" }),
      (err) =>
        err.code === "RUNTIME_INVALID_REQUEST" &&
        err.message === "runtime provider is selected by RuntimeManager"
    );
  });

  it("creates persistent runtimes through tmux from persistence intent only", () => {
    const tmuxRuntime = createTmuxRuntime();
    const registry = createRegistry();
    const manager = new RuntimeManager({
      tmuxRuntime,
      ptyRuntime: createPtyRuntime(),
      registry,
    });

    const ref = manager.create({
      sessionId: "persistent-1",
      title: "Persistent",
      cwd: "/tmp/project",
      persistence: "persistent",
    });

    assert.equal(ref.provider, "tmux");
    assert.equal(ref.providerId, "tmux-1");
    assert.equal(tmuxRuntime.createCalls.length, 1);
    assert.equal(tmuxRuntime.createCalls[0].persistence, "persistent");
    assert.equal(registry.get("persistent-1").provider, "tmux");
  });

  it("routes backend PTY attach, write, resize, and terminate through Runtime Manager", () => {
    const ptyRuntime = createPtyRuntime();
    const registry = createRegistry();
    registry.upsert({
      sessionId: "ephemeral-1",
      provider: "pty",
      providerId: "pty-1",
      persistence: "ephemeral",
      status: "running",
      capabilities: { attach: true, write: true, resize: true, terminate: true },
    });
    const manager = new RuntimeManager({
      tmuxRuntime: createTmuxRuntime(),
      ptyRuntime,
      registry,
    });

    assert.deepEqual(manager.attach("ephemeral-1"), { attachment: true });
    manager.write("ephemeral-1", "hello");
    manager.resize("ephemeral-1", 100, 30);
    manager.terminate("ephemeral-1");

    assert.equal(ptyRuntime.attachCalls.length, 1);
    assert.equal(ptyRuntime.writes[0].data, "hello");
    assert.deepEqual(
      { cols: ptyRuntime.resizes[0].cols, rows: ptyRuntime.resizes[0].rows },
      { cols: 100, rows: 30 }
    );
    assert.equal(ptyRuntime.terminations.length, 1);
    assert.equal(registry.get("ephemeral-1").status, "exited");
  });
});
