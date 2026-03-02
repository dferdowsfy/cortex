#!/usr/bin/env bash
# =============================================================================
#  Complyze Shield — Daemon Installer
#
#  Installs the Complyze monitoring agent as a persistent macOS LaunchAgent
#  so it starts automatically on every login with no user interaction.
#
#  Usage (called by the Admin Hub after downloading the agent):
#    curl -fsSL https://complyze.co/install | bash -s -- --token YOUR_TOKEN
#    — OR —
#    ./install-daemon.sh --token YOUR_TOKEN [--dashboard https://complyze.co]
#
#  What it does:
#    1. Copies the agent binary to ~/Library/Complyze/
#    2. Creates a LaunchAgent plist that starts the agent on login
#    3. Loads the agent immediately (no reboot required)
#    4. Enrolls the device using the provided token
# =============================================================================

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
ENROLL_TOKEN=""
DASHBOARD_URL="${DASHBOARD_URL:-https://complyze.co}"
AGENT_NAME="com.complyze.shield"
INSTALL_DIR="$HOME/Library/Complyze"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/${AGENT_NAME}.plist"
LOG_DIR="$HOME/Library/Logs/Complyze"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Parse Args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --token)
            ENROLL_TOKEN="$2"; shift 2 ;;
        --dashboard)
            DASHBOARD_URL="$2"; shift 2 ;;
        *)
            echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo "  ✅  $*"; }
warn()    { echo "  ⚠️   $*"; }
error()   { echo "  ❌  $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────"; }

# ── Preflight ─────────────────────────────────────────────────────────────────
section "Complyze Shield Installer"
echo "  Dashboard : $DASHBOARD_URL"
echo "  Install to: $INSTALL_DIR"
echo ""

if [[ -z "$ENROLL_TOKEN" ]]; then
    error "No enrollment token provided. Run with --token YOUR_TOKEN"
fi

if ! command -v node &>/dev/null; then
    error "Node.js is required but not found. Install from https://nodejs.org"
fi

NODE_BIN="$(command -v node)"
info "Node found at: $NODE_BIN"

# ── Create directories ────────────────────────────────────────────────────────
section "Setting up directories"
mkdir -p "$INSTALL_DIR"
mkdir -p "$PLIST_DIR"
mkdir -p "$LOG_DIR"
info "Directories created"

# ── Copy agent files ──────────────────────────────────────────────────────────
section "Installing agent"
cp -r "$AGENT_ROOT/"* "$INSTALL_DIR/"
info "Agent files installed to $INSTALL_DIR"

# ── Install node_modules if missing ──────────────────────────────────────────
if [[ ! -d "$INSTALL_DIR/node_modules" ]]; then
    section "Installing dependencies"
    (cd "$INSTALL_DIR" && npm install --production --silent)
    info "Dependencies installed"
fi

# ── Electron binary ───────────────────────────────────────────────────────────
ELECTRON_BIN="$INSTALL_DIR/node_modules/.bin/electron"
if [[ ! -f "$ELECTRON_BIN" ]]; then
    warn "Electron binary not in node_modules — installing"
    (cd "$INSTALL_DIR" && npm install electron --save-exact --silent)
fi

# ── Write LaunchAgent plist ───────────────────────────────────────────────────
section "Creating LaunchAgent"
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${AGENT_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${ELECTRON_BIN}</string>
        <string>${INSTALL_DIR}</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>COMPLYZE_DASHBOARD</key>
        <string>${DASHBOARD_URL}</string>
        <key>COMPLYZE_API</key>
        <string>${DASHBOARD_URL}/api/proxy/intercept</string>
    </dict>

    <!-- Start immediately on load and restart if it crashes -->
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <!-- Logs -->
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/shield.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/shield-error.log</string>

    <!-- Throttle failed restarts -->
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
PLIST

chmod 644 "$PLIST_PATH"
info "LaunchAgent plist created at $PLIST_PATH"

# ── Load the service ──────────────────────────────────────────────────────────
section "Starting Complyze Shield"

# Unload existing instance if running
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Load and start
launchctl load -w "$PLIST_PATH"
info "Complyze Shield started (runs on every login)"

# ── Enroll device with token ──────────────────────────────────────────────────
section "Enrolling device"
sleep 2  # wait for app to settle

# Send enrollment token via complyze:// protocol
open "complyze://enroll?token=${ENROLL_TOKEN}&dashboard=${DASHBOARD_URL}" 2>/dev/null || true
info "Enrollment token sent — check your menu bar for a green shield icon"

# ── Done ──────────────────────────────────────────────────────────────────────
section "Installation complete"
echo ""
echo "  🛡️  Complyze Shield is now protecting this device."
echo ""
echo "  The shield runs silently in your menu bar."
echo "  Manage this device from: $DASHBOARD_URL/admin"
echo ""
echo "  To uninstall: launchctl unload $PLIST_PATH && rm -rf $INSTALL_DIR"
echo ""
