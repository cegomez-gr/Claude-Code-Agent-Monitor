# Runtime Provider Interface Specification

## Audience And Action

This document is for engineers implementing Runtime Manager and provider modules. After reading it, an engineer should be able to add `TmuxRuntime` and `PtyRuntime` without leaking provider details into React components, xterm.js, or generic websocket transport.

## Type Contracts

```ts
export type PersistencePolicy = "ephemeral" | "persistent";

export type RuntimeProviderName = "pty" | "tmux";

export type RuntimeStatus =
  | "starting"
  | "running"
  | "detached"
  | "exited"
  | "stale"
  | "error";

export interface RuntimeCapabilities {
  attach: boolean;
  resize: boolean;
  write: boolean;
  terminate: boolean;
  persistent: boolean;
  externalAttach?: boolean;
}

export interface CreateRuntimeRequest {
  sessionId?: string;
  title?: string;
  cwd?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  persistence: PersistencePolicy;
}

export interface RuntimeRef {
  sessionId: string;
  provider: RuntimeProviderName;
  providerId: string;
  persistence: PersistencePolicy;
  status: RuntimeStatus;
  capabilities: RuntimeCapabilities;
  metadata?: Record<string, unknown>;
}

export interface RuntimeExit {
  code: number | null;
  signal?: string | null;
}

export interface RuntimeAttachment {
  onData(callback: (data: string | Uint8Array) => void): void;
  onExit(callback: (exit: RuntimeExit) => void): void;
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  dispose(): void;
}

export interface RuntimeProvider {
  name: RuntimeProviderName;
  capabilities: RuntimeCapabilities;

  supports(request: CreateRuntimeRequest): boolean;
  create(request: CreateRuntimeRequest): Promise<RuntimeRef>;
  attach(ref: RuntimeRef): Promise<RuntimeAttachment>;
  resize(ref: RuntimeRef, cols: number, rows: number): Promise<void>;
  write(ref: RuntimeRef, data: string | Uint8Array): Promise<void>;
  terminate(ref: RuntimeRef): Promise<void>;
  status(ref: RuntimeRef): Promise<RuntimeStatus>;
  discover?(): Promise<RuntimeRef[]>;
}
```

The implementation may be CommonJS JavaScript initially. These interfaces define the expected shape and should be translated to JSDoc or TypeScript based on the project’s server language direction.

## Runtime Manager Contract

```ts
export interface RuntimeManager {
  create(request: CreateRuntimeRequest): Promise<RuntimeRef>;
  attach(sessionId: string): Promise<RuntimeAttachment>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  write(sessionId: string, data: string | Uint8Array): Promise<void>;
  terminate(sessionId: string, options?: { confirmExternal?: boolean }): Promise<void>;
  get(sessionId: string): Promise<RuntimeRef | null>;
  list(filters?: RuntimeListFilters): Promise<RuntimeRef[]>;
  reconcile(): Promise<void>;
}

export interface RuntimeListFilters {
  status?: RuntimeStatus;
  persistence?: PersistencePolicy;
  cwd?: string;
  limit?: number;
  offset?: number;
}
```

## Provider Selection

Initial selection is fixed by accepted architecture:

```ts
function selectProvider(request: CreateRuntimeRequest): RuntimeProviderName {
  if (request.persistence === "persistent") return "tmux";
  return "pty";
}
```

This function belongs inside Runtime Manager. Frontend code and normal API request bodies must not select a provider.

## TmuxRuntime Requirements

### Supports

`TmuxRuntime.supports` returns true for persistent requests when tmux is available and provider creation is enabled.

### Create

TmuxRuntime create must:

- generate or validate a safe session name;
- create a detached tmux session in the requested working directory;
- start the configured command and args without shell injection;
- return a `RuntimeRef` with `provider: "tmux"`;
- mark dashboard-created sessions as owned by the dashboard in metadata.

Provider metadata:

```ts
interface TmuxRuntimeMetadata {
  tmux: {
    sessionName: string;
    windowName?: string;
    paneId?: string;
    externallyDiscovered: boolean;
    dashboardOwned: boolean;
  };
}
```

### Attach

TmuxRuntime attach must:

- attach to the stored tmux session name;
- use node-pty or an equivalent stream strategy;
- preserve current terminal behavior during PR 1;
- support resize and input forwarding;
- close the runtime attachment when the websocket closes without killing the underlying tmux session.

### Discover

TmuxRuntime discover should return compatible existing tmux sessions from:

- registry records created by the dashboard;
- hook-discovered metadata currently stored on session rows;
- live tmux inspection during reconciliation when safe.

### Terminate

TmuxRuntime terminate must:

- terminate dashboard-owned persistent sessions when requested;
- refuse externally discovered sessions unless explicit confirmation is provided;
- normalize tmux command failures into Runtime Manager error codes.

## PtyRuntime Requirements

### Supports

`PtyRuntime.supports` returns true for ephemeral requests when node-pty is available and provider creation is enabled.

### Create

PtyRuntime create must:

- spawn the configured command directly through node-pty;
- avoid shell concatenation;
- set the requested working directory when provided;
- store process identity in provider metadata;
- return a `RuntimeRef` with `provider: "pty"`.

Provider metadata:

```ts
interface PtyRuntimeMetadata {
  pty: {
    pid?: number;
  };
}
```

### Attach

For initial ephemeral sessions, attach returns the owned PTY process stream. If the service restarts, the registry record must be marked stale or exited because the PTY cannot be rehydrated.

### Terminate

PtyRuntime terminate must:

- end the PTY process;
- remove internal process handles;
- update status through Runtime Manager and Session Registry.

## Attachment Semantics

`RuntimeAttachment.dispose()` detaches the websocket/client from the runtime stream. It must not always terminate the underlying runtime:

| Provider | Dispose Behavior |
|---|---|
| `tmux` | Detach/kill attach process only; keep tmux session alive. |
| `pty` | Detach client; process lifetime remains controlled by provider policy and explicit terminate. |

Open question: whether initial PTY sessions should terminate when the last websocket detaches is not decided in the accepted architecture.

## Error Normalization

Providers may throw provider-specific errors, but Runtime Manager exposes normalized errors:

```ts
interface RuntimeError extends Error {
  code:
    | "RUNTIME_PROVIDER_UNAVAILABLE"
    | "RUNTIME_NOT_FOUND"
    | "RUNTIME_ATTACH_FAILED"
    | "RUNTIME_CREATE_FAILED"
    | "RUNTIME_ALREADY_EXISTS"
    | "RUNTIME_PERMISSION_DENIED"
    | "RUNTIME_INVALID_REQUEST"
    | "RUNTIME_UNSUPPORTED_PERSISTENCE"
    | "RUNTIME_PROVIDER_ERROR";
  details?: Record<string, unknown>;
}
```

Provider command stderr may be included in debug details but should not appear in normal user-facing messages.

## Implementation Sequence

1. Define contracts and TmuxRuntime attach using existing behavior.
2. Add Runtime Manager attach path.
3. Add Session Registry-backed lookup.
4. Add PtyRuntime.
5. Add provider create and terminate behavior.
6. Add discovery and reconciliation.

This order preserves the current tmux terminal before new creation behavior is added.
