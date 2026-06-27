const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnTmuxAttach } = require("../lib/terminal-attach");

function mockNodePty() {
  const calls = [];
  return {
    calls,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { pid: 1234 };
    },
  };
}

describe("spawnTmuxAttach", () => {
  it("spawns tmux attach-session with the existing terminal defaults", () => {
    const nodePty = mockNodePty();
    const proc = spawnTmuxAttach({
      nodePty,
      session: { cwd: "/tmp/project" },
      tmuxSession: "claude-main",
    });

    assert.deepEqual(proc, { pid: 1234 });
    assert.equal(nodePty.calls.length, 1);

    const call = nodePty.calls[0];
    assert.equal(call.command, "tmux");
    assert.deepEqual(call.args, ["attach-session", "-t", "claude-main"]);
    assert.equal(call.options.name, "xterm-256color");
    assert.equal(call.options.cols, 220);
    assert.equal(call.options.rows, 50);
    assert.equal(call.options.cwd, "/tmp/project");
    assert.equal(call.options.env.TERM, "xterm-256color");
    assert.match(call.options.env.PATH, /\/opt\/homebrew\/bin/);
    assert.match(call.options.env.PATH, /\/usr\/local\/bin/);
  });

  it("falls back to HOME when the session has no cwd", () => {
    const nodePty = mockNodePty();
    const originalHome = process.env.HOME;
    process.env.HOME = "/Users/tester";

    try {
      spawnTmuxAttach({
        nodePty,
        session: {},
        tmuxSession: "claude-main",
      });
    } finally {
      process.env.HOME = originalHome;
    }

    assert.equal(nodePty.calls[0].options.cwd, "/Users/tester");
  });
});
