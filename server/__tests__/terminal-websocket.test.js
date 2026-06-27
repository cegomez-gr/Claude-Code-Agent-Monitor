/**
 * @file Regression coverage for the current embedded terminal websocket.
 *
 * PR-1 manual QA checklist:
 * 1. Create a tmux session manually.
 * 2. Start Claude inside that tmux session so hook metadata records
 *    `metadata.tmux_session` on the dashboard session.
 * 3. Open the dashboard session detail page.
 * 4. Confirm the Terminal tab appears from the existing metadata.
 * 5. Type in the terminal and confirm input reaches the attached tmux session.
 * 6. Resize the browser/terminal and confirm the attached terminal resizes.
 * 7. Close the browser terminal and confirm the tmux session remains alive.
 *
 * These automated tests intentionally lock down today's behavior before any
 * Runtime Manager or Runtime Provider extraction happens.
 */

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const Module = require("module");
const WebSocket = require("ws");

const websocketPath = require.resolve("../websocket");
const runtimeManagerPath = require.resolve("../runtime/runtime-manager");
const sessionRegistryPath = require.resolve("../runtime/session-registry");

function once(target, event) {
  return new Promise((resolve, reject) => {
    const onEvent = (...args) => {
      cleanup();
      resolve(args);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      target.off(event, onEvent);
      target.off("error", onError);
    };
    target.once(event, onEvent);
    target.once("error", onError);
  });
}

function waitFor(predicate, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > 1000) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function createMockPty() {
  const processes = [];
  const spawnCalls = [];

  return {
    processes,
    spawnCalls,
    module: {
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
          emitData(data) {
            this.dataHandler?.(data);
          },
          emitExit(exit = { exitCode: 0 }) {
            this.exitHandler?.(exit);
          },
        };
        spawnCalls.push({ command, args, options, proc });
        processes.push(proc);
        return proc;
      },
    },
  };
}

async function withTerminalServer({ rows }, run) {
  const mockPty = createMockPty();
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "node-pty") return mockPty.module;
    if (request === "./session-registry" && parent?.filename === runtimeManagerPath) {
      return {
        SessionRegistry: class MockSessionRegistry {
          get() {
            return null;
          }
          updateAttachment() {}
        },
      };
    }
    if (request === "../db" && parent?.filename === runtimeManagerPath) {
      return {
        stmts: {
          getSession: {
            get(sessionId) {
              return rows[sessionId] || null;
            },
          },
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[websocketPath];
  delete require.cache[runtimeManagerPath];
  delete require.cache[sessionRegistryPath];
  const { initWebSocket } = require("../websocket");
  const server = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });

  try {
    initWebSocket(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    await run({ port, mockPty });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Module._load = originalLoad;
    delete require.cache[websocketPath];
    delete require.cache[runtimeManagerPath];
    delete require.cache[sessionRegistryPath];
  }
}

function connectTerminal(port, sessionId) {
  return new WebSocket(`ws://127.0.0.1:${port}/terminal/${encodeURIComponent(sessionId)}`);
}

describe("terminal websocket tmux attach regression", () => {
  afterEach(() => {
    delete process.env.DASHBOARD_TOKEN;
  });

  it("attaches to metadata.tmux_session and bridges output, raw input, resize, and close", async () => {
    await withTerminalServer(
      {
        rows: {
          "session-1": {
            id: "session-1",
            cwd: "/tmp/project",
            metadata: JSON.stringify({ tmux_session: "claude-main" }),
          },
        },
      },
      async ({ port, mockPty }) => {
        const ws = connectTerminal(port, "session-1");
        await once(ws, "open");

        assert.equal(mockPty.spawnCalls.length, 1);
        const spawnCall = mockPty.spawnCalls[0];
        assert.equal(spawnCall.command, "tmux");
        assert.deepEqual(spawnCall.args, ["attach-session", "-t", "claude-main"]);
        assert.equal(spawnCall.options.name, "xterm-256color");
        assert.equal(spawnCall.options.cols, 220);
        assert.equal(spawnCall.options.rows, 50);
        assert.equal(spawnCall.options.cwd, "/tmp/project");
        assert.equal(spawnCall.options.env.TERM, "xterm-256color");
        assert.match(spawnCall.options.env.PATH, /\/opt\/homebrew\/bin/);
        assert.match(spawnCall.options.env.PATH, /\/usr\/local\/bin/);

        const proc = spawnCall.proc;
        ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 33 }));
        await waitFor(() => proc.resizes.length === 1, "resize forwarding");
        assert.deepEqual(proc.resizes[0], { cols: 120, rows: 33 });

        ws.send("echo hello\n");
        await waitFor(() => proc.writes.length === 1, "raw input forwarding");
        assert.equal(proc.writes[0], "echo hello\n");

        const messagePromise = once(ws, "message");
        proc.emitData("tmux output");
        const [message] = await messagePromise;
        assert.equal(message.toString(), "tmux output");

        ws.close(1000);
        await waitFor(() => proc.killed, "attach process cleanup on websocket close");
      }
    );
  });

  it("closes with 4404 and does not spawn tmux when the session is missing", async () => {
    await withTerminalServer({ rows: {} }, async ({ port, mockPty }) => {
      const ws = connectTerminal(port, "missing-session");
      const [code, reason] = await once(ws, "close");

      assert.equal(code, 4404);
      assert.equal(reason.toString(), "session not found");
      assert.equal(mockPty.spawnCalls.length, 0);
    });
  });

  it("closes with 4404 and does not spawn tmux when tmux metadata is absent", async () => {
    await withTerminalServer(
      {
        rows: {
          "session-no-tmux": {
            id: "session-no-tmux",
            cwd: "/tmp/project",
            metadata: JSON.stringify({}),
          },
        },
      },
      async ({ port, mockPty }) => {
        const ws = connectTerminal(port, "session-no-tmux");
        const [code, reason] = await once(ws, "close");

        assert.equal(code, 4404);
        assert.equal(reason.toString(), "no tmux session");
        assert.equal(mockPty.spawnCalls.length, 0);
      }
    );
  });
});
