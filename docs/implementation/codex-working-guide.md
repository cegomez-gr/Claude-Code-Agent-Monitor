# Codex Working Guide

## Recommended workflow

Use Codex in phases.

Do not ask Codex to "implement the runtime platform" in one step.

Use:

1. Prompt 01: Generate technical specification.
2. Human review.
3. Prompt 02: Review specification.
4. Human approval.
5. Prompt 03: Generate PR plan.
6. Human approval.
7. Prompt 04: Implement PR-1.
8. Repeat per PR.

## Good instruction pattern

```text
Implement only PR-N from docs/generated/pr-plan.md.
Do not implement future phases.
Preserve all existing behavior unless the PR explicitly changes it.
Before modifying code, list the files you expect to touch.
After modifying code, summarize changes and tests.
```

## Bad instruction pattern

```text
Implement the whole runtime architecture.
```

This is too broad and likely to cause architectural drift.

## Review checklist

Before accepting a Codex change, verify:

- UI does not import tmux-specific modules.
- TerminalPane remains runtime-agnostic.
- WebSocket delegates to RuntimeManager.
- RuntimeManager selects provider.
- TmuxRuntime contains tmux-specific logic.
- PtyRuntime contains node-pty direct spawn logic.
- SessionRegistry stores runtime-neutral records.
- Existing tmux attach still works.
