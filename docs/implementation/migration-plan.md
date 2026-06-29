# Migration Plan

## Strategy

Use an incremental migration that preserves current functionality at every step.

## Current behavior to preserve

- Existing terminal tab works.
- Existing tmux session metadata is honored.
- Existing hooks continue to work.
- No user must change their manual tmux workflow.

## Migration stages

### Stage 1: Encapsulate

Move tmux attach logic behind `TmuxRuntime`.

No behavior change.

### Stage 2: Route

Introduce RuntimeManager and route websocket attach through it.

No behavior change.

### Stage 3: Register

Introduce SessionRegistry and map existing metadata into runtime records.

No behavior change.

### Stage 4: Create ephemeral

Add PtyRuntime and backend-only creation.

No required frontend change yet.

### Stage 5: Create persistent

Add TmuxRuntime creation.

Dashboard can now create tmux-backed sessions.

### Stage 6: UI

Add session creation UX.

### Stage 7: Service

Add launchd/service deployment.

## Rollback

Each PR should be independently revertible.

Feature flags may be used for:

- new session creation UI;
- PtyRuntime;
- persistent creation;
- background service scripts.

## Data migration

If existing sessions store `metadata.tmux_session`, map it to:

```json
{
  "provider": "tmux",
  "providerId": "<tmux_session>",
  "metadata": {
    "tmux": {
      "sessionName": "<tmux_session>",
      "externallyDiscovered": true
    }
  }
}
```
