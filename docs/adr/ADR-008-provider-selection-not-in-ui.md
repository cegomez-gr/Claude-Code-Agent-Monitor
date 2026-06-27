# ADR-008: Do Not Expose Provider Selection in Normal UI

## Status

Accepted

## Context

Users care whether a session persists, not whether it uses tmux or PTY.

## Decision

Normal UI should ask whether the session should keep running after closing the dashboard. It should not ask for `tmux` or `pty`.

## Consequences

- Better UX.
- Cleaner API.
- Provider decisions remain internal.
