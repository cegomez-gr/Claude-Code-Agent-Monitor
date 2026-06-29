# Prompt 02: Review Generated Specification

Review the generated specification against:

- `docs/architecture/`
- `docs/adr/`
- `AGENTS.md`

Task:

Find inconsistencies, missing requirements and architectural violations.

Do not implement code.

Output:

- `docs/generated/specification-review.md`

Focus especially on:

- frontend must not choose provider;
- xterm.js must remain runtime-agnostic;
- tmux must be a provider;
- persistence policy must be separate from runtime provider;
- current tmux workflow must remain compatible.
