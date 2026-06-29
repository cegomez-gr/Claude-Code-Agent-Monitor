# Runtime API Specification

## Audience And Action

This document is for engineers implementing or consuming the Runtime Platform HTTP and websocket API. After reading it, an engineer should know which endpoints to add, which request fields are allowed, and how terminal websocket messages are framed without exposing provider selection.

## API Principles

- API requests express user intent and lifecycle operations.
- Normal requests must not contain provider names.
- Provider metadata is available only through debug or advanced surfaces.
- Existing `/api/sessions` endpoints continue to represent Claude dashboard sessions and transcript history.
- New runtime lifecycle operations live under `/api/runtime-sessions`.

## Data Types

```ts
type PersistencePolicy = "ephemeral" | "persistent";
type RuntimeStatus = "starting" | "running" | "detached" | "exited" | "stale" | "error";

interface RuntimeCapabilities {
  attach: boolean;
  resize: boolean;
  write: boolean;
  terminate: boolean;
  persistent: boolean;
  externalAttach?: boolean;
}

interface RuntimeSessionSummary {
  sessionId: string;
  title?: string;
  cwd?: string;
  command: string;
  args?: string[];
  persistence: PersistencePolicy;
  status: RuntimeStatus;
  capabilities: RuntimeCapabilities;
  createdAt: string;
  updatedAt: string;
  lastAttachedAt?: string;
  exitedAt?: string;
}
```

## Create Runtime Session

```http
POST /api/runtime-sessions
```

Request:

```json
{
  "title": "Claude session",
  "cwd": "/Users/example/project",
  "command": "claude",
  "args": [],
  "env": {},
  "persistence": "persistent"
}
```

Validation:

- `persistence` is required and must be `ephemeral` or `persistent`.
- `provider` is not allowed.
- `cwd` is optional initially, but if provided must be an accessible local directory.
- `command` defaults to the configured Claude command if omitted.
- `args` defaults to an empty array.
- `env` is optional and should be allowlisted or sanitized before provider use.

Response `201`:

```json
{
  "sessionId": "sess_123",
  "title": "Claude session",
  "cwd": "/Users/example/project",
  "command": "claude",
  "args": [],
  "persistence": "persistent",
  "status": "running",
  "capabilities": {
    "attach": true,
    "resize": true,
    "write": true,
    "terminate": true,
    "persistent": true,
    "externalAttach": true
  },
  "createdAt": "2026-06-27T10:00:00.000Z",
  "updatedAt": "2026-06-27T10:00:00.000Z"
}
```

## List Runtime Sessions

```http
GET /api/runtime-sessions
```

Optional query parameters:

- `status`: filter by runtime status.
- `persistence`: filter by persistence policy.
- `cwd`: filter by working directory.
- `limit`: maximum returned rows.
- `offset`: pagination offset.

Response `200`:

```json
{
  "items": [
    {
      "sessionId": "sess_123",
      "title": "Claude session",
      "cwd": "/Users/example/project",
      "command": "claude",
      "args": [],
      "persistence": "persistent",
      "status": "running",
      "capabilities": {
        "attach": true,
        "resize": true,
        "write": true,
        "terminate": true,
        "persistent": true
      },
      "createdAt": "2026-06-27T10:00:00.000Z",
      "updatedAt": "2026-06-27T10:00:00.000Z",
      "lastAttachedAt": "2026-06-27T10:05:00.000Z"
    }
  ],
  "total": 1
}
```

## Get Runtime Session

```http
GET /api/runtime-sessions/:sessionId
```

Response `200`: `RuntimeSessionSummary`.

Response `404`:

```json
{
  "error": {
    "code": "RUNTIME_NOT_FOUND",
    "message": "Runtime session not found."
  }
}
```

## Terminate Runtime Session

```http
DELETE /api/runtime-sessions/:sessionId
```

Behavior:

- Ephemeral PTY sessions can be terminated directly if they are still running.
- Dashboard-owned persistent tmux sessions may be terminated after the request is authorized and confirmed by the UI.
- Externally discovered tmux sessions must not be terminated unless the user explicitly confirms that external runtime termination is intended.

Optional request body:

```json
{
  "confirmExternal": false
}
```

Response `200`:

```json
{
  "sessionId": "sess_123",
  "status": "exited"
}
```

## Terminal Websocket

```http
GET /api/runtime-sessions/:sessionId/terminal
```

This endpoint upgrades to websocket and attaches through Runtime Manager.

Client messages:

```json
{ "type": "input", "data": "..." }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "ping" }
```

Compatibility rule:

- During migration, the websocket may continue accepting raw string/binary input frames and JSON resize frames from the existing Terminal pane.
- The server should prefer explicit JSON message handling when the client is upgraded.

Server messages:

```json
{ "type": "output", "data": "..." }
{ "type": "status", "status": "running" }
{ "type": "exit", "code": 0, "signal": null }
{ "type": "error", "code": "RUNTIME_ATTACH_FAILED", "message": "Unable to attach runtime session." }
{ "type": "pong" }
```

Compatibility rule:

- During migration, raw output frames may continue to be sent to existing xterm.js clients.
- Once the client opts into JSON framing, output should use `{ "type": "output" }`.

## Debug Runtime Session

```http
GET /api/runtime-sessions/:sessionId/debug
```

This endpoint is optional and must not be required by normal UI flows.

Response `200`:

```json
{
  "sessionId": "sess_123",
  "provider": "tmux",
  "providerId": "ccam-sess-123",
  "metadata": {
    "tmux": {
      "sessionName": "ccam-sess-123",
      "windowName": "claude",
      "paneId": "%1",
      "externallyDiscovered": false
    }
  }
}
```

## Error Codes

| Code | Meaning |
|---|---|
| `RUNTIME_PROVIDER_UNAVAILABLE` | Required provider dependency is missing or disabled. |
| `RUNTIME_NOT_FOUND` | Runtime session ID is unknown. |
| `RUNTIME_ATTACH_FAILED` | Provider could not attach to the runtime. |
| `RUNTIME_CREATE_FAILED` | Provider could not create the runtime. |
| `RUNTIME_ALREADY_EXISTS` | Requested runtime record or provider ID already exists. |
| `RUNTIME_PERMISSION_DENIED` | Operation is not allowed. |
| `RUNTIME_INVALID_REQUEST` | Request validation failed. |
| `RUNTIME_UNSUPPORTED_PERSISTENCE` | No provider supports the requested persistence policy. |
| `RUNTIME_PROVIDER_ERROR` | Provider failed with an unclassified error. |

Error response shape:

```json
{
  "error": {
    "code": "RUNTIME_INVALID_REQUEST",
    "message": "The persistence field must be ephemeral or persistent.",
    "details": {
      "field": "persistence"
    }
  }
}
```

## Security And Access

- Reuse existing Host allowlist and token checks for HTTP and websocket upgrade paths.
- Do not expose raw provider command arguments in normal errors.
- Do not accept shell command strings that are concatenated into shell invocations.
- Validate `cwd`, `command`, `args`, and environment inputs before provider execution.
- Keep provider metadata behind debug or advanced endpoints.

## OpenAPI Updates

When implemented, add these endpoints to the existing OpenAPI generation:

- `POST /api/runtime-sessions`
- `GET /api/runtime-sessions`
- `GET /api/runtime-sessions/{sessionId}`
- `DELETE /api/runtime-sessions/{sessionId}`
- `GET /api/runtime-sessions/{sessionId}/debug`

OpenAPI cannot fully describe websocket frames, so include the websocket upgrade endpoint and document message schemas in route descriptions.
