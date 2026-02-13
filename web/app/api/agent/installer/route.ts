/**
 * /api/agent/installer — GET
 * Serves a downloadable macOS installer script for the Complyze Agent.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const host = req.headers.get("host") || "web-one-beta-35.vercel.app";
    const protocol = host.includes("localhost") ? "http" : "https";
    const dashboardUrl = `${protocol}://${host}`;

    // Note: We use \$ for variables we want bash to expand, and ${} for variables we want Next.js to expand.
    const script = `#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Complyze Agent — macOS Installer
#  https://complyze.ai
# ═══════════════════════════════════════════════════════════════
set -e

# Define installation target
INSTALL_DIR="\$HOME/.complyze"
DASHBOARD_URL="${dashboardUrl}"

echo ""
echo "  🛡️  Complyze Agent Installer"
echo "  ───────────────────────────────"
echo ""

# ── Check dependencies ──
check_dep() {
    if ! command -v "\$1" &>/dev/null; then
        echo "  ❌ \$1 is required but not installed."
        echo "     Install it from: \$2"
        echo ""
        exit 1
    fi
    echo "  ✅ \$1 found"
}

check_dep "git"  "https://git-scm.com"
check_dep "node" "https://nodejs.org"
check_dep "npm"  "https://nodejs.org"
echo ""

# ── Clone or update the repository ──
if [ -d "\$INSTALL_DIR" ]; then
    echo "  📦 Updating existing installation..."
    cd "\$INSTALL_DIR"
    if [ -d ".git" ]; then
        git fetch --all --quiet
        git reset --hard origin/main --quiet
    else
        cd ..
        rm -rf "\$INSTALL_DIR"
        git clone --quiet https://github.com/dferdowsfy/cortex.git "\$INSTALL_DIR"
    fi
else
    echo "  📦 Downloading Complyze Agent..."
    git clone --quiet https://github.com/dferdowsfy/cortex.git "\$INSTALL_DIR"
fi
echo ""

# ── Install dependencies ──
echo "  📦 Installing dependencies..."
cd "\$INSTALL_DIR/desktop"
npm install --silent
echo ""

# ── Launch the agent ──
echo "  ✅ Installation complete!"
echo "  🚀 Launching Complyze Agent..."
echo ""
echo "  The agent will appear in your menu bar."
echo "  It will automatically configure your WiFi proxy."
echo ""
echo "  Dashboard: \$DASHBOARD_URL/monitoring"
echo ""

# Use the absolute path to electron and the app directory
# This fixes the "Unable to find Electron app at /Users/user" error
ELECTRON_BIN="\$INSTALL_DIR/desktop/node_modules/.bin/electron"
APP_PATH="\$INSTALL_DIR/desktop"

# Run in background and disown to persist after terminal closes
COMPLYZE_DASHBOARD="\$DASHBOARD_URL" "\$ELECTRON_BIN" "\$APP_PATH" &
disown

echo "  ✅ Agent is running in the background."
echo "  ───────────────────────────────────"
echo ""
sleep 2
exit 0
`;

    return new NextResponse(script, {
        status: 200,
        headers: {
            "Content-Type": "application/x-sh",
            "Content-Disposition": 'attachment; filename="install-complyze.command"',
            "Cache-Control": "no-cache",
        },
    });
}
