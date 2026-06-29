const { describe, it, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");

const TEST_DB = path.join(os.tmpdir(), `session-registry-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const { db, stmts } = require("../db");
const { SessionRegistry } = require("../runtime/session-registry");
const { defineCapabilities } = require("../runtime/contracts");
const { mirrorTmuxMetadata } = require("../runtime/tmux-registry");

const registry = new SessionRegistry({ db });

function resetRows() {
  db.prepare("DELETE FROM runtime_sessions").run();
  db.prepare("DELETE FROM sessions").run();
}

function insertDashboardSession(id, metadata = {}) {
  stmts.insertSession.run(
    id,
    `Session ${id}`,
    "active",
    "/tmp/project",
    "claude-sonnet-4-5",
    JSON.stringify(metadata)
  );
}

function runtimeRecord(overrides = {}) {
  return {
    sessionId: "session-1",
    title: "Session one",
    cwd: "/tmp/project",
    command: "claude",
    args: [],
    env: {},
    persistence: "persistent",
    provider: "tmux",
    providerId: "claude-main",
    status: "running",
    capabilities: defineCapabilities({
      attach: true,
      resize: true,
      write: true,
      persistent: true,
      externalAttach: true,
      supportsCreate: false,
    }),
    metadata: {
      tmux: {
        sessionName: "claude-main",
        externallyDiscovered: true,
        dashboardOwned: false,
      },
    },
    ...overrides,
  };
}

describe("SessionRegistry storage skeleton", () => {
  beforeEach(resetRows);

  after(() => {
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.unlinkSync(TEST_DB + suffix);
      } catch {}
    }
  });

  it("creates and reads runtime-neutral records with nested provider metadata", () => {
    insertDashboardSession("session-1", { tmux_session: "claude-main" });

    const created = registry.create(runtimeRecord());

    assert.equal(created.sessionId, "session-1");
    assert.equal(created.provider, "tmux");
    assert.equal(created.providerId, "claude-main");
    assert.equal(created.persistence, "persistent");
    assert.equal(created.status, "running");
    assert.equal(created.capabilities.attach, true);
    assert.equal(created.capabilities.supportsCreate, false);
    assert.deepEqual(created.metadata, {
      tmux: {
        sessionName: "claude-main",
        externallyDiscovered: true,
        dashboardOwned: false,
      },
    });
    assert.ok(created.createdAt);
    assert.ok(created.updatedAt);
  });

  it("upserts, gets by provider, and lists by filters", () => {
    insertDashboardSession("session-1");
    insertDashboardSession("session-2");

    registry.upsert(runtimeRecord({ status: "running" }));
    registry.upsert(
      runtimeRecord({
        sessionId: "session-2",
        providerId: "pty-1",
        provider: "pty",
        persistence: "ephemeral",
        status: "starting",
        capabilities: defineCapabilities({ attach: true, write: true, resize: true }),
        metadata: { pty: { pid: 1234 } },
      })
    );
    registry.upsert(runtimeRecord({ title: "Updated", status: "detached" }));

    assert.equal(registry.get("session-1").title, "Updated");
    assert.equal(registry.get("session-1").status, "detached");
    assert.equal(registry.getByProvider("pty", "pty-1").sessionId, "session-2");
    assert.deepEqual(
      registry.list({ persistence: "persistent" }).map((record) => record.sessionId),
      ["session-1"]
    );
    assert.deepEqual(
      registry.list({ status: "starting", persistence: "ephemeral" }).map((record) => record.sessionId),
      ["session-2"]
    );
  });

  it("updates status, attachment timestamp, and metadata", () => {
    insertDashboardSession("session-1");
    registry.create(runtimeRecord());

    const status = registry.updateStatus("session-1", "exited", {
      exitedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(status.status, "exited");
    assert.equal(status.exitedAt, "2026-01-01T00:00:00.000Z");

    const attached = registry.updateAttachment("session-1", "2026-01-01T00:01:00.000Z");
    assert.equal(attached.lastAttachedAt, "2026-01-01T00:01:00.000Z");

    const metadata = registry.updateMetadata("session-1", {
      tmux: { sessionName: "claude-main", paneId: "%1" },
    });
    assert.deepEqual(metadata.metadata, {
      tmux: { sessionName: "claude-main", paneId: "%1" },
    });
  });

  it("rejects invalid persistence, provider, and status values", () => {
    insertDashboardSession("session-1");

    assert.throws(
      () => registry.create(runtimeRecord({ persistence: "durable" })),
      /invalid runtime persistence/
    );
    assert.throws(() => registry.create(runtimeRecord({ provider: "docker" })), /invalid runtime provider/);
    assert.throws(() => registry.create(runtimeRecord({ status: "paused" })), /invalid runtime status/);
  });

  it("cascades with dashboard sessions and preserves legacy session metadata while present", () => {
    insertDashboardSession("session-1", { tmux_session: "claude-main" });
    registry.create(runtimeRecord());

    const beforeDelete = stmts.getSession.get("session-1");
    assert.equal(JSON.parse(beforeDelete.metadata).tmux_session, "claude-main");

    db.prepare("DELETE FROM sessions WHERE id = ?").run("session-1");

    assert.equal(registry.get("session-1"), null);
  });

  it("mirrors hook-discovered tmux metadata additively into runtime registry", () => {
    insertDashboardSession("session-1", { tmux_session: "claude-main" });
    const session = stmts.getSession.get("session-1");

    const mirrored = mirrorTmuxMetadata({
      session,
      tmuxSession: "claude-main",
      registry,
    });

    assert.equal(mirrored.sessionId, "session-1");
    assert.equal(mirrored.provider, "tmux");
    assert.equal(mirrored.providerId, "claude-main");
    assert.equal(mirrored.persistence, "persistent");
    assert.equal(mirrored.status, "running");
    assert.equal(mirrored.capabilities.attach, true);
    assert.equal(mirrored.capabilities.supportsCreate, false);
    assert.deepEqual(mirrored.metadata.tmux, {
      sessionName: "claude-main",
      externallyDiscovered: true,
      dashboardOwned: false,
    });

    const legacy = stmts.getSession.get("session-1");
    assert.equal(JSON.parse(legacy.metadata).tmux_session, "claude-main");
  });
});
