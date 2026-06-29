const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { PtyRuntime } = require("../runtime/providers/pty-runtime");

function mockNodePty() {
  const calls = [];
  const procs = [];
  return {
    calls,
    procs,
    spawn(command, args, options) {
      const proc = {
        pid: 1234 + procs.length,
        dataHandler: null,
        exitHandlers: [],
        writes: [],
        resizes: [],
        killed: false,
        onData(callback) {
          this.dataHandler = callback;
        },
        onExit(callback) {
          this.exitHandlers.push(callback);
        },
        write(data) {
          this.writes.push(data);
        },
        resize(cols, rows) {
          this.resizes.push({ cols, rows });
        },
        kill() {
          this.killed = true;
          for (const callback of this.exitHandlers) {
            callback({ exitCode: 0, signal: null });
          }
        },
      };
      calls.push({ command, args, options });
      procs.push(proc);
      return proc;
    },
  };
}

describe("PtyRuntime backend-only provider", () => {
  it("creates, attaches, writes, resizes, and terminates an ephemeral runtime", () => {
    const nodePty = mockNodePty();
    const exits = [];
    const runtime = new PtyRuntime({
      nodePty,
      idFactory: () => "pty-1",
      onExit(ref, exit) {
        exits.push({ ref, exit });
      },
    });

    const ref = runtime.create({
      sessionId: "session-1",
      title: "Ephemeral",
      cwd: "/tmp/project",
      persistence: "ephemeral",
      args: ["--continue"],
    });

    assert.equal(runtime.name, "pty");
    assert.equal(ref.sessionId, "session-1");
    assert.equal(ref.provider, "pty");
    assert.equal(ref.providerId, "pty-1");
    assert.equal(ref.persistence, "ephemeral");
    assert.equal(ref.status, "running");
    assert.equal(ref.capabilities.supportsCreate, true);
    assert.deepEqual(ref.metadata, { pty: { pid: 1234 } });
    assert.equal(nodePty.calls[0].command, "claude");
    assert.deepEqual(nodePty.calls[0].args, ["--continue"]);
    assert.equal(nodePty.calls[0].options.cwd, "/tmp/project");

    const attachment = runtime.attach(ref);
    let data;
    let exit;
    attachment.onData((chunk) => (data = chunk));
    attachment.onExit((payload) => (exit = payload));
    attachment.write("hello");
    attachment.resize(120, 40);
    nodePty.procs[0].dataHandler("output");
    runtime.terminate(ref);

    assert.equal(data, "output");
    assert.deepEqual(exit, { exitCode: 0, signal: null });
    assert.deepEqual(nodePty.procs[0].writes, ["hello"]);
    assert.deepEqual(nodePty.procs[0].resizes, [{ cols: 120, rows: 40 }]);
    assert.equal(nodePty.procs[0].killed, true);
    assert.equal(runtime.status(ref), "exited");
    assert.equal(exits.length, 1);
    assert.equal(exits[0].ref.status, "exited");
  });

  it("allows only ephemeral persistence and the configured Claude command", () => {
    const runtime = new PtyRuntime({ nodePty: mockNodePty() });

    assert.equal(runtime.supports({ persistence: "ephemeral" }), true);
    assert.equal(runtime.supports({ persistence: "persistent" }), false);
    assert.throws(
      () => runtime.create({ persistence: "persistent" }),
      (err) => err.code === "RUNTIME_UNSUPPORTED_PERSISTENCE"
    );
    assert.throws(
      () => runtime.create({ persistence: "ephemeral", command: "bash" }),
      (err) =>
        err.code === "RUNTIME_INVALID_REQUEST" &&
        err.message === "PtyRuntime command policy only allows the configured Claude command"
    );
  });

  it("does not rehydrate missing PTY processes before the PTY reconciliation PR", () => {
    const runtime = new PtyRuntime({ nodePty: mockNodePty() });

    assert.throws(
      () => runtime.attach({ providerId: "old-pty" }),
      (err) => err.code === "RUNTIME_NOT_ATTACHABLE" && err.message === "pty runtime is not attachable"
    );
  });
});
