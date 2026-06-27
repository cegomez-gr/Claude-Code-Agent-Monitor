# ADR-004: Introduce Session Registry

## Status

Accepted

## Context

Runtime metadata should not be scattered across hooks, frontend state and websocket internals.

## Decision

Introduce a Session Registry that stores runtime-neutral session records and provider-specific metadata.

## Consequences

- Reconnect and reconciliation become explicit.
- Persistent sessions can be rehydrated.
- Provider-specific fields are isolated.
