# Runtime Platform Roadmap

## Phase 0: Documentation

- Add architecture docs.
- Add ADRs.
- Add implementation plan.
- Add agent instructions.

## Phase 1: Runtime abstraction

- Extract current tmux attach logic behind `TmuxRuntime`.
- Introduce `RuntimeManager`.
- Keep current UI behavior unchanged.

## Phase 2: Session Registry

- Introduce registry abstraction.
- Store runtime-neutral session records.
- Preserve existing metadata.
- Reconcile tmux sessions on startup.

## Phase 3: Ephemeral sessions

- Add `PtyRuntime`.
- Add API to create ephemeral sessions.
- Add dashboard button: "New session".

## Phase 4: Persistent sessions

- Add API support for persistent sessions.
- RuntimeManager resolves persistent sessions to TmuxRuntime.
- Add dashboard option: "Keep running after dashboard closes".

## Phase 5: UI polish

- Session creation modal.
- Capability-aware actions.
- Runtime status indicators.
- Debug details hidden by default.

## Phase 6: Background service

- Add launchd documentation/scripts.
- Run backend without terminal.
- Add service health endpoint.

## Phase 7: Hardening

- Tests.
- Error normalization.
- Cleanup stale sessions.
- Security review.

## Future

- DockerRuntime.
- SSHRuntime.
- Remote daemon.
- Multi-project workspaces.
- Agent orchestration.
