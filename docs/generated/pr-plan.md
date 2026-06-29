# Runtime Platform PR Plan

## Audience And Action

This plan is for engineers implementing the Runtime Platform migration. After reading it, an engineer should be able to implement the work as small, independently reviewable PRs that preserve current tmux terminal behavior before adding new runtime features.

## Planning Principles

- Preserve existing behavior first.
- Keep refactor PRs separate from feature PRs.
- Keep frontend provider-agnostic.
- Keep xterm.js runtime-agnostic.
- Keep tmux behind `TmuxRuntime`.
- Use `persistence` as user intent and let Runtime Manager choose the provider.
- Preserve existing manually created tmux sessions discovered through hooks.
- Do not remove the existing `/terminal/:sessionId` websocket path until a tested replacement exists.

## PR 1: Baseline Terminal Regression Tests

### Goal

Capture the current tmux terminal behavior before moving logic.

### Scope

- Add tests or a documented test harness around the existing terminal websocket attach flow.
- Cover session lookup, `metadata.tmux_session` handling, resize messages, raw input forwarding, output forwarding, and websocket close behavior.
- Add a manual QA checklist for manually created tmux sessions discovered through hooks.

### Out Of Scope

- No runtime provider abstraction.
- No Runtime Manager.
- No frontend changes.

### Acceptance Criteria

- Existing `/terminal/:sessionId` attach behavior is described and test-covered where feasible.
- A session with existing tmux metadata still attaches successfully.
- Raw input and JSON resize messages behave as before.
- The Terminal tab behavior for hook-discovered tmux sessions is documented as a non-regression requirement.
- PR can be reverted without changing production behavior.

## PR 2: Extract Tmux Attach Helper

### Goal

Move tmux attach command construction and node-pty spawn setup out of the websocket handler without changing behavior.

### Scope

- Add an internal helper that accepts the current session row and tmux session metadata.
- Keep the same tmux attach command, terminal dimensions, cwd fallback, environment PATH handling, output forwarding, resize handling, and close behavior.
- Update the websocket handler to call the helper.

### Out Of Scope

- No Runtime Manager.
- No provider interface.
- No API changes.
- No frontend changes.

### Acceptance Criteria

- Existing `/terminal/:sessionId` still works.
- Existing tmux metadata path remains the source for attach.
- No provider names or runtime concepts appear in React components.
- Tests from PR 1 still pass.
- Diff is limited to extraction plus tests.

## PR 3: Introduce TmuxRuntime Attach-Only Provider

### Goal

Wrap the extracted tmux attach helper behind `TmuxRuntime` as an attach-only provider.

### Scope

- Add `TmuxRuntime.attach(ref)` for existing tmux sessions.
- Add minimal runtime types needed for attach references.
- Keep `TmuxRuntime.create`, terminate, discovery, and reconciliation unimplemented or explicitly unsupported.
- Preserve existing attach semantics: websocket close detaches the attach process but does not kill the tmux session.

### Out Of Scope

- No Runtime Manager selection.
- No session creation.
- No registry storage.
- No UI work.

### Acceptance Criteria

- `TmuxRuntime` is the only module that knows how to attach to tmux.
- Generic websocket code does not construct tmux commands.
- Existing `/terminal/:sessionId` behavior is unchanged.
- Tmux attach works even though dashboard-created persistent sessions are not implemented.
- Tests prove attach-only provider behavior.

## PR 4: Route Existing Terminal Attach Through Runtime Manager

### Goal

Introduce Runtime Manager for the existing attach flow while preserving the current websocket endpoint and frontend behavior.

### Scope

- Add Runtime Manager with attach-only support.
- Runtime Manager resolves existing dashboard session metadata into a tmux runtime reference.
- `/terminal/:sessionId` calls `RuntimeManager.attach(sessionId)`.
- Websocket writes and resizes the returned `RuntimeAttachment`.
- Normalize attach errors without leaking tmux command details in normal errors.

### Out Of Scope

- No create-session API.
- No Session Registry.
- No frontend route change.
- No new `/api/runtime-sessions/:sessionId/terminal` endpoint yet.

### Acceptance Criteria

- Existing `/terminal/:sessionId` websocket still works.
- TerminalPane does not change.
- xterm.js remains unaware of tmux, PTY, Runtime Manager, or provider names.
- Runtime Manager owns attach orchestration.
- Tests prove legacy metadata fallback works.

## PR 5: Define Runtime Contracts And Error Model

### Goal

Stabilize shared runtime contracts before adding more providers or lifecycle operations.

### Scope

- Add runtime status, persistence policy, capabilities, runtime reference, attachment, and error contracts.
- Clarify create support separately from attach capability.
- Ensure provider selection is defined only for create requests.
- Document that debug provider metadata is not a normal frontend dependency.

### Out Of Scope

- No behavior change beyond type/contract adoption.
- No new provider features.
- No frontend changes.

### Acceptance Criteria

- Runtime contracts match the architecture and generated interface specification.
- `supportsCreate` or equivalent wording cannot block attach-only tmux sessions.
- Provider errors map to normalized runtime errors.
- Existing attach tests still pass.

## PR 6: Add Session Registry Storage Skeleton

### Goal

Introduce the Session Registry abstraction and storage without changing attach behavior.

### Scope

- Add runtime-neutral registry storage.
- Add create, upsert, get, get-by-provider, list, update-status, update-attachment, and update-metadata operations.
- Resolve the foreign-key strategy for runtime records before implementation.
- Keep existing session metadata unchanged.

### Out Of Scope

- No automatic migration yet.
- No runtime session API.
- No UI changes.

### Acceptance Criteria

- Registry operations are unit tested.
- Provider-specific data is nested in metadata.
- Existing sessions table behavior is unchanged.
- Existing tmux attach still works through legacy metadata.
- Rollback does not lose existing tmux metadata.

## PR 7: Mirror Existing tmux Metadata Into Registry

### Goal

Additive migration from current hook-discovered tmux metadata to runtime registry records.

### Scope

- When hooks or session updates expose `metadata.tmux_session`, mirror it into a persistent `tmux` runtime record.
- Mark mirrored records as externally discovered and not dashboard-owned.
- Keep `metadata.tmux_session` in existing session metadata.
- Runtime Manager attach can resolve from registry first, then legacy metadata fallback.

### Out Of Scope

- No tmux creation.
- No Session Registry reconciliation at startup.
- No frontend changes.

### Acceptance Criteria

- Existing manually created tmux sessions still appear and attach.
- Terminal tab visibility remains driven by existing metadata until registry-backed visibility is proven.
- Runtime records are created additively for hook-discovered tmux sessions.
- Existing `/terminal/:sessionId` works with registry records and legacy metadata fallback.
- Tests cover both registry-backed and legacy-metadata attach.

## PR 8: Add Runtime Session Read APIs

### Goal

Expose runtime registry records for backend and debug use without creating sessions yet.

### Scope

- Add read-only runtime session API routes: list, get, and optional debug.
- Include persistence, status, capabilities, cwd, title, timestamps, and safe runtime metadata.
- Keep debug provider fields out of normal list/get responses unless explicitly intended.
- Add OpenAPI entries for read routes.

### Out Of Scope

- No POST create endpoint.
- No DELETE terminate endpoint.
- No frontend integration.

### Acceptance Criteria

- API returns runtime-neutral data for normal routes.
- Normal API responses do not require frontend provider knowledge.
- Debug endpoint is clearly optional and not needed for normal workflows.
- Existing `/api/sessions` behavior is unchanged.
- Existing terminal attach still works.

## PR 9: Add Startup Reconciliation For Existing Runtime Records

### Goal

Keep registry state aligned with actual runtime state after service restart.

### Scope

- Reconcile known tmux runtime records against live tmux sessions.
- Mark missing tmux records stale or exited according to the resolved status policy.
- Import compatible hook-discovered tmux metadata that lacks a runtime record.
- Do not import unrelated tmux sessions unless the import scope is explicitly decided.

### Out Of Scope

- No PTY reconciliation yet.
- No session creation.
- No frontend changes.

### Acceptance Criteria

- Known external tmux sessions stay attachable after service restart.
- Missing tmux sessions are not offered as attachable.
- Reconciliation does not delete legacy session metadata.
- Tests cover found, missing, and externally discovered tmux records.

## PR 10: Add PtyRuntime Backend-Only

### Goal

Add ephemeral runtime support behind Runtime Manager without exposing it to the frontend.

### Scope

- Add `PtyRuntime` create, attach, write, resize, status, terminate, and cleanup behavior.
- Runtime Manager selects `PtyRuntime` for `persistence: "ephemeral"` internally.
- Use constrained command policy: default to configured Claude command unless command/env policy is explicitly resolved.
- Track process exit and runtime status.

### Out Of Scope

- No public create API yet.
- No dashboard UI.
- No persistent tmux creation.

### Acceptance Criteria

- Backend tests can create, attach, write, resize, and terminate an ephemeral runtime.
- Runtime Manager chooses PTY only from persistence intent.
- No frontend request or component can select provider.
- Existing tmux attach behavior still passes.
- Service restart behavior for old PTY records is documented for the next reconciliation PR.

## PR 11: Add PTY Reconciliation

### Goal

Handle ephemeral runtime records correctly after service restart.

### Scope

- Mark non-terminal PTY records stale or exited at startup according to the resolved status policy.
- Clear or ignore stale process metadata.
- Ensure stale PTY sessions are visible but not attachable if that is the chosen UX.

### Out Of Scope

- No UI changes.
- No create API.

### Acceptance Criteria

- Old PTY records cannot be attached after service restart.
- Status is updated consistently.
- Tests cover stale/exited PTY reconciliation.
- Existing tmux reconciliation and attach tests still pass.

## PR 12: Add Create Runtime Session API For Ephemeral Sessions

### Goal

Expose backend session creation for ephemeral sessions only.

### Scope

- Add `POST /api/runtime-sessions` for `persistence: "ephemeral"`.
- Reject `provider` in request bodies.
- Validate cwd and constrained command/env inputs.
- Create or link any required dashboard session record according to the resolved registry strategy.
- Return runtime-neutral session summary.

### Out Of Scope

- No persistent creation.
- No UI controls.
- No debug dependency in normal workflow.

### Acceptance Criteria

- API creates an ephemeral session through Runtime Manager.
- Request body cannot choose provider.
- Response does not require provider knowledge.
- Invalid persistence, provider, cwd, command, or env inputs are rejected.
- Existing tmux attach behavior still passes.

## PR 13: Add Runtime Terminal API Alias

### Goal

Add the target runtime terminal websocket route without removing the compatibility route.

### Scope

- Add `/api/runtime-sessions/:sessionId/terminal` websocket upgrade path.
- Route both old and new websocket paths through the same Runtime Manager attach flow.
- Keep raw output compatibility for existing clients.
- Document JSON framing as opt-in or future client behavior.

### Out Of Scope

- No TerminalPane migration.
- No removal of `/terminal/:sessionId`.
- No UI changes.

### Acceptance Criteria

- Both websocket paths attach to the same runtime session.
- Existing TerminalPane continues using the old path and passes tests.
- New path is covered by backend integration tests.
- xterm.js remains runtime-agnostic.

## PR 14: Add Terminate Runtime API

### Goal

Expose runtime termination with ownership-safe behavior.

### Scope

- Add `DELETE /api/runtime-sessions/:sessionId`.
- Allow terminating PTY sessions.
- Allow terminating dashboard-owned persistent tmux sessions when implemented.
- Refuse externally discovered tmux sessions unless explicit confirmation is provided.
- Normalize errors.

### Out Of Scope

- No UI controls.
- No persistent tmux creation if not yet implemented.

### Acceptance Criteria

- External tmux sessions are protected by default.
- PTY termination updates runtime status.
- Termination does not remove transcript/session history unexpectedly.
- Tests cover external tmux refusal, PTY termination, and not-found cases.

## PR 15: Add Persistent Tmux Creation Backend

### Goal

Allow Runtime Manager to create dashboard-owned persistent tmux sessions.

### Scope

- Add `TmuxRuntime.create`.
- Generate safe dashboard-owned tmux session names.
- Start the configured Claude command inside tmux without shell injection.
- Store ownership metadata.
- Return a runtime-neutral session summary.

### Out Of Scope

- No UI controls.
- No removal of manual tmux workflow.

### Acceptance Criteria

- `persistence: "persistent"` creates a tmux-backed runtime through Runtime Manager.
- API and frontend still do not choose provider.
- Created persistent session can be attached through existing and runtime websocket paths.
- Externally discovered tmux sessions remain supported.
- Tests cover safe naming, missing tmux, create success, attach after create, and ownership metadata.

## PR 16: Enable Persistent Creation In Runtime API

### Goal

Extend `POST /api/runtime-sessions` from ephemeral-only to both persistence policies.

### Scope

- Accept `persistence: "persistent"` in create requests.
- Runtime Manager chooses TmuxRuntime internally.
- Keep command/env policy constrained.
- Return capabilities appropriate for persistent sessions.

### Out Of Scope

- No UI controls.
- No provider field in request or normal response.

### Acceptance Criteria

- Persistent create request succeeds without provider selection.
- Request with provider field is rejected.
- Response exposes persistence and capabilities, not provider internals.
- Created persistent session survives browser close and can be reattached.
- Existing external tmux workflow still passes.

## PR 17: Add Backend API Client Methods

### Goal

Prepare frontend API helpers without changing user-facing UI.

### Scope

- Add client API methods for runtime session list, get, create, terminate, and terminal URL construction if needed.
- Create request type includes persistence but no provider field.
- Keep existing session and terminal UI paths unchanged.

### Out Of Scope

- No visible "New session" UI.
- No TerminalPane route migration.

### Acceptance Criteria

- Type definitions prevent provider selection in normal create requests.
- Existing frontend behavior is unchanged.
- Tests or type checks cover request shape.
- No component uses debug provider metadata for normal behavior.

## PR 18: Add Minimal New Session UI

### Goal

Add the smallest user-facing session creation flow.

### Scope

- Add a "New session" action.
- Let the user choose whether to keep the session running after closing the dashboard.
- Send only persistence intent, cwd, title, and allowed command inputs.
- Attach to the created session after creation.

### Out Of Scope

- No advanced provider chooser.
- No debug details in normal UI.
- No broad session list redesign.

### Acceptance Criteria

- UI never asks for tmux or PTY.
- Create request does not include provider.
- Ephemeral and persistent choices map to persistence only.
- Created session opens a runtime-agnostic terminal.
- Existing hook-discovered tmux sessions still show and attach.

## PR 19: Capability-Aware UI Actions

### Goal

Use runtime capabilities to enable attach and terminate actions without exposing provider internals.

### Scope

- Read capabilities from runtime session summaries.
- Disable attach for stale or non-attachable sessions.
- Hide or guard termination for external sessions according to API behavior.
- Keep provider metadata out of normal UI labels.

### Out Of Scope

- No new provider features.
- No debug UI unless explicitly scoped separately.

### Acceptance Criteria

- UI uses capabilities, not provider names, for normal controls.
- External tmux sessions are not casually terminable.
- Stale sessions are visible but not attachable.
- Existing session detail terminal remains compatible.

## PR 20: Optional Debug Details UI

### Goal

Expose provider metadata only in an advanced/debug surface.

### Scope

- Add an explicit debug details panel or route.
- Use debug API for provider name, provider ID, tmux session name, pane ID, or PTY PID.
- Keep normal session list and terminal UI provider-neutral.

### Out Of Scope

- No normal workflow dependency on debug endpoint.
- No provider chooser.

### Acceptance Criteria

- Debug details are clearly separated from normal UI.
- Normal UI still works if debug endpoint is unavailable.
- Provider metadata is not used for create or attach decisions in React.

## PR 21: Background Service Documentation And Scripts

### Goal

Add launchd support after runtime behavior is stable.

### Scope

- Add per-user launchd install/uninstall documentation and scripts.
- Run the production backend command.
- Document logs, restart, stop, and health checks.

### Out Of Scope

- No Electron/Tauri packaging.
- No runtime architecture changes.

### Acceptance Criteria

- Service can start at login.
- Service can restart on failure.
- Dashboard can be opened without a visible terminal.
- Runtime session attach and reconciliation still work after service restart.

## PR 22: End-To-End Runtime Hardening

### Goal

Consolidate coverage and operational safety before removing any old path.

### Scope

- Add end-to-end tests or documented QA for external tmux, dashboard-owned persistent tmux, ephemeral PTY, restart reconciliation, and termination behavior.
- Audit error messages and debug boundaries.
- Document rollback.
- Identify old compatibility code that may be removed later, but do not remove it unless explicitly approved.

### Out Of Scope

- No new feature work.
- No provider expansion.

### Acceptance Criteria

- Manual tmux workflow still passes.
- Ephemeral and persistent dashboard-created workflows pass.
- Restart reconciliation passes.
- Frontend remains provider-neutral.
- xterm.js remains runtime-agnostic.
- Compatibility route removal, if desired, is planned as a separate future PR.

## Future PRs Not In Initial Migration

- Remove old `/terminal/:sessionId` only after a dedicated deprecation PR and full compatibility sign-off.
- Add Docker, SSH, Kubernetes, or remote providers.
- Add packaged desktop service management.
- Add multi-user permissions.
- Add cloud synchronization.

## Reader Test

A fresh engineer can begin at PR 1 without understanding future providers. The plan first locks down current tmux behavior, then extracts it behind `TmuxRuntime`, then routes through Runtime Manager, then adds registry storage, PTY sessions, APIs, UI, and service support. Each PR has a narrow purpose and concrete acceptance criteria, and no PR requires the frontend to choose a provider.
