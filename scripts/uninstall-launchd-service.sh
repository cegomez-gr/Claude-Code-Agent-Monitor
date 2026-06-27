#!/usr/bin/env bash
set -euo pipefail

LABEL="com.claude-agent-monitor.service"
REMOVE_PLIST=false

usage() {
  cat <<EOF
Usage:
  scripts/uninstall-launchd-service.sh [options]

Options:
  --label <label>    LaunchAgent label (default: ${LABEL})
  --remove-plist     Delete the plist after unloading
  --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --remove-plist) REMOVE_PLIST=true; shift ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "launchd service uninstall is only supported on macOS." >&2
  exit 1
fi

PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/${UID}/${LABEL}" >/dev/null 2>&1 || true

if [[ "${REMOVE_PLIST}" == "true" ]]; then
  rm -f "${PLIST_PATH}"
fi

echo "Unloaded ${LABEL}"
if [[ "${REMOVE_PLIST}" == "true" ]]; then
  echo "Removed ${PLIST_PATH}"
else
  echo "Plist left in place: ${PLIST_PATH}"
fi
