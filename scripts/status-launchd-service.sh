#!/usr/bin/env bash
set -euo pipefail

LABEL="com.claude-agent-monitor.service"
PORT="${DASHBOARD_PORT:-4820}"
HOST="${DASHBOARD_HOST:-127.0.0.1}"

usage() {
  cat <<EOF
Usage:
  scripts/status-launchd-service.sh [options]

Options:
  --label <label>    LaunchAgent label (default: ${LABEL})
  --port <port>      Dashboard port for health check (default: ${PORT})
  --host <host>      Dashboard host for health check (default: ${HOST})
  --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "launchd service status is only supported on macOS." >&2
  exit 1
fi

echo "launchd:"
if ! launchctl print "gui/${UID}/${LABEL}"; then
  echo "Service is not loaded."
fi

echo
echo "health:"
if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://${HOST}:${PORT}/api/health" || {
    echo
    echo "Health check failed."
    exit 1
  }
  echo
else
  echo "curl not found; skipped http://${HOST}:${PORT}/api/health"
fi
