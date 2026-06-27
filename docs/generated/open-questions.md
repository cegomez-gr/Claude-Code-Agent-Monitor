# Runtime Platform Open Questions

## Audience And Action

This document is for maintainers reviewing decisions that are not fully specified by the accepted architecture docs. After reading it, maintainers should be able to answer or defer each question before implementation reaches the affected PR.

## Questions

### 1. Runtime Session Foreign Key Strategy

Should Runtime Manager create a dashboard `sessions` row before creating every runtime record, or should `runtime_sessions` be allowed to exist before transcript-backed dashboard session data exists?

Impact:

- A strict foreign key keeps runtime records tied to existing dashboard sessions.
- Creating runtime sessions before Claude hooks write transcript data may require placeholder session rows.

Affected work:

- Session Registry
- Runtime session creation API
- Dashboard "New session" workflow

### 2. PTY Detach Lifetime

Should an ephemeral PTY session terminate when the last websocket client detaches, or should it keep running until explicit termination or service exit?

Impact:

- Terminate-on-detach is simpler and matches the word ephemeral more strictly.
- Keep-running-until-service-exit allows accidental browser refresh recovery while still not surviving service restart.

Affected work:

- PtyRuntime
- Terminal websocket
- Session status transitions

### 3. Stale PTY Status

After service restart, should previously running PTY sessions be marked `stale` or `exited`?

Impact:

- `stale` preserves the distinction between observed exit and service-loss uncertainty.
- `exited` is simpler for UI filtering.

Affected work:

- Session Registry reconciliation
- Runtime session list UI

### 4. Websocket Framing Migration

When should the terminal websocket switch from raw output frames to JSON `{ "type": "output" }` frames?

Impact:

- Keeping raw frames preserves current xterm behavior with less risk.
- JSON output frames give a cleaner protocol but require client changes.

Affected work:

- TerminalPane
- Runtime terminal websocket
- Websocket protocol tests

### 5. Command And Environment Policy

What commands and environment variables should the create-session API allow?

Impact:

- Allowing arbitrary commands is flexible but increases security and support risk.
- Restricting to a configured Claude command is safer for the first release.

Affected work:

- Runtime API validation
- PtyRuntime
- TmuxRuntime

### 6. Persistent Session Naming

What exact naming scheme should dashboard-created tmux sessions use?

Impact:

- Names must be deterministic enough for debugging and safe enough for tmux.
- Collisions must be handled without shell injection or user-visible confusion.

Affected work:

- TmuxRuntime create
- Session Registry provider IDs
- Debug endpoint

### 7. External Tmux Termination UX

What confirmation flow is required before terminating an externally discovered tmux session?

Impact:

- Architecture requires preserving existing manual tmux workflows.
- A conservative default should disable termination unless explicitly confirmed.

Affected work:

- Runtime API DELETE behavior
- UI capability handling
- TmuxRuntime terminate

### 8. Debug Metadata Exposure

Should debug provider metadata require an additional setting or token beyond the normal dashboard token?

Impact:

- Provider metadata is useful for troubleshooting.
- It may reveal local paths, tmux names, process IDs, or command details.

Affected work:

- Debug API
- Settings
- Security review

### 9. Reconciliation Import Scope

Should startup reconciliation import all compatible live tmux sessions, or only sessions already known through hooks/current metadata?

Impact:

- Importing all compatible sessions improves discovery.
- Limiting to hook-known sessions reduces accidental visibility of unrelated tmux work.

Affected work:

- TmuxRuntime discover
- Session Registry reconciliation
- Dashboard session list

### 10. Launchd Timing

Should launchd support wait until Runtime Platform core behavior is complete, or be implemented immediately after backend session creation works?

Impact:

- Later launchd work keeps the runtime migration smaller.
- Earlier service support helps persistent sessions and browser restart workflows.

Affected work:

- Background service scripts
- Service health endpoint
- Rollout plan
