#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.claude-agent-monitor.service"
PORT="${DASHBOARD_PORT:-4820}"
HOST="${DASHBOARD_HOST:-127.0.0.1}"
RUN_BUILD=true

usage() {
  cat <<EOF
Usage:
  scripts/install-launchd-service.sh [options]

Options:
  --label <label>     LaunchAgent label (default: ${LABEL})
  --port <port>       Dashboard port (default: ${PORT})
  --host <host>       Dashboard host (default: ${HOST})
  --skip-build        Do not run npm run build before installing
  --help              Show this help
EOF
}

xml_escape() {
  printf '%s' "$1" \
    | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --skip-build) RUN_BUILD=false; shift ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "launchd service install is only supported on macOS." >&2
  exit 1
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "Missing node_modules. Run npm install before installing the service." >&2
  exit 1
fi

if [[ "${RUN_BUILD}" == "true" ]]; then
  (cd "${ROOT_DIR}" && npm run build)
fi

PLIST_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/Claude-Code-Agent-Monitor"
PLIST_PATH="${PLIST_DIR}/${LABEL}.plist"
COMMAND="cd $(shell_quote "${ROOT_DIR}") && exec npm start"

mkdir -p "${PLIST_DIR}" "${LOG_DIR}"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "${LABEL}")</string>

  <key>WorkingDirectory</key>
  <string>$(xml_escape "${ROOT_DIR}")</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>$(xml_escape "${COMMAND}")</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>DASHBOARD_HOST</key>
    <string>$(xml_escape "${HOST}")</string>
    <key>DASHBOARD_PORT</key>
    <string>$(xml_escape "${PORT}")</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>StandardOutPath</key>
  <string>$(xml_escape "${LOG_DIR}/stdout.log")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "${LOG_DIR}/stderr.log")</string>
</dict>
</plist>
EOF

launchctl bootout "gui/${UID}/${LABEL}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${UID}" "${PLIST_PATH}"
launchctl kickstart -k "gui/${UID}/${LABEL}"

echo "Installed ${LABEL}"
echo "Plist: ${PLIST_PATH}"
echo "Logs: ${LOG_DIR}"
echo "URL: http://${HOST}:${PORT}"
