#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  Complyze AI Shield — stop-shield.sh
#  Stops proxy and disables macOS system proxy
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

PROXY_PORT=${PROXY_PORT:-8080}

echo "🛡️  Complyze AI Shield — Stopping..."

# ── Kill proxy process ───────────────────────────────────────────
if lsof -ti :"${PROXY_PORT}" > /dev/null 2>&1; then
  echo "  Stopping proxy on port ${PROXY_PORT}..."
  lsof -ti :"${PROXY_PORT}" | xargs kill -SIGTERM 2>/dev/null || true
  sleep 1
  # Force kill if still running
  lsof -ti :"${PROXY_PORT}" | xargs kill -9 2>/dev/null || true
  echo "✅ Proxy stopped"
else
  echo "  Proxy was not running on port ${PROXY_PORT}"
fi

# ── Disable macOS system proxy ───────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  for SVC in "Wi-Fi" "Thunderbolt Ethernet" "USB 10/100/1000 LAN" "Ethernet"; do
    if networksetup -getwebproxy "$SVC" &>/dev/null 2>&1; then
      networksetup -setwebproxystate      "$SVC" off 2>/dev/null || true
      networksetup -setsecurewebproxystate "$SVC" off 2>/dev/null || true
      echo "✅ System proxy disabled on '${SVC}'"
    fi
  done
fi

echo "🛡️  AI Shield INACTIVE"
