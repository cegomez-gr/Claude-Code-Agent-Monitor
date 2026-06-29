# launchd Background Service

## Purpose

Run the dashboard backend as a per-user macOS LaunchAgent so the API, websocket
terminal, hooks, and runtime reconciliation keep working without an open
terminal window.

## Install

From the repository root:

```bash
npm run service:install
```

The installer:

- runs `npm run build` unless `--skip-build` is passed;
- writes `~/Library/LaunchAgents/com.claude-agent-monitor.service.plist`;
- writes logs to `~/Library/Logs/Claude-Code-Agent-Monitor/`;
- starts the service with `launchctl bootstrap`;
- runs `npm start` with `NODE_ENV=production`.

Optional arguments:

```bash
bash scripts/install-launchd-service.sh --port 4820 --host 127.0.0.1
bash scripts/install-launchd-service.sh --skip-build
```

## Status

```bash
npm run service:status
```

This prints the launchd job state and checks:

```text
http://127.0.0.1:4820/api/health
```

## Stop Or Uninstall

Unload the service but leave the plist:

```bash
npm run service:uninstall
```

Unload and remove the plist:

```bash
bash scripts/uninstall-launchd-service.sh --remove-plist
```

## Logs

```text
~/Library/Logs/Claude-Code-Agent-Monitor/stdout.log
~/Library/Logs/Claude-Code-Agent-Monitor/stderr.log
```

## Manual launchctl Commands

```bash
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.claude-agent-monitor.service.plist
launchctl kickstart -k gui/$UID/com.claude-agent-monitor.service
launchctl bootout gui/$UID/com.claude-agent-monitor.service
```

## Notes

- The service runs the production server command, not the dev server.
- The dashboard remains loopback-bound by default.
- Runtime provider selection remains unchanged: the frontend sends persistence
  intent and RuntimeManager resolves the provider.
