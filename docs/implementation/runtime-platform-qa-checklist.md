# Runtime Platform QA Checklist

## Automated Coverage

Run before release:

```bash
rtk node --test --test-reporter=dot server/__tests__/*.test.js
cd client && npm test
cd client && npm run build
```

Coverage expected from the Runtime Platform PR sequence:

- Runtime contracts: `server/__tests__/runtime-contracts.test.js`
- RuntimeManager provider selection and lifecycle delegation:
  `server/__tests__/runtime-manager.test.js`
- SessionRegistry storage and validation:
  `server/__tests__/session-registry.test.js`
- TmuxRuntime attach/create behavior:
  `server/__tests__/tmux-runtime.test.js`
- PtyRuntime create/attach/write/resize/terminate behavior:
  `server/__tests__/pty-runtime.test.js`
- Terminal websocket protocol:
  `server/__tests__/terminal-websocket.test.js`
- Runtime session API:
  `server/__tests__/api.test.js`
- Frontend runtime create API contract:
  `client/src/lib/__tests__/api.runtimeSessions.test.ts`

## Architecture Invariants

Verify during review:

- Frontend sends `persistence`, not `provider`.
- Normal API responses omit provider details.
- Provider details are limited to debug/API internals.
- xterm.js and terminal UI remain runtime-agnostic.
- tmux-specific logic remains inside `TmuxRuntime` or tmux helpers.
- PTY-specific logic remains inside `PtyRuntime`.
- Existing hook-discovered tmux sessions still attach.

## Manual QA

### Existing tmux Workflow

1. Create a tmux session manually.
2. Start Claude inside tmux.
3. Confirm hooks record tmux metadata.
4. Open the dashboard.
5. Open the session detail terminal.
6. Type into the terminal and confirm tmux receives input.
7. Resize the terminal and confirm output remains usable.
8. Close the browser tab and confirm the tmux session remains alive.

### Ephemeral Session

1. Open Sessions.
2. Click `New session`.
3. Leave `Keep running after dashboard closes` unchecked.
4. Create the session.
5. Confirm the dashboard opens the session detail.
6. Confirm the terminal connects and accepts input.
7. Stop/restart the backend and confirm the old PTY runtime is not attachable.

### Persistent Session

1. Open Sessions.
2. Click `New session`.
3. Enable `Keep running after dashboard closes`.
4. Create the session.
5. Confirm the dashboard opens the session detail.
6. Close and reopen the browser.
7. Confirm the session is still listed and attachable.
8. Confirm `tmux ls` shows the backing session.

### Background Service

1. Run `npm run service:install`.
2. Run `npm run service:status`.
3. Open `http://127.0.0.1:4820`.
4. Create or attach to a session.
5. Inspect logs under `~/Library/Logs/Claude-Code-Agent-Monitor/`.
6. Run `npm run service:uninstall`.

## Release Notes Checklist

- Mention that persistent sessions require tmux.
- Mention that background service support is macOS launchd-only.
- Mention that provider selection is intentionally not exposed in normal UI.
