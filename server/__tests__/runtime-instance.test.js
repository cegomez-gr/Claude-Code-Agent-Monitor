/**
 * @file Tests for the shared RuntimeManager singleton.
 *
 * Regression guard: dashboard-created ephemeral (PTY) sessions used to show a
 * blank terminal because the create API route and the terminal WebSocket each
 * built their own RuntimeManager. PtyRuntime keeps live PTY handles in an
 * in-memory Map, so attach over the WebSocket could not find a process created
 * by the route's separate instance — and the WebSocket's manager lacked a
 * PtyRuntime entirely. These tests pin the single-instance contract.
 */

const { test } = require("node:test");
const assert = require("node:assert");
const {
  getRuntimeManager,
  setRuntimeManagerForTests,
  resetRuntimeManager,
} = require("../runtime/runtime-instance");

let nodePtyAvailable = false;
try {
  require("node-pty");
  nodePtyAvailable = true;
} catch {
  nodePtyAvailable = false;
}

test("getRuntimeManager returns a stable singleton", () => {
  resetRuntimeManager();
  const first = getRuntimeManager();
  const second = getRuntimeManager();
  assert.strictEqual(first, second, "every caller must share one RuntimeManager");
  resetRuntimeManager();
});

test(
  "singleton wires both providers so create and attach share one PtyRuntime",
  { skip: nodePtyAvailable ? false : "node-pty not installed" },
  () => {
    resetRuntimeManager();
    const manager = getRuntimeManager();
    assert.ok(manager.tmuxRuntime, "tmux provider must be wired");
    assert.ok(manager.ptyRuntime, "pty provider must be wired for ephemeral attach");
    assert.strictEqual(manager.ptyRuntime.name, "pty");
    // The same PtyRuntime instance backs both the create route and the
    // terminal WebSocket, so an in-memory PTY handle created via the API is
    // attachable over the socket.
    assert.strictEqual(getRuntimeManager().ptyRuntime, manager.ptyRuntime);
    resetRuntimeManager();
  }
);

test("setRuntimeManagerForTests overrides; resetRuntimeManager restores production wiring", () => {
  const fake = { sentinel: true };
  setRuntimeManagerForTests(fake);
  assert.strictEqual(getRuntimeManager(), fake, "override must take effect");
  resetRuntimeManager();
  assert.notStrictEqual(getRuntimeManager(), fake, "reset must drop the override");
  resetRuntimeManager();
});
