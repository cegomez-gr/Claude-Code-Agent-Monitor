# Runtime Providers

## Purpose

Runtime Providers encapsulate execution-specific logic.

The application should never directly call tmux, node-pty or future runtimes from the frontend or generic websocket code.

## Provider interface

```ts
interface RuntimeProvider {
  name: string;

  supports(request: CreateRuntimeRequest): boolean;

  create(request: CreateRuntimeRequest): Promise<RuntimeRef>;

  attach(ref: RuntimeRef): Promise<RuntimeAttachment>;

  resize(ref: RuntimeRef, cols: number, rows: number): Promise<void>;

  write(ref: RuntimeRef, data: string): Promise<void>;

  terminate(ref: RuntimeRef): Promise<void>;

  status(ref: RuntimeRef): Promise<RuntimeStatus>;

  discover?(): Promise<RuntimeRef[]>;
}
```

## RuntimeAttachment

```ts
interface RuntimeAttachment {
  onData(callback: (data: string) => void): void;
  onExit(callback: (exit: RuntimeExit) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  dispose(): void;
}
```

## PtyRuntime

### Use case

Fast local sessions that do not need to survive the service.

### Create

The provider should spawn:

```bash
claude
```

or a configured command through node-pty.

### Attach

For PTY sessions, attach usually means returning the already-owned pty process stream.

### Persistence

Initial persistence: ephemeral.

### Risks

- process dies if service dies;
- no native reattach after service restart;
- needs cleanup on websocket/service shutdown.

## TmuxRuntime

### Use case

Persistent local sessions that should survive dashboard/browser/service restarts.

### Create

The provider should create a named tmux session and start Claude inside it.

Conceptually:

```bash
tmux new-session -d -s <session-name> -c <cwd> 'claude'
```

The actual command should be implemented safely without shell injection.

### Attach

The provider should attach via node-pty running tmux attach or an equivalent tmux control-mode strategy.

Initial implementation may use:

```bash
tmux attach-session -t <session-name>
```

### Discovery

TmuxRuntime should be able to discover:

- dashboard-created tmux sessions from SessionRegistry;
- existing external tmux sessions discovered from hooks/current metadata.

### Persistence

Initial persistence: persistent.

### Risks

- tmux may not be installed;
- tmux session names must be sanitized;
- multiple dashboard clients attaching to the same tmux session may need careful behavior;
- terminal size negotiation matters.

## Future providers

Future providers may include:

- DockerRuntime
- SSHRuntime
- KubernetesRuntime
- RemoteDaemonRuntime

They must implement the same interface.
