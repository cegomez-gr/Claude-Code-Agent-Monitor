# Claude Code Instructions

This repository is evolving toward a Runtime Platform architecture.

When asked to modify runtime, terminal, websocket, tmux, xterm.js, hooks or session code:

1. Read `AGENTS.md`.
2. Read the runtime architecture documents under `docs/architecture/`.
3. Respect the ADRs under `docs/adr/`.
4. Implement only the requested phase or PR.
5. Do not make architectural changes not described in the docs.

## Key architectural intent

The dashboard should manage Claude sessions through a Runtime Manager.

The dashboard must not be coupled to tmux.

tmux is one provider, not the platform.

## User-facing language

Prefer:

- "New session"
- "Keep session running after closing dashboard"
- "Persistent session"

Avoid exposing implementation words like:

- "tmux session"
- "PTY session"

unless the user opens advanced settings or debug details.
