# Runtime API

## Design principle

The API exposes user intent and session lifecycle, not provider internals.

## Create session

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
  "persistence": "persistent"
}
```

Response:

```json
{
  "sessionId": "sess_123",
  "status": "running",
  "persistence": "persistent",
  "capabilities": {
    "attach": true,
    "resize": true,
    "terminate": true,
    "persistent": true
  }
}
```

The request must not include provider selection in the normal UI flow.

## List sessions

```http
GET /api/runtime-sessions
```

Response:

```json
[
  {
    "sessionId": "sess_123",
    "title": "Claude session",
    "status": "running",
    "persistence": "persistent",
    "cwd": "/Users/example/project",
    "capabilities": {
      "attach": true,
      "terminate": true
    }
  }
]
```

## Get session

```http
GET /api/runtime-sessions/:sessionId
```

## Terminate session

```http
DELETE /api/runtime-sessions/:sessionId
```

For persistent tmux sessions, this should terminate the tmux session only if the session was created and is owned by the dashboard, or if the user explicitly confirms termination.

## Attach terminal

```http
GET /api/runtime-sessions/:sessionId/terminal
```

Upgrade to websocket.

Messages:

```json
{ "type": "input", "data": "..." }
{ "type": "resize", "cols": 120, "rows": 40 }
```

Server messages:

```json
{ "type": "output", "data": "..." }
{ "type": "status", "status": "running" }
{ "type": "exit", "code": 0 }
{ "type": "error", "code": "RUNTIME_ATTACH_FAILED", "message": "..." }
```

## Advanced/debug API

A debug endpoint may expose provider details, but it must not be required for the normal UI.

```http
GET /api/runtime-sessions/:sessionId/debug
```

This may include provider metadata such as tmux session name.
