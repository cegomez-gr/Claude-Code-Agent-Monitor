# Claude-Code-Agent-Monitor Runtime Platform Documentation Pack

Generated: 2026-06-27

This package contains architecture, specification, ADRs, implementation guidance, migration notes, diagrams and agent prompts for evolving `Claude-Code-Agent-Monitor` from an embedded tmux terminal integration into a runtime-oriented platform.

## How to use this pack

Copy the contents of this package into the root of the repository.

Recommended order:

1. Read `docs/architecture/vision.md`.
2. Read `docs/architecture/runtime-platform.md`.
3. Read all ADRs in `docs/adr/`.
4. Give `docs/implementation/specification-request.md` to Codex or Claude Code.
5. Use the prompts in `docs/prompts/` one phase at a time.
6. Implement incrementally following `docs/implementation/implementation-plan.md`.

## Important architectural rule

The frontend must express user intent, not implementation details.

The user may request a session that is ephemeral or persistent. The frontend must not directly choose `tmux`, `pty`, or any other provider. Provider selection belongs to the Runtime Manager.

## Main decisions

- Introduce a `RuntimeManager`.
- Introduce pluggable `RuntimeProvider` implementations.
- Start with `PtyRuntime` and `TmuxRuntime`.
- Use tmux for persistent local sessions.
- Use local PTY for ephemeral sessions.
- Keep xterm.js runtime-agnostic.
- Preserve compatibility with manually created tmux sessions.
- Move toward a background service managed by `launchd` on macOS.
