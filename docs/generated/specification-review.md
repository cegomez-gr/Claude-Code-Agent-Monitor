# Runtime Platform Specification Review

## Scope

Reviewed generated specifications against:

- `docs/architecture/`
- `docs/adr/`
- `AGENTS.md`

Primary focus:

- frontend must not choose provider;
- xterm.js must remain runtime-agnostic;
- tmux must be a provider;
- persistence policy must be separate from runtime provider;
- current tmux workflow must remain compatible.

## Summary

The generated specification mostly preserves the accepted architecture. It correctly treats tmux as a Runtime Provider, keeps provider selection in Runtime Manager, separates user persistence intent from provider identity, and explicitly requires current tmux attach behavior to keep working during migration.

The main gaps are not broad architecture reversals. They are implementation-risk gaps: websocket route compatibility, current Terminal tab visibility, registry bootstrap for existing hook-discovered sessions, and ambiguity around provider-level `write`/`resize` versus attachment-level `write`/`resize`.

## Findings

### High: Websocket Route Migration Is Underspecified

The generated API spec defines the terminal websocket as:

```http
GET /api/runtime-sessions/:sessionId/terminal
```

The technical spec also says the first PR should keep:

```http
/terminal/:sessionId
```

behavior unchanged.

This is compatible in intent, but the migration path is not explicit enough. The current implementation has a direct websocket upgrade path under `/terminal/:sessionId`. If the implementation changes the client to the new `/api/runtime-sessions/:sessionId/terminal` route too early, it risks violating:

- ADR-005: xterm.js remains stable and runtime-agnostic;
- ADR-006: existing tmux workflow remains supported;
- AGENTS.md: do not remove current terminal functionality until the replacement is fully tested.

Required clarification:

- PR 1 and PR 2 should keep `/terminal/:sessionId` as a compatibility endpoint.
- The old endpoint should call Runtime Manager internally.
- The new runtime endpoint may be added later as an alias or replacement only after tests cover the old flow.
- TerminalPane should not need to change for the first behavior-preserving migration.

### High: Current Terminal Tab Visibility Depends On Existing tmux Metadata

The spec says hook-discovered `metadata.tmux_session` should be mirrored into the Session Registry. It does not explicitly preserve the current frontend condition that shows the Terminal tab based on existing session metadata.

This matters because the current workflow is:

1. hook writes tmux metadata to the existing session row;
2. dashboard session data exposes that metadata;
3. frontend shows the Terminal tab;
4. TerminalPane attaches by session ID.

If the implementation moves terminal availability to Runtime Registry records before the mirror/reconciliation path is complete, the Terminal tab may disappear for existing manually created tmux sessions.

Required clarification:

- Until the registry is authoritative and reconciled, existing `metadata.tmux_session` must continue to drive Terminal tab availability.
- Registry mirroring must be additive.
- Rollback must preserve the old metadata path.
- Acceptance criteria for PR 3 should explicitly include: existing hook-discovered sessions still show the Terminal tab without manual refresh.

### Medium: Runtime Provider `supports()` Is Ambiguous For Attach-Only Migration

`runtime-provider-interface.md` says:

```ts
supports(request: CreateRuntimeRequest): boolean;
```

and:

```text
TmuxRuntime.supports returns true for persistent requests when tmux is available and provider creation is enabled.
```

This is safe for creation, but ambiguous during the first migration phase. TmuxRuntime must support attach to existing sessions before dashboard-owned tmux creation is enabled. Attach capability must not be blocked by a creation feature flag.

Required clarification:

- `supports()` should be scoped to create requests only, or split into `supportsCreate()` and provider capabilities.
- Runtime Manager attach should resolve an existing `RuntimeRef` and call its provider regardless of create support flags.
- Tmux attach must remain available for externally discovered sessions even when persistent creation is disabled.

### Medium: Provider-Level `write` And `resize` Duplicate Attachment-Level Operations

The generated provider contract includes:

```ts
resize(ref, cols, rows)
write(ref, data)
```

The attachment contract also includes:

```ts
attachment.resize(cols, rows)
attachment.write(data)
```

This is not an architectural violation, but it creates an implementation ambiguity: the websocket should pipe to the active attachment stream, while Runtime Manager also exposes `write(sessionId)` and `resize(sessionId)`.

Risk:

- Implementers may store global attachment state in Runtime Manager prematurely.
- Multiple clients attached to the same tmux session may get inconsistent resize/write behavior.
- Generic websocket code may start depending on provider-specific attachment behavior.

Required clarification:

- Terminal websocket should write and resize the `RuntimeAttachment` returned by `RuntimeManager.attach(sessionId)`.
- Runtime Manager `write` and `resize` should either delegate to a tracked active attachment intentionally or be deferred until the multi-attachment policy is defined.
- Multi-client tmux attach behavior remains an explicit risk to test.

### Medium: `command` And `env` Are Allowed But Policy Is Not Decided

The generated API spec accepts:

```json
{
  "command": "claude",
  "args": [],
  "env": {}
}
```

The open questions correctly ask what command and environment policy should be allowed, but the API spec still presents these fields as normal request inputs.

This is a security and product-scope gap, especially under AGENTS.md guidance to keep destructive capabilities gated and preserve correctness.

Required clarification:

- Initial implementation should default to the configured Claude command.
- If arbitrary command/env support is not decided, mark these fields as advanced, allowlisted, or deferred.
- The create-session API should reject provider selection and should also reject unsafe command/environment inputs.

### Medium: Session Registry Foreign Key Open Question Blocks Create API Details

The registry spec proposes:

```sql
FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
```

but also leaves open whether Runtime Manager creates a dashboard `sessions` row before transcript data exists.

That is acceptable as an open question, but it blocks a concrete create-session implementation. The generated technical PR plan lists Create Session API before resolving this storage lifecycle.

Required clarification:

- The foreign-key strategy must be resolved before implementing `POST /api/runtime-sessions`.
- If placeholder dashboard session rows are used, their status/name/cwd behavior must be specified.
- If runtime records can exist independently, the schema must not require the existing foreign key.

### Low: Debug API Exposes Provider Fields As Intended, But Needs Stronger Boundary Language

The generated API spec exposes `provider` and `providerId` through:

```http
GET /api/runtime-sessions/:sessionId/debug
```

This is allowed by `docs/architecture/api.md`, which permits advanced/debug provider details. The boundary is correct, but the generated spec should state more explicitly that normal UI and normal API clients must not depend on the debug endpoint.

Required clarification:

- Debug provider fields are not stable user-facing contract.
- TerminalPane, session creation UI, and normal session list UI must not call debug APIs for core behavior.

### Low: Branch `AGENTS.md` Does Not Contain Runtime-Specific Rules

The generated branch currently contains the older generic `AGENTS.md`, while the working tree copy contains runtime-specific non-negotiable rules. The generated specifications align with those runtime-specific rules, but the branch itself does not include them.

Impact:

- Future agents reading only the branch may miss the stronger runtime constraints.

Required clarification:

- Include the runtime-specific `AGENTS.md` update in the documentation branch, or explicitly state that the review is against the runtime AGENTS instructions supplied outside the branch.

## Checks Against Key Architectural Rules

### Frontend Must Not Choose Provider

Status: Pass with minor caveat.

The generated specs repeatedly prohibit provider selection in normal UI and API requests. `provider` appears in registry records, runtime refs, provider interfaces, and debug responses only. This is consistent with ADR-003 and ADR-008.

Caveat:

- Ensure frontend API types do not expose `provider` as a create-session request option.

### xterm.js Must Remain Runtime-Agnostic

Status: Pass with route-migration caveat.

The specs keep TerminalPane responsible for presentation and websocket I/O only. They do not require xterm.js to know whether the backend is tmux or PTY.

Caveat:

- Do not force a TerminalPane route change in PR 1 or PR 2. The old `/terminal/:sessionId` endpoint should become runtime-backed internally.

### tmux Must Be A Provider

Status: Pass.

The generated specs consistently describe `TmuxRuntime` as a provider, not the platform. They correctly move tmux attach/create/status/terminate behavior behind the provider boundary.

### Persistence Policy Must Be Separate From Runtime Provider

Status: Pass.

The generated specs use `persistence: "ephemeral" | "persistent"` as request intent and keep provider selection in Runtime Manager. Registry records store both persistence and resolved provider, which is consistent with the architecture.

### Current tmux Workflow Must Remain Compatible

Status: Partial pass.

The generated specs repeatedly say current tmux attach behavior must continue working, and they preserve hook-discovered sessions in the design. However, the compatibility requirements need sharper acceptance criteria around:

- old websocket endpoint compatibility;
- Terminal tab visibility from existing metadata;
- additive migration from `metadata.tmux_session`;
- attach support when persistent creation is disabled.

## Missing Acceptance Criteria To Add Before Implementation

- Existing `/terminal/:sessionId` websocket still works after PR 1 and PR 2.
- Existing manually created tmux session appears in the dashboard exactly as before.
- Existing hook-discovered session with `metadata.tmux_session` shows the Terminal tab.
- Runtime Manager attach works before Session Registry is introduced.
- Runtime Manager attach works after Session Registry is introduced using either registry records or legacy metadata fallback.
- TmuxRuntime attach works even when tmux creation is disabled.
- TerminalPane contains no provider names in create/attach logic.
- Create session request type has no provider field.
- Debug endpoint is not used by normal frontend workflows.
- Existing tmux metadata is not removed until rollback is no longer needed.

## Recommended Specification Updates

1. Add a "Compatibility Endpoint" section to `technical-specification.md` and `api-specification.md`.
2. Add explicit PR acceptance criteria for old `/terminal/:sessionId` behavior.
3. Clarify that Terminal tab visibility remains metadata-backed until registry-backed visibility is proven.
4. Clarify `supports()` semantics or split create support from attach capability.
5. Mark `command` and `env` request fields as constrained or unresolved before implementation.
6. Resolve the Session Registry foreign-key strategy before implementing `POST /api/runtime-sessions`.
7. Include runtime-specific `AGENTS.md` in the documentation branch if this branch is intended to guide implementation.

## Review Conclusion

No core architectural violation was found in the generated specification. The provider boundary, persistence-policy separation, xterm.js runtime neutrality, and tmux-provider model are intact.

The specification should not be implemented as-is without tightening compatibility details. The highest-risk area is preserving the current tmux attach workflow while changing websocket and registry internals. The next revision should make the old `/terminal/:sessionId` path, existing `metadata.tmux_session`, and hook-discovered Terminal tab behavior explicit non-regression requirements.
