#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  Complyze AI Shield — start-shield.sh
#
#  1. Starts the proxy-server.js on port 8080
#  2. Enables macOS system HTTPS/HTTP proxy (so browser traffic routes through it)
#  3. Verifies connectivity before returning
#
#  Usage:
#    ./scripts/start-shield.sh [--port 8080] [--api http://localhost:3737]
#
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

PROXY_PORT=${PROXY_PORT:-8080}
PROXY_HOST="127.0.0.1"
COMPLYZE_API=${COMPLYZE_API:-"http://localhost:3737/api/proxy/intercept"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_SCRIPT="${SCRIPT_DIR}/proxy-server.js"
LOG_FILE="${SCRIPT_DIR}/../logs/proxy.log"

# ── Parse args ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --port) PROXY_PORT="$2"; shift 2;;
    --api)  COMPLYZE_API="$2"; shift 2;;
    *)      shift;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")"

echo "🛡️  Complyze AI Shield — Starting..."

# ── 1. Check if proxy is already running ─────────────────────────
if nc -z "$PROXY_HOST" "$PROXY_PORT" 2>/dev/null; then
  echo "✅ Proxy already running on ${PROXY_HOST}:${PROXY_PORT}"
else
  echo "🚀 Launching proxy server on port ${PROXY_PORT}..."

  # Kill any stale node processes on our port just in case
  lsof -ti :"${PROXY_PORT}" | xargs kill -9 2>/dev/null || true

  # Start proxy in background
  COMPLYZE_API="$COMPLYZE_API" \
    node "$PROXY_SCRIPT" --port "$PROXY_PORT" \
    >> "$LOG_FILE" 2>&1 &

  PROXY_PID=$!
  echo "  Proxy PID: ${PROXY_PID}"

  # Wait up to 10s for port to open
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
fi

# ── 2. Enable macOS system proxy ─────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  # Find the active network service (Wi-Fi, Ethernet, etc.)
  ACTIVE_IF=$(route get default 2>/dev/null | grep interface | awk '{print $2}' || echo "en0")
  NETWORK_SERVICE=$(networksetup -listnetworkserviceorder 2>/dev/null \
    | grep -B 1 "$ACTIVE_IF" | head -n 1 | sed 's/^([0-9]*) //' | xargs || echo "Wi-Fi")

  # Fallback: try both common names
  if [[ -z "$NETWORK_SERVICE" ]] || ! networksetup -getwebproxy "$NETWORK_SERVICE" &>/dev/null; then
    for SVC in "Wi-Fi" "Thunderbolt Ethernet" "USB 10/100/1000 LAN" "Ethernet"; do
      if networksetup -getwebproxy "$SVC" &>/dev/null 2>&1; then
        NETWORK_SERVICE="$SVC"
        break
      fi
    done
  fi

  echo "🌐 Configuring system proxy on service: '${NETWORK_SERVICE}'"

  networksetup -setwebproxy         "${NETWORK_SERVICE}" 127.0.0.1 "${PROXY_PORT}"
  networksetup -setsecurewebproxy   "${NETWORK_SERVICE}" 127.0.0.1 "${PROXY_PORT}"
  networksetup -setwebproxystate    "${NETWORK_SERVICE}" on
  networksetup -setsecurewebproxystate "${NETWORK_SERVICE}" on

  # Verify
  WEB_STATE=$(networksetup -getwebproxy "${NETWORK_SERVICE}" | grep Enabled)
  HTTPS_STATE=$(networksetup -getsecurewebproxy "${NETWORK_SERVICE}" | grep Enabled)
  echo "  HTTP  proxy: ${WEB_STATE}"
  echo "  HTTPS proxy: ${HTTPS_STATE}"

  if echo "$WEB_STATE$HTTPS_STATE" | grep -q "Yes"; then
    echo "✅ System proxy enabled → 127.0.0.1:${PROXY_PORT}"
  else
    echo "⚠️  System proxy may not be enabled — check System Settings > Network > Proxies"
  fi
else
  echo "ℹ️  Non-macOS system — skip automatic proxy configuration"
fi

# ── 3. Notify Next.js API that proxy is live ─────────────────────
curl -s -X POST "${COMPLYZE_API%/intercept}/settings" \
  -H "Content-Type: application/json" \
  -d '{"proxy_enabled": true, "workspaceId": "default"}' \
  > /dev/null 2>&1 || true

echo ""
echo "🛡️  AI Shield ACTIVE"
echo "   Proxy:  http://${PROXY_HOST}:${PROXY_PORT}"
echo "   API:    ${COMPLYZE_API}"
echo "   Logs:   ${LOG_FILE}"
echo ""
echo "   To stop: ./scripts/stop-shield.sh"
echo ""
