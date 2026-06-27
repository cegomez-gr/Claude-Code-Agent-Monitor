const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { TmuxRuntime } = require("../runtime/providers/tmux-runtime");

function mockNodePty() {
  const calls = [];
  const procs = [];
  return {
    calls,
    procs,
    spawn(command, args, options) {
      const proc = {
        dataHandler: null,
        exitHandler: null,
        writes: [],
        resizes: [],
        killed: false,
        onData(callback) {
          this.dataHandler = callback;
        },
        onExit(callback) {
          this.exitHandler = callback;
        },
        write(data) {
          this.writes.push(data);
        },
        resize(cols, rows) {
          this.resizes.push({ cols, rows });
        },
        kill() {
          this.killed = true;
        },
      };
      calls.push({ command, args, options });
      procs.push(proc);
      return proc;
    },
  };
}

describe("TmuxRuntime provider", () => {
  it("exposes tmux attach and create capabilities without enabling termination", () => {
    const runtime = new TmuxRuntime({ nodePty: mockNodePty() });

    assert.equal(runtime.name, "tmux");
    assert.deepEqual(runtime.capabilities, {
      attach: true,
      resize: true,
      write: true,
      terminate: false,
      persistent: true,
      externalAttach: true,
      supportsCreate: true,
    });
  });

  it("creates persistent tmux sessions with a safely escaped Claude command", () => {
    const calls = [];
    const runtime = new TmuxRuntime({
      nodePty: mockNodePty(),
      idFactory: () => "tmux-created",
      execFile(command, args, options) {
        calls.push({ command, args, options });
      },
    });

    const ref = runtime.create({
      sessionId: "session-1",
      title: "Persistent",
      cwd: "/tmp/project",
      persistence: "persistent",
      args: ["--continue", "quote'check"],
    });

    assert.equal(ref.sessionId, "session-1");
    assert.equal(ref.provider, "tmux");
    assert.equal(ref.providerId, "tmux-created");
    assert.equal(ref.persistence, "persistent");
    assert.equal(ref.status, "running");
    assert.equal(ref.capabilities.supportsCreate, true);
    assert.equal(ref.metadata.tmux.sessionName, "tmux-created");
    assert.equal(ref.metadata.tmux.dashboardOwned, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "tmux");
    assert.deepEqual(calls[0].args, [
      "new-session",
      "-d",
      "-s",
      "tmux-created",
      "-c",
      "/tmp/project",
      "'claude' '--continue' 'quote'\\''check'",
    ]);
    assert.equal(calls[0].options.timeout, 5000);
  });

  it("rejects non-persistent requests, unsafe tmux names, and non-Claude commands", () => {
    const runtime = new TmuxRuntime({
      nodePty: mockNodePty(),
      idFactory: () => "bad name",
      execFile() {},
    });

    assert.equal(runtime.supports({ persistence: "persistent" }), true);
    assert.equal(runtime.supports({ persistence: "ephemeral" }), false);
    assert.throws(
      () => runtime.create({ persistence: "ephemeral" }),
      (err) => err.code === "RUNTIME_UNSUPPORTED_PERSISTENCE"
    );
    assert.throws(
      () => runtime.create({ persistence: "persistent" }),
      (err) => err.code === "RUNTIME_INVALID_REQUEST" && err.message === "invalid tmux session name"
    );
    assert.throws(
      () =>
        new TmuxRuntime({ nodePty: mockNodePty(), execFile() {} }).create({
          persistence: "persistent",
          command: "bash",
        }),
      (err) =>
        err.code === "RUNTIME_INVALID_REQUEST" &&
        err.message === "TmuxRuntime command policy only allows the configured Claude command"
    );
  });

  it("attaches to an existing tmux providerId using the extracted spawn helper", () => {
    const nodePty = mockNodePty();
    const runtime = new TmuxRuntime({ nodePty });

    const attachment = runtime.attach({
      sessionId: "session-1",
      providerId: "claude-main",
      session: { cwd: "/tmp/project" },
    });

    assert.equal(nodePty.calls.length, 1);
    assert.equal(nodePty.calls[0].command, "tmux");
    assert.deepEqual(nodePty.calls[0].args, ["attach-session", "-t", "claude-main"]);
    assert.equal(nodePty.calls[0].options.cwd, "/tmp/project");

    let dataCallback;
    let exitCallback;
    attachment.onData((data) => (dataCallback = data));
    attachment.onExit((exit) => (exitCallback = exit));
    attachment.write("hello");
    attachment.resize(100, 30);
    attachment.dispose();

    const proc = nodePty.procs[0];
    proc.dataHandler("output");
    proc.exitHandler({ exitCode: 0 });
    assert.equal(dataCallback, "output");
    assert.deepEqual(exitCallback, { exitCode: 0 });
    assert.deepEqual(proc.writes, ["hello"]);
    assert.deepEqual(proc.resizes, [{ cols: 100, rows: 30 }]);
    assert.equal(proc.killed, true);
  });

  it("rejects attach refs without a session row or providerId", () => {
    const runtime = new TmuxRuntime({ nodePty: mockNodePty() });

    assert.throws(() => runtime.attach({ providerId: "claude-main" }), /session row/);
    assert.throws(() => runtime.attach({ session: { cwd: "/tmp/project" } }), /providerId/);
  });

  it("checks whether a tmux providerId exists without requiring attach", async () => {
    const seen = [];
    const runtime = new TmuxRuntime({
      hasSession(name) {
        seen.push(name);
        return name === "live-tmux";
      },
    });

    assert.equal(await runtime.exists("live-tmux"), true);
    assert.equal(await runtime.exists("missing-tmux"), false);
    assert.deepEqual(seen, ["live-tmux", "missing-tmux"]);
  });

  it("fails attach explicitly when node-pty is unavailable", () => {
    const runtime = new TmuxRuntime();

    assert.throws(
      () => runtime.attach({ providerId: "claude-main", session: { cwd: "/tmp/project" } }),
      (err) =>
        err.code === "RUNTIME_PROVIDER_UNAVAILABLE" &&
        err.message === "TmuxRuntime.attach requires node-pty"
    );
  });

  it("keeps future lifecycle operations explicitly unsupported", () => {
    const runtime = new TmuxRuntime({ nodePty: mockNodePty() });

    for (const method of ["terminate", "discover", "reconcile"]) {
      assert.throws(
        () => runtime[method](),
        (err) =>
          err.code === "RUNTIME_UNSUPPORTED_OPERATION" &&
          err.message === `TmuxRuntime.${method} is not implemented`
      );
    }
  });
});
