# ADR-005: Keep xterm.js Runtime-Agnostic

## Status

Accepted

## Context

The frontend terminal component should not change every time a runtime backend is added.

## Decision

xterm.js connects to a generic terminal websocket. It does not know whether the backing runtime is tmux, PTY, Docker or SSH.

## Consequences

- TerminalPane remains stable.
- Runtime evolution happens in backend.
