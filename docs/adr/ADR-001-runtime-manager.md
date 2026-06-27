# ADR-001: Introduce Runtime Manager

## Status

Accepted

## Context

The embedded terminal currently depends directly on tmux concepts. This prevents the dashboard from creating sessions directly and makes future runtimes harder to add.

## Decision

Introduce a Runtime Manager as the application-level orchestration layer for runtime lifecycle operations.

## Consequences

- Frontend becomes runtime-agnostic.
- Runtime selection moves to backend.
- tmux becomes one provider, not the platform.
- Future providers can be added behind a common interface.
