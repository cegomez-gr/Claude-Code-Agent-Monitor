/**
 * @file WebSocket functionalities for real-time communication with clients, including connection management, heartbeat for detecting dead connections, and broadcasting messages to all connected clients.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { WebSocketServer } = require("ws");
const { isHostAllowed, isWebSocketAuthorized } = require("./lib/security");

let wss = null;

function initWebSocket(server) {
  // Both the main (/ws) and terminal (/terminal/:sessionId) sockets are routed
  // by a single upgrade handler below (see server.on("upgrade")). They use
  // noServer mode because the ws `path` option only matches exactly — a
  // {server, path:"/terminal"} WSS never sees "/terminal/<id>", which is why
  // the terminal upgrade was being rejected with 400.
  wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
  });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("error", (err) => {
      // Log but don't crash — client disconnects are normal
      if (err.code !== "ECONNRESET") {
        console.warn("[WS] client error:", err.code || err.message);
      }
    });
  });

  // Heartbeat every 30s to detect dead connections
  const interval = setInterval(() => {
    if (!wss) {
      clearInterval(interval);
      return;
    }
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  interval.unref();

  wss.on("close", () => {
    clearInterval(interval);
  });

  // PTY WebSocket for terminal tab (/terminal/:sessionId)
  let nodePty = null;
  try {
    nodePty = require("node-pty");
  } catch {}

  let ptyWss = null;
  if (nodePty) {
    ptyWss = new WebSocketServer({
      noServer: true,
      maxPayload: 256 * 1024,
    });

    ptyWss.on("connection", (ws, req) => {
      const sessionId = (req.url || "").replace(/^\/terminal\//, "").split("?")[0];
      if (!sessionId) {
        ws.close(4404, "missing sessionId");
        return;
      }

      let ptyProc = null;
      try {
        const { stmts } = require("./db");
        const row = stmts.getSession.get(sessionId);
        if (!row) {
          ws.close(4404, "session not found");
          return;
        }
        let meta = {};
        try {
          meta = JSON.parse(row.metadata || "{}");
        } catch {}
        const tmuxSession = meta.tmux_session;
        if (!tmuxSession) {
          ws.close(4404, "no tmux session");
          return;
        }

        // Augment PATH with the Homebrew bin dirs: the server is often launched
        // from a GUI/mise context whose PATH can't find tmux, which would make
        // this spawn fail with ENOENT even after the session name was captured.
        const { withTmuxPath } = require("./lib/tmux");
        ptyProc = nodePty.spawn("tmux", ["attach-session", "-t", tmuxSession], {
          name: "xterm-256color",
          cols: 220,
          rows: 50,
          cwd: row.cwd || process.env.HOME,
          env: withTmuxPath({ ...process.env, TERM: "xterm-256color" }),
        });

        ptyProc.onData((data) => {
          if (ws.readyState === ws.OPEN) ws.send(data);
        });
        ptyProc.onExit(() => ws.close(1000));

        ws.on("message", (msg) => {
          try {
            const parsed = JSON.parse(msg.toString());
            if (parsed.type === "resize") ptyProc.resize(parsed.cols, parsed.rows);
            else ptyProc.write(msg.toString());
          } catch {
            ptyProc.write(typeof msg === "string" ? msg : msg.toString());
          }
        });
      } catch (err) {
        console.error("[PTY] spawn error:", err.message);
        ws.close(4500, "pty error");
        return;
      }

      ws.on("close", () => {
        try {
          ptyProc?.kill();
        } catch {}
      });
      ws.on("error", (err) => {
        if (err.code !== "ECONNRESET") console.warn("[PTY] ws error:", err.message);
      });
    });
  } else {
    console.warn("[PTY] node-pty not installed — terminal tab will be disabled. Run: npm install");
  }

  // Single upgrade router for both WS endpoints. Express middleware doesn't run
  // on upgrades, so enforce the Host allowlist (anti DNS-rebinding) and optional
  // token (GHSA-gr74-4xfh-6jw9) here before routing by path. Routing by prefix
  // is what lets "/terminal/<sessionId>" reach the PTY server.
  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url || "").split("?")[0];
    const isWsPath = pathname === "/ws";
    const isTermPath = !!ptyWss && pathname.startsWith("/terminal/");
    if (!isWsPath && !isTermPath) {
      socket.destroy();
      return;
    }
    if (!isHostAllowed(req.headers.host)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!isWebSocketAuthorized(req)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const target = isWsPath ? wss : ptyWss;
    target.handleUpgrade(req, socket, head, (ws) => target.emit("connection", ws, req));
  });

  return wss;
}

function broadcast(type, data) {
  if (!wss) return;
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(message);
      } catch {
        // Client closed between readyState check and send — safe to ignore
      }
    }
  });
}

function getConnectionCount() {
  if (!wss) return 0;
  let count = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) count++;
  });
  return count;
}

module.exports = { initWebSocket, broadcast, getConnectionCount };
