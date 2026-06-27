# Test Strategy

## Unit tests

### RuntimeManager

- selects PtyRuntime for ephemeral sessions;
- selects TmuxRuntime for persistent sessions;
- rejects unsupported persistence policy;
- normalizes provider errors;
- delegates attach/resize/write/terminate.

### PtyRuntime

- spawns configured command;
- emits output;
- accepts input;
- handles resize;
- handles process exit.

### TmuxRuntime

- builds safe tmux commands;
- rejects unsafe session names;
- detects missing tmux binary;
- attaches to existing session;
- creates persistent session.

### SessionRegistry

- stores runtime-neutral records;
- updates status;
- lists sessions;
- reconciles stale sessions.

## Integration tests

- websocket attaches to runtime session;
- terminal input reaches provider;
- provider output reaches websocket;
- resize messages are handled.

## Manual QA

### Existing workflow

1. Create tmux session manually.
2. Start Claude inside tmux.
3. Ensure hook metadata is discovered.
4. Open dashboard.
5. Attach terminal.
6. Confirm interaction works.

### Ephemeral workflow

1. Open dashboard.
2. Click New Session.
3. Confirm Claude starts.
4. Interact through terminal.
5. Stop session.
6. Confirm status updates.

### Persistent workflow

1. Open dashboard.
2. Create persistent session.
3. Close browser.
4. Reopen dashboard.
5. Attach again.
6. Confirm Claude is still running.

### Service workflow

1. Install launchd service.
2. Reboot or log out/in.
3. Open dashboard without terminal.
4. Confirm service is running.
