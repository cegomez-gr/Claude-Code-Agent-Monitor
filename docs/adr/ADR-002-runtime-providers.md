# ADR-002: Use Runtime Providers

## Status

Accepted

## Context

Different execution backends have different behavior. PTY sessions are simple and ephemeral. tmux sessions are persistent and reattachable.

## Decision

Encapsulate backend-specific behavior in Runtime Providers.

Initial providers:

- `PtyRuntime`
- `TmuxRuntime`

## Consequences

- Provider logic is isolated.
- Websocket transport can become generic.
- Future Docker/SSH providers become possible.
