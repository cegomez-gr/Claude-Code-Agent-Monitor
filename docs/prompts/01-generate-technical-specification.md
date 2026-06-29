# Prompt 01: Generate Technical Specification

Read:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/architecture/`
- `docs/adr/`
- `docs/implementation/specification-request.md`

Task:

Generate a detailed technical specification for implementing the Runtime Platform architecture.

Rules:

- Do not write code.
- Do not modify existing source files.
- Generate Markdown only.
- Do not change architectural decisions.
- If there is ambiguity, add an Open Question.
- Keep the implementation incremental.
- Preserve current tmux terminal behavior.

Expected output:

- `docs/generated/technical-specification.md`
- `docs/generated/api-specification.md`
- `docs/generated/runtime-provider-interface.md`
- `docs/generated/session-registry-specification.md`
- `docs/generated/open-questions.md`
