#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Complyze AI Shield — start-shield.sh
#
#  1. Starts proxy-server.js on port 8080
#  2. Enables macOS system HTTPS/HTTP proxy so all browser traffic routes through
#  3. Sets COMPLYZE_API to production (complyze.co) so events persist in Firebase
#     even when the local Next.js dev server isn't running
#  4. Optionally installs a LaunchAgent for auto-start on login
#
#  Usage:
#    ./scripts/start-shield.sh [--port 8080] [--install-agent]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROXY_PORT=${PROXY_PORT:-8080}
PROXY_HOST="127.0.0.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="${SCRIPT_DIR}/.."
PROXY_SCRIPT="${SCRIPT_DIR}/proxy-server.js"
LOG_FILE="${SCRIPT_DIR}/../logs/proxy.log"
INSTALL_AGENT=false

# Complyze production workspace ID (Firebase UID)
WORKSPACE_ID=${COMPLYZE_WORKSPACE:-"pDHzeZHAbkProJ2ATyJjHrGIJyO2"}

# ── Parse args ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)           PROXY_PORT="$2"; shift 2;;
    --install-agent)  INSTALL_AGENT=true; shift;;
    *)                shift;;
  esac
done

# ── Resolve the best API endpoint ────────────────────────────────────────────
# Prefer localhost:3737 if available (dev server with full logging), 
# otherwise fall back to production so events always reach Firebase.
if curl -sf --max-time 1 "http://localhost:3737/api/proxy/settings?workspaceId=${WORKSPACE_ID}" > /dev/null 2>&1; then
  COMPLYZE_API="http://localhost:3737/api/proxy/intercept"
  echo "📡 Logging to: localhost:3737 (local dev)"
else
  COMPLYZE_API="https://complyze.co/api/proxy/intercept"
  echo "📡 Logging to: complyze.co (production)"
fi

mkdir -p "$(dirname "$LOG_FILE")"

echo "🛡️  Complyze AI Shield — Starting..."
echo "   Workspace: ${WORKSPACE_ID}"
echo "   API:       ${COMPLYZE_API}"

# ── 1. Kill any stale proxy on our port ──────────────────────────────────────
lsof -ti :"${PROXY_PORT}" | xargs kill -SIGTERM 2>/dev/null || true
sleep 0.5
lsof -ti :"${PROXY_PORT}" | xargs kill -9 2>/dev/null || true

# ── 2. Start proxy ───────────────────────────────────────────────────────────
echo "🚀 Launching proxy server on port ${PROXY_PORT}..."

COMPLYZE_API="$COMPLYZE_API" \
COMPLYZE_WORKSPACE="$WORKSPACE_ID" \
FIREBASE_UID="$WORKSPACE_ID" \
  node "$PROXY_SCRIPT" --port "$PROXY_PORT" \
  >> "$LOG_FILE" 2>&1 &

PROXY_PID=$!
echo "  Proxy PID: ${PROXY_PID}"

# Save PID for stop-shield.sh
echo "$PROXY_PID" > "${SCRIPT_DIR}/../logs/proxy.pid"

# ── 3. Wait for port to open ─────────────────────────────────────────────────
STARTED=0
for i in $(seq 1 20); do
  sleep 0.5
  if nc -z "$PROXY_HOST" "$PROXY_PORT" 2>/dev/null; then
    STARTED=1
    break
  fi
done

if [[ "$STARTED" -eq 0 ]]; then
  echo "❌ Proxy failed to start on ${PROXY_HOST}:${PROXY_PORT} within 10s"
  echo "   Check logs: ${LOG_FILE}"
  exit 1
fi

echo "✅ Proxy running on ${PROXY_HOST}:${PROXY_PORT} (PID: ${PROXY_PID})"

# ── 4. Enable macOS system proxy ─────────────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  ACTIVE_IF=$(route get default 2>/dev/null | grep interface | awk '{print $2}' || echo "en0")

  # Try to find the network service name from the interface
  NETWORK_SERVICE=$(networksetup -listnetworkserviceorder 2>/dev/null \
    | grep -B1 "$ACTIVE_IF" | head -1 \
    | sed 's/^([0-9]*) //' | xargs 2>/dev/null || echo "")

  # Fallback: loop through common service names
  if [[ -z "$NETWORK_SERVICE" ]] || ! networksetup -getwebproxy "$NETWORK_SERVICE" &>/dev/null 2>&1; then
    for SVC in "Wi-Fi" "Thunderbolt Ethernet" "USB 10/100/1000 LAN" "Ethernet" "USB Ethernet"; do
      if networksetup -getwebproxy "$SVC" &>/dev/null 2>&1; then
        NETWORK_SERVICE="$SVC"
        break
      fi
    done
  fi

  NETWORK_SERVICE="${NETWORK_SERVICE:-Wi-Fi}"
  echo "🌐 Configuring system proxy on service: '${NETWORK_SERVICE}'"

  networksetup -setwebproxy            "${NETWORK_SERVICE}" 127.0.0.1 "${PROXY_PORT}"
  networksetup -setsecurewebproxy      "${NETWORK_SERVICE}" 127.0.0.1 "${PROXY_PORT}"
  networksetup -setwebproxystate       "${NETWORK_SERVICE}" on
  networksetup -setsecurewebproxystate "${NETWORK_SERVICE}" on

  WEB_STATE=$(networksetup -getwebproxy "${NETWORK_SERVICE}" | grep Enabled)
  if echo "$WEB_STATE" | grep -q "Yes"; then
    echo "✅ System proxy enabled → 127.0.0.1:${PROXY_PORT}"
  else
    echo "⚠️  System proxy may not be enabled — check System Settings > Network > Proxies"
  fi
fi

# ── 5. Install LaunchAgent for auto-start on login ───────────────────────────
if [[ "$INSTALL_AGENT" == "true" ]] && [[ "$(uname)" == "Darwin" ]]; then
  PLIST_PATH="$HOME/Library/LaunchAgents/co.complyze.shield.plist"
  NODE_BIN=$(which node)

  cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>co.complyze.shield</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/start-shield.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>COMPLYZE_WORKSPACE</key>
    <string>${WORKSPACE_ID}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${WEB_DIR}/logs/launchagent.log</string>
  <key>StandardErrorPath</key>
  <string>${WEB_DIR}/logs/launchagent-error.log</string>
</dict>
</plist>
PLIST

  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"
  echo "✅ LaunchAgent installed → auto-starts on login: ${PLIST_PATH}"
fi

# ── 6. Notify API ─────────────────────────────────────────────────────────────
curl -sf --max-time 2 -X POST \
  -H "Content-Type: application/json" \
  -d "{\"proxy_enabled\": true, \"workspaceId\": \"${WORKSPACE_ID}\"}" \
  "${COMPLYZE_API%/intercept}/settings" > /dev/null 2>&1 || true

echo ""
echo "🛡️  AI Shield ACTIVE"
echo "   Proxy:     http://${PROXY_HOST}:${PROXY_PORT}"
echo "   API:       ${COMPLYZE_API}"
echo "   Workspace: ${WORKSPACE_ID}"
echo "   Logs:      ${LOG_FILE}"
echo ""
echo "   To auto-start on login: ./scripts/start-shield.sh --install-agent"
echo "   To stop:                ./scripts/stop-shield.sh"
echo ""
