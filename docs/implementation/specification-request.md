# Specification Request for Codex / Claude Code

## Instruction

Read this document and the architecture docs. Do not implement code yet.

Generate a detailed technical specification for evolving the embedded terminal system into the Runtime Platform architecture.

## Required reading

- `docs/architecture/vision.md`
- `docs/architecture/runtime-platform.md`
- `docs/architecture/runtime-manager.md`
- `docs/architecture/runtime-providers.md`
- `docs/architecture/session-registry.md`
- `docs/architecture/api.md`
- `docs/architecture/deployment.md`
- `docs/adr/`

## Output required

Generate Markdown documents under `docs/generated/` or update the implementation docs with:

1. Detailed technical specification.
2. Concrete file/module changes.
3. TypeScript interfaces.
4. API routes.
5. WebSocket protocol changes.
6. Session Registry storage design.
7. Migration strategy from current tmux terminal implementation.
8. Test strategy.
9. PR-by-PR implementation plan.
10. Open questions.

## Constraints

- Do not implement code in this step.
- Do not change architecture decisions.
- Do not let frontend choose providers directly.
- Preserve existing tmux attach behavior.
- Keep xterm.js runtime-agnostic.
- Prefer incremental changes.
- If a decision is missing, add an open question instead of deciding silently.

## Expected implementation direction

The first implementation step should wrap existing tmux logic behind a `TmuxRuntime` provider and route terminal websocket attachment through `RuntimeManager`.

Only after this behavior is preserved should `PtyRuntime` and session creation APIs be added.
