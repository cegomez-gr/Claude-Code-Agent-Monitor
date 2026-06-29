# Runtime Platform QA Runbook

## Workflow 1: External tmux (manual)

1. Start a tmux session externally:
   ```bash
   tmux new-session -s test-ext -d
   ```

2. Start the dashboard:
   ```bash
   npm start
   ```

3. Navigate to the session in the dashboard

4. Open the terminal tab — should attach to the existing tmux session

5. Type a command; verify output appears in both the dashboard terminal and:
   ```bash
   tmux attach -t test-ext
   ```

6. Close the dashboard; verify tmux session still exists:
   ```bash
   tmux ls
   ```

**Pass criteria:** attach works, session survives dashboard close.

## Workflow 2: Dashboard-owned persistent session

1. Start the dashboard:
   ```bash
   npm start
   ```

2. Click "New session" → enable "Keep running after dashboard closes" → Create

3. Note the session ID

4. Open the terminal tab — verify it connects

5. Run a command; verify output

6. Close the dashboard (`Ctrl+C` or kill process)

7. Restart the dashboard:
   ```bash
   npm start
   ```

8. Navigate to the session — verify it appears and terminal reattaches

**Pass criteria:** session persists, terminal reattaches after restart.

## Workflow 3: Ephemeral session

1. Start the dashboard:
   ```bash
   npm start
   ```

2. Click "New session" → keep "Keep running after dashboard closes" OFF → Create

3. Open the terminal tab — verify it connects

4. Run a command; verify output

5. Close the dashboard

6. Restart the dashboard:
   ```bash
   npm start
   ```

7. Verify the session is gone (ephemeral; not persisted across restart)

**Pass criteria:** session disappears after dashboard restart.

## Workflow 4: Restart reconciliation

1. Create one persistent and one ephemeral session

2. Stop the dashboard abruptly:
   ```bash
   kill -9 <pid>
   ```

3. Restart:
   ```bash
   npm start
   ```

4. Verify: persistent session appears; ephemeral session is absent or marked exited

5. Verify terminal reattach works for the persistent session

**Pass criteria:** reconciliation restores only persistent sessions.

## Workflow 5: Terminate session

1. Create any session from the dashboard

2. Open the terminal tab; verify connection

3. Click "Terminate" in the session detail page

4. Confirm the dialog

5. Verify status changes to "terminated" or similar

6. Verify terminal disconnects gracefully

**Pass criteria:** terminate cleans up without errors in the console.

## Provider-neutral check

- Frontend should never show "tmux" or "PTY" labels in normal UI
- Provider info only visible via the debug panel (Show debug details)
- xterm.js connects via `/api/runtime-sessions/:id/terminal` — no provider-specific URL

## Rollback note

See rollback.md for emergency rollback procedure.
