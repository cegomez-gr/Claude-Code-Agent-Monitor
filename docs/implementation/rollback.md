# Runtime Platform Rollback

## When to roll back

- Runtime sessions fail to create consistently
- Terminal attach fails for all sessions
- Reconciliation loop causes high CPU or crashes
- Database corruption in `runtime_sessions` table

## Rollback procedure

### Step 1 — Stop the service

```bash
npm run service:uninstall   # if running as launchd service
```

Or kill the process directly.

### Step 2 — Revert to a known-good commit

```bash
git log --oneline -10       # find the last known-good commit
git checkout <commit>       # or git revert if on a shared branch
```

### Step 3 — Clear runtime state (if DB is corrupt)

Back up first:
```bash
cp data/dashboard.db data/dashboard.db.bak
```

Clear runtime sessions only:
```bash
sqlite3 data/dashboard.db "DELETE FROM runtime_sessions;"
```

### Step 4 — Restart

```bash
npm start
```

## What is preserved

- All Claude Code sessions and events (`sessions`, `agents`, `events` tables)
- All settings

## What is lost on rollback

- Active runtime session references (sessions continue in tmux but lose dashboard linkage)
- Any runtime_sessions table data

## External tmux sessions

External tmux sessions (`tmux ls`) are never touched by rollback. They continue running independently.

## Compatibility

The old direct terminal attach path (pre-runtime-manager) is still present in the codebase and is identified in `compatibility-audit.md`. It can be re-enabled as a fallback if needed.
