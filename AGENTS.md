# Agent Instructions

These instructions apply to AI coding agents working on runtime, terminal, session or dashboard-related code.

## Mandatory reading before making changes

Before modifying runtime-related code, read:

- `docs/architecture/vision.md`
- `docs/architecture/runtime-platform.md`
- `docs/architecture/runtime-manager.md`
- `docs/architecture/runtime-providers.md`
- `docs/architecture/session-registry.md`
- `docs/architecture/api.md`
- `docs/implementation/implementation-plan.md`
- `docs/adr/`

## Non-negotiable rules

- Do not put tmux-specific logic in React components.
- Do not make xterm.js aware of the runtime provider.
- Do not let the frontend choose `provider=tmux` or `provider=pty` directly.
- The frontend expresses intent: `persistence=ephemeral` or `persistence=persistent`.
- The Runtime Manager resolves that intent into a concrete provider.
- Runtime-specific logic belongs behind a Runtime Provider.
- Preserve compatibility with existing tmux session discovery and attach flows.
- Prefer incremental, reviewable changes over large rewrites.
- Do not remove the current terminal functionality until the replacement is fully tested.

## Implementation preference

Prefer this order:

1. Extract existing tmux attach logic behind a provider.
2. Introduce RuntimeManager.
3. Add SessionRegistry.
4. Add PtyRuntime for ephemeral sessions.
5. Add session creation API.
6. Add UI controls for creating sessions.
7. Add launchd/background service support later.

## When uncertain

Do not invent architecture. Add a TODO in the generated document or implementation plan and ask for review.
