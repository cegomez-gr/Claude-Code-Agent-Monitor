# ADR-006: Preserve Existing tmux Workflow

## Status

Accepted

## Context

The current workflow supports manually created tmux sessions detected through hooks. This is valuable and should not break.

## Decision

Existing tmux sessions remain supported. The new TmuxRuntime must support both dashboard-created sessions and externally discovered tmux sessions.

## Consequences

- Migration can be incremental.
- Users can keep their current workflow.
- RuntimeManager must handle externally discovered provider references.
