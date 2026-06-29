/**
 * @file Shared RuntimeManager singleton.
 *
 * The dashboard must orchestrate every terminal runtime through a single
 * Runtime Manager (ADR-001) backed by one Session Registry (ADR-004). Before
 * this module, the create API route, the terminal WebSocket, and startup
 * reconciliation each built their own RuntimeManager. The registry is shared
 * through SQLite, but provider instances are not: PtyRuntime keeps live PTY
 * handles in an in-memory Map, so the instance that creates an ephemeral
 * session is the only one that can attach to it. The WebSocket also lacked a
 * PtyRuntime entirely, so attaching a dashboard-created ephemeral session
 * failed with PROVIDER_UNAVAILABLE (terminal stayed blank).
 *
 * This module exposes one lazily-initialized RuntimeManager wired with both
 * providers and a shared registry, so create and attach operate on the same
 * provider instances.
 */

const { RuntimeManager } = require("./runtime-manager");
const { TmuxRuntime } = require("./providers/tmux-runtime");
const { PtyRuntime } = require("./providers/pty-runtime");
const { SessionRegistry } = require("./session-registry");

let instance = null;
let testOverride = null;

// node-pty is an optional dependency. Without it neither provider can attach
// (TmuxRuntime.attach and PtyRuntime both require node-pty), so the terminal
// tab is unavailable — the same degraded behavior as before this module.
function loadNodePty() {
  try {
    return require("node-pty");
  } catch {
    return null;
  }
}

function getRuntimeManager() {
  if (testOverride) return testOverride;
  if (!instance) {
    const nodePty = loadNodePty();
    instance = new RuntimeManager({
      tmuxRuntime: new TmuxRuntime({ nodePty }),
      ptyRuntime: nodePty ? new PtyRuntime({ nodePty }) : null,
      registry: new SessionRegistry(),
    });
  }
  return instance;
}

// Lets tests inject a manager (with mocked providers/registry) without
// touching the lazy production singleton. Pass null to clear.
function setRuntimeManagerForTests(manager) {
  testOverride = manager;
}

// Drops the cached production instance. Intended for test isolation.
function resetRuntimeManager() {
  instance = null;
  testOverride = null;
}

module.exports = { getRuntimeManager, setRuntimeManagerForTests, resetRuntimeManager };
