# ADR-003: Separate Persistence Policy from Runtime Provider

## Status

Accepted

## Context

A session can be ephemeral or persistent. This is user intent. The concrete provider is an implementation detail.

## Decision

The UI sends a persistence policy. RuntimeManager chooses a compatible provider.

Initial mapping:

- `ephemeral` -> `PtyRuntime`
- `persistent` -> `TmuxRuntime`

## Consequences

- UI does not expose tmux as a primary concept.
- RuntimeManager remains free to change provider selection later.
