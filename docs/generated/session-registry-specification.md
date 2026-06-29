# Session Registry Specification

## Audience And Action

This document is for engineers implementing runtime state persistence and reconciliation. After reading it, an engineer should be able to store runtime-neutral records while preserving existing session and tmux metadata behavior.

## Purpose

The Session Registry is the authoritative mapping between dashboard session IDs and runtime execution state. It prevents runtime details from being scattered across hooks, frontend state, websocket handlers, and provider internals.

The registry does not replace existing transcript, token, agent, or event storage. It complements the existing session model with runtime lifecycle metadata.

## Storage Design

Use the existing SQLite database mechanism for the initial implementation. Add a dedicated runtime table rather than putting provider fields directly on the existing sessions table.

Proposed table:

```sql
CREATE TABLE IF NOT EXISTS runtime_sessions (
  session_id TEXT PRIMARY KEY,
  title TEXT,
  cwd TEXT,
  command TEXT NOT NULL,
  args TEXT,
  env TEXT,
  persistence TEXT NOT NULL CHECK(persistence IN ('ephemeral', 'persistent')),
  provider TEXT NOT NULL CHECK(provider IN ('pty', 'tmux')),
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'detached', 'exited', 'stale', 'error')),
  capabilities TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_attached_at TEXT,
  exited_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_provider
  ON runtime_sessions(provider, provider_id);

CREATE INDEX IF NOT EXISTS idx_runtime_sessions_status
  ON runtime_sessions(status);

CREATE INDEX IF NOT EXISTS idx_runtime_sessions_persistence
  ON runtime_sessions(persistence);
```

Open question: created runtime sessions may need dashboard session rows before transcript data exists. The implementation should decide whether Runtime Manager creates a row in `sessions` first or whether `runtime_sessions.session_id` can temporarily exist without a foreign key.

## Record Shape

```ts
interface RuntimeSessionRecord {
  sessionId: string;
  title?: string;
  cwd?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  persistence: "ephemeral" | "persistent";
  provider: "pty" | "tmux";
  providerId: string;
  status: "starting" | "running" | "detached" | "exited" | "stale" | "error";
  capabilities: RuntimeCapabilities;
  createdAt: string;
  updatedAt: string;
  lastAttachedAt?: string;
  exitedAt?: string;
  metadata?: RuntimeProviderMetadata;
}

interface RuntimeProviderMetadata {
  tmux?: {
    sessionName?: string;
    windowName?: string;
    paneId?: string;
    externallyDiscovered?: boolean;
    dashboardOwned?: boolean;
  };
  pty?: {
    pid?: number;
  };
  claude?: {
    transcriptPath?: string;
    hookSessionId?: string;
  };
}
```

Provider-specific data must remain nested in `metadata`. Generic code should use `provider`, `providerId`, `status`, `persistence`, and `capabilities` first.

## Registry Interface

```ts
interface SessionRegistry {
  create(record: RuntimeSessionRecord): Promise<RuntimeSessionRecord>;
  upsert(record: RuntimeSessionRecord): Promise<RuntimeSessionRecord>;
  get(sessionId: string): Promise<RuntimeSessionRecord | null>;
  getByProvider(provider: RuntimeProviderName, providerId: string): Promise<RuntimeSessionRecord | null>;
  list(filters?: RuntimeSessionFilters): Promise<RuntimeSessionRecord[]>;
  updateStatus(sessionId: string, status: RuntimeStatus, timestamps?: RuntimeTimestamps): Promise<void>;
  updateAttachment(sessionId: string, attachedAt: string): Promise<void>;
  updateMetadata(sessionId: string, metadata: RuntimeProviderMetadata): Promise<void>;
  remove(sessionId: string): Promise<void>;
}
```

## Migration From Existing Metadata

Existing hook-discovered tmux metadata should be mapped into registry records.

Current source:

```json
{
  "tmux_session": "my-existing-session"
}
```

Registry record:

```json
{
  "sessionId": "<existing-dashboard-session-id>",
  "command": "claude",
  "persistence": "persistent",
  "provider": "tmux",
  "providerId": "my-existing-session",
  "status": "running",
  "capabilities": {
    "attach": true,
    "resize": true,
    "write": true,
    "terminate": false,
    "persistent": true,
    "externalAttach": true
  },
  "metadata": {
    "tmux": {
      "sessionName": "my-existing-session",
      "externallyDiscovered": true,
      "dashboardOwned": false
    }
  }
}
```

The migration must be additive. Keep the existing metadata value during early PRs so rollback preserves current terminal behavior.

## Reconciliation

Runtime Manager should reconcile registry records on service startup.

### Tmux Reconciliation

1. List known persistent `tmux` records.
2. Query live tmux sessions.
3. Mark records found in tmux as `running` or `detached`.
4. Mark records missing from tmux as `stale` or `exited`.
5. Import compatible hook-discovered sessions that do not yet have runtime records.

Externally discovered sessions should remain externally discovered. Dashboard-owned sessions should remain dashboard owned.

### PTY Reconciliation

Ephemeral PTY sessions cannot be rehydrated after service restart. On startup:

1. List known `pty` records not already exited.
2. Mark them `stale` or `exited`.
3. Clear or ignore stale process metadata.

Open question: accepted docs allow stale sessions to be shown, but do not decide whether stale PTY sessions should be `stale` or `exited`.

## Status Transitions

Allowed lifecycle:

```text
starting -> running
starting -> error
running -> detached
detached -> running
running -> exited
running -> error
detached -> exited
detached -> stale
stale -> exited
error -> exited
```

Registry writes should update `updatedAt`. Exiting should set `exitedAt`. Attach should set `lastAttachedAt`.

## Capabilities

Capabilities are stored as JSON so the UI can enable or disable actions without inferring provider internals.

Examples:

```json
{
  "attach": true,
  "resize": true,
  "write": true,
  "terminate": true,
  "persistent": false
}
```

Externally discovered tmux session:

```json
{
  "attach": true,
  "resize": true,
  "write": true,
  "terminate": false,
  "persistent": true,
  "externalAttach": true
}
```

## Ownership Rules

- Dashboard-owned runtime sessions may be terminated by dashboard actions.
- Externally discovered tmux sessions should not be terminated by default.
- Provider metadata must record ownership clearly.
- Debug details may show provider name and provider ID; normal UI should show persistence and capabilities.

## Test Coverage

- Creates runtime records with required fields.
- Rejects invalid persistence, provider, and status values.
- Lists by status and persistence.
- Looks up by provider and provider ID.
- Migrates existing tmux metadata additively.
- Marks PTY records stale after restart.
- Marks missing tmux records stale or exited during reconciliation.
- Preserves existing dashboard session data.
