# Session Registry

## Purpose

The Session Registry is the authoritative mapping between application sessions and runtime execution state.

It prevents the application from scattering runtime state across hooks, frontend state, websocket code and provider internals.

## Initial storage

Initial implementation can use the existing storage mechanism used by the project.

A later implementation may use SQLite or another local store.

## Conceptual schema

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

  status: "starting" | "running" | "detached" | "exited" | "error";

  capabilities: RuntimeCapabilities;

  createdAt: string;
  updatedAt: string;
  lastAttachedAt?: string;
  exitedAt?: string;

  metadata?: {
    tmux?: {
      sessionName?: string;
      windowName?: string;
      paneId?: string;
      externallyDiscovered?: boolean;
    };
    pty?: {
      pid?: number;
    };
    claude?: {
      transcriptPath?: string;
      hookSessionId?: string;
    };
  };
}
```

## Provider-specific metadata

Provider-specific metadata must remain nested and optional.

Generic application logic should use generic fields first.

## Registry responsibilities

- Store created runtime sessions.
- Store discovered external sessions.
- Update status.
- Lookup runtime by application session ID.
- Rehydrate known persistent sessions after service restart.
- Provide listing for dashboard.

## Reconciliation

On service startup, the Runtime Manager should reconcile registry state with actual runtime state.

For tmux:

- list tmux sessions;
- match known provider IDs;
- mark missing sessions as exited/stale;
- import discovered compatible sessions if appropriate.

For PTY:

- ephemeral pty sessions cannot be rehydrated after service restart;
- mark them as exited/stale.

## Stale sessions

The dashboard should be able to show stale sessions but should not offer attach if the provider reports they no longer exist.
