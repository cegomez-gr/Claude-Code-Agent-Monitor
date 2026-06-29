# Compatibility Code Audit

Code identified for future removal. Do NOT remove without an explicit PR approval.

## Legacy pagination offset (sessions.js)

`server/routes/sessions.js` — `offset` query parameter kept alongside cursor-based pagination for backward compatibility. Remove when all clients use cursor pagination.

## Old terminal attach path (terminal-websocket route)

`server/routes/terminal-websocket.js` — The direct tmux WebSocket attach path (`/terminal`) is still present alongside the runtime alias (`/api/runtime-sessions/:id/terminal`). The runtime alias is the canonical path. The direct path may be removed once all clients route through RuntimeManager.

## Legacy session metadata mirror (tmux-registry)

`server/runtime/tmux-registry.js` — `mirrorTmuxMetadata` is called during reconciliation to import hook-discovered sessions that pre-date the runtime registry. Once all active sessions have runtime records this mirror step becomes a no-op and may be removed.

## Notes

- None of the above affect current behavior.
- All removal candidates require a dedicated PR with test verification.
- The runtime platform is designed so removal is additive — no behavior changes.
