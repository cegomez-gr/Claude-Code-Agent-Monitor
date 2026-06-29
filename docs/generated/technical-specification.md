# Runtime Platform Technical Specification

## Audience And Action

This specification is for engineers implementing the Runtime Platform migration. After reading it, an engineer should be able to implement the work incrementally without coupling the frontend, xterm.js, or generic websocket transport to tmux.

## Goals

- Preserve the current embedded terminal behavior for existing tmux-backed sessions.
- Introduce a Runtime Manager as the backend boundary for runtime lifecycle operations.
- Encapsulate tmux and PTY behavior behind Runtime Providers.
- Store runtime-neutral session records in a Session Registry.
- Add session creation APIs after current attach behavior is preserved.
- Keep provider selection out of normal frontend requests and UI.

## Non-Goals

- Do not add Docker, SSH, Kubernetes, remote daemon, cloud sync, or multi-user runtime support in the first implementation.
- Do not require Electron, Tauri, or a packaged app for the initial background-service path.
- Do not remove the current tmux discovery or attach behavior until the new Runtime Manager path is tested.
- Do not expose `tmux` or `pty` as normal user-facing choices.

## Current Behavior Summary

The current terminal path is:

1. Claude hooks create or update dashboard session rows.
2. Hook handling stores the tmux session name in session metadata.
3. The frontend Terminal pane opens a websocket using the dashboard session ID.
4. The terminal websocket looks up the session row, reads tmux metadata, and spawns `tmux attach-session` through node-pty.
5. xterm.js sends raw input and JSON resize messages over the same websocket.

This behavior must continue working during the migration.

## Target Architecture

The target path is:

1. Frontend sends runtime-neutral intent such as `persistence: "ephemeral"` or `persistence: "persistent"`.
2. Runtime Manager resolves that intent to a provider.
3. Provider creates or attaches to the execution backend.
4. Session Registry stores the application session ID, persistence policy, provider reference, status, capabilities, and provider metadata.
5. Terminal websocket asks Runtime Manager to attach and pipes data between xterm.js and the runtime attachment.

The frontend remains responsible for terminal presentation. Runtime Manager remains responsible for lifecycle orchestration. Runtime Providers remain responsible for backend-specific execution details.

## Module Changes

### Server Runtime Modules

Add a new server runtime module area:

- `server/runtime/types.js` or `server/runtime/types.ts`: shared runtime constants, status values, validation helpers, and documentation of the TypeScript contracts used by the implementation.
- `server/runtime/runtime-manager.js`: provider selection, lifecycle orchestration, error normalization, registry updates, and attach delegation.
- `server/runtime/providers/tmux-runtime.js`: tmux attach, tmux creation, tmux status, tmux termination, and tmux discovery.
- `server/runtime/providers/pty-runtime.js`: node-pty process creation, stream ownership, resize, write, status, and cleanup for ephemeral sessions.
- `server/runtime/session-registry.js`: runtime-neutral persistence and reconciliation facade.
- `server/runtime/errors.js`: normalized runtime error codes and mapping from provider errors.

JavaScript is acceptable if the server remains CommonJS. If the project later standardizes server TypeScript, the interfaces in `runtime-provider-interface.md` are the migration target.

### Existing Server Modules

- `server/websocket.js`: keep the `/ws` event stream behavior intact. Replace direct tmux lookup and `tmux attach-session` spawning in the terminal path with `RuntimeManager.attach(sessionId)`. The websocket should handle transport framing only.
- `server/lib/tmux.js`: keep existing tmux path and session resolution helpers. Move attach/create/status command construction into `TmuxRuntime` or call helpers from there.
- `server/routes/hooks.js`: keep current hook ingestion behavior. When Session Registry exists, mirror `metadata.tmux_session` into a runtime record marked externally discovered.
- `server/routes/sessions.js`: keep existing session APIs. Do not overload them with runtime creation once the dedicated runtime session API exists.
- `server/index.js`: mount the new runtime API router under `/api/runtime-sessions`.
- `server/db.js`: add runtime registry storage after the registry abstraction is introduced. Prefer a new table over adding provider-specific columns to the existing sessions table.
- `server/openapi.js`: document runtime API routes after the routes are introduced.

### Client Modules

- `client/src/components/TerminalPane.tsx`: keep xterm.js runtime-agnostic. It may connect to a new runtime websocket path, but it must not know which provider backs the session. Replace visible tmux-specific normal UI language with runtime-neutral language when the new API is available.
- `client/src/pages/SessionDetail.tsx`: continue to render the existing Terminal tab for hook-discovered sessions. Later, use runtime capabilities to decide which actions are enabled.
- `client/src/components/SessionCard.tsx`: avoid adding provider-specific normal UI. Provider metadata may remain in debug or advanced details.
- `client/src/lib/api.ts`: add runtime session API client functions after backend API exists. Requests must contain persistence policy, not provider.

## Runtime Manager Behavior

Runtime Manager owns:

- provider registration;
- provider selection;
- create, attach, resize, write, terminate, get, and list operations;
- normalized errors;
- registry reads and writes;
- startup reconciliation.

Initial provider mapping:

| Persistence | Provider |
|---|---|
| `ephemeral` | `PtyRuntime` |
| `persistent` | `TmuxRuntime` |

This mapping is internal. The frontend must never submit `provider: "tmux"` or `provider: "pty"` during normal workflows.

## Provider Behavior

### TmuxRuntime

TmuxRuntime must support:

- attaching to existing externally discovered tmux sessions;
- creating dashboard-owned persistent tmux sessions;
- checking whether tmux is available;
- validating or generating safe tmux session names;
- terminating dashboard-owned tmux sessions;
- discovering and reconciling known tmux sessions on startup.

The first implementation should wrap the current tmux attach behavior without changing frontend behavior.

### PtyRuntime

PtyRuntime must support:

- creating local ephemeral Claude sessions through node-pty;
- returning an attachment for the owned process;
- forwarding output, input, resize, and exit events;
- cleaning up on process exit or termination;
- marking sessions stale after service restart because PTY processes cannot be rehydrated.

PtyRuntime should be added only after TmuxRuntime attach is stable behind Runtime Manager.

## Terminal Websocket Protocol

The websocket transport should be runtime-agnostic. The client may continue to send raw input frames for compatibility and JSON resize frames:

```json
{ "type": "resize", "cols": 120, "rows": 40 }
```

The target protocol may also accept explicit input frames:

```json
{ "type": "input", "data": "..." }
```

Server output should support raw output during migration. The target JSON server messages are defined in `api-specification.md`.

## Migration Plan

1. Extract current tmux attach into TmuxRuntime.
2. Route terminal websocket attach through Runtime Manager.
3. Add Session Registry and mirror existing tmux metadata into runtime records.
4. Add PtyRuntime behind Runtime Manager.
5. Add create runtime session API for ephemeral sessions.
6. Add persistent tmux creation through Runtime Manager.
7. Add dashboard session creation UI.
8. Add startup reconciliation.
9. Add launchd service scripts and documentation.
10. Harden tests, error handling, and rollback.

Each step must be independently reviewable and preserve current terminal functionality.

## PR Plan

### PR 1: Extract Current Tmux Attach

- Add TmuxRuntime with attach support only.
- Move tmux attach command construction out of the websocket.
- Keep `/terminal/:sessionId` behavior unchanged.
- Acceptance: existing tmux terminal attaches and resizes exactly as before.

### PR 2: Introduce Runtime Manager For Attach

- Add Runtime Manager with `attach`, `resize`, `write`, and `get`.
- Terminal websocket calls Runtime Manager instead of directly attaching tmux.
- Runtime Manager resolves current metadata-backed tmux sessions.
- Acceptance: no frontend change and no terminal regression.

### PR 3: Add Session Registry Abstraction

- Add runtime session records and registry operations.
- Mirror existing `metadata.tmux_session` into external tmux records.
- Keep existing session rows as the dashboard conversation/source-of-truth for transcript data.
- Acceptance: existing sessions list and terminal attach still work.

### PR 4: Add PtyRuntime Backend

- Add ephemeral PTY provider.
- Add backend-only create tests through Runtime Manager.
- Track exit and cleanup.
- Acceptance: backend can create, attach, write, resize, and terminate ephemeral sessions without UI changes.

### PR 5: Add Runtime Session API

- Add `/api/runtime-sessions` routes.
- Add request validation and normalized errors.
- Update OpenAPI.
- Acceptance: API can create/list/get/delete runtime sessions without provider in request bodies.

### PR 6: Add Persistent Creation

- Add TmuxRuntime create support.
- Generate safe dashboard-owned tmux session names.
- Start Claude in the requested working directory.
- Acceptance: persistent session survives browser close and can be reattached.

### PR 7: Add UI Controls

- Add "New session" workflow.
- Add "Keep session running after closing dashboard" persistence control.
- Use capabilities for attach, resize, and terminate actions.
- Acceptance: UI remains provider-neutral.

### PR 8: Reconciliation

- Reconcile registry state at startup.
- Mark missing tmux sessions stale or exited.
- Mark old PTY sessions stale after service restart.
- Acceptance: dashboard state matches actual runtime availability after restart.

### PR 9: Background Service

- Add launchd scripts and docs.
- Add service health checks if needed.
- Acceptance: dashboard backend can run without a visible terminal.

### PR 10: Hardening

- Add unit, integration, and manual QA coverage.
- Add error normalization and debug details.
- Document rollback.
- Acceptance: old terminal flow remains covered before old code is removed.

## Test Strategy

### Unit Tests

- Runtime Manager provider selection and delegation.
- TmuxRuntime safe command construction and missing binary handling.
- PtyRuntime lifecycle and cleanup.
- Session Registry CRUD and reconciliation.
- Runtime error normalization.

### Integration Tests

- Websocket attaches through Runtime Manager.
- Input reaches provider attachment.
- Provider output reaches websocket.
- Resize messages reach the attachment.
- Runtime API creates and returns runtime-neutral records.

### Manual QA

- Existing manually created tmux session is discovered and attachable.
- Existing terminal tab still handles input and resize.
- Ephemeral session starts, accepts input, exits, and updates status.
- Persistent session starts, survives browser restart, and reattaches.
- Service restart marks stale sessions correctly.

## Reader Test

A fresh engineer should be able to start with PR 1 and implement a behavior-preserving TmuxRuntime wrapper without changing the UI, then continue through the later PRs in order. The critical invariants are explicit: frontend sends intent, Runtime Manager chooses provider, xterm.js stays runtime-agnostic, and existing tmux attach remains working throughout migration.
