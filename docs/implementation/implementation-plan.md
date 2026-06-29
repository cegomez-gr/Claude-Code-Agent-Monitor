# Implementation Plan

## PR-0: Documentation

Add this documentation pack.

Acceptance criteria:

- Docs committed.
- AGENTS.md and CLAUDE.md available.
- No code changes.

## PR-1: Extract terminal attach abstraction

Goal:

Move current tmux attach logic out of websocket handler into an internal provider-like module.

Acceptance criteria:

- Current Terminal tab still works.
- Existing tmux sessions still attach.
- No frontend changes required.

## PR-2: Introduce RuntimeProvider interface

Goal:

Define runtime provider types and create initial `TmuxRuntime`.

Acceptance criteria:

- TmuxRuntime wraps existing behavior.
- Websocket no longer directly knows tmux command details.

## PR-3: Introduce RuntimeManager

Goal:

Route attach operations through RuntimeManager.

Acceptance criteria:

- Terminal WebSocket calls RuntimeManager.attach(sessionId).
- RuntimeManager resolves current tmux-backed sessions.
- Behavior remains unchanged.

## PR-4: Introduce SessionRegistry abstraction

Goal:

Centralize runtime metadata.

Acceptance criteria:

- Runtime session records exist.
- Existing hook metadata can be mapped into registry records.
- No regression in existing dashboard.

## PR-5: Add PtyRuntime

Goal:

Support ephemeral Claude sessions created directly from dashboard.

Acceptance criteria:

- Backend can spawn Claude through node-pty.
- RuntimeManager can create ephemeral sessions.
- Session exits are tracked.

## PR-6: Add Create Session API

Goal:

Expose `POST /api/runtime-sessions`.

Acceptance criteria:

- Request supports `persistence`, `cwd`, `command`, `title`.
- UI does not send provider.
- RuntimeManager selects provider.

## PR-7: Add Dashboard session creation UI

Goal:

Add user-facing button/modal.

Acceptance criteria:

- "New session" creates ephemeral session.
- "Keep running after dashboard closes" creates persistent session.
- Existing session detail terminal still works.

## PR-8: Add persistent session creation

Goal:

Allow RuntimeManager to create tmux-backed persistent sessions.

Acceptance criteria:

- tmux session is created safely.
- Claude starts inside tmux.
- Dashboard attaches after creation.
- Session survives dashboard/browser restart.

## PR-9: Reconciliation

Goal:

Reconcile registry with actual runtime state on service startup.

Acceptance criteria:

- Existing tmux sessions are detected.
- Missing/stale sessions are marked accurately.
- Ephemeral sessions from dead service are marked exited/stale.

## PR-10: Background service scripts

Goal:

Add launchd support for macOS.

Acceptance criteria:

- Install/uninstall scripts.
- Documented plist.
- Service can run without visible terminal.

## PR-11: Tests and hardening

Goal:

Add automated coverage.

Acceptance criteria:

- Provider selection tests.
- RuntimeManager tests.
- SessionRegistry tests.
- Websocket protocol tests where feasible.
- Manual QA checklist documented.
