import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/installer?org_id=&group_id=&platform=mac|win&workspaceId=
 *
 * Generates and returns a shell installer script (.sh for mac, .ps1 for win)
 * with the enrollment token baked in. This is what IT deploys via MDM or
 * runs once on each endpoint.
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const org_id = url.searchParams.get("org_id") || "";
        const group_id = url.searchParams.get("group_id") || "";
        const platform = (url.searchParams.get("platform") || "mac") as "mac" | "win";
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        if (!org_id) {
            return NextResponse.json({ error: "org_id is required" }, { status: 400 });
        }

        const org = await enrollmentStore.getOrganization(org_id, workspaceId);
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        // Generate a fresh enrollment token for this installer (7-day TTL, unlimited uses)
        const token = await enrollmentStore.createToken(org_id, 168, null, workspaceId);

        const controlPlaneUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://complyze.co";
        const agentVersion = "2.1.0";

        if (platform === "mac") {
            const script = generateMacScript({
                token: token.plain_token,
                org_id,
                group_id,
                controlPlaneUrl,
                agentVersion,
                orgName: org.name,
            });

            return new NextResponse(script, {
                headers: {
                    "Content-Type": "text/x-shellscript",
                    "Content-Disposition": `attachment; filename="complyze-install-${org.name.replace(/\s+/g, "-").toLowerCase()}.sh"`,
                },
            });
        } else {
            const script = generateWindowsScript({
                token: token.plain_token,
                org_id,
                group_id,
                controlPlaneUrl,
                agentVersion,
                orgName: org.name,
            });

            return new NextResponse(script, {
                headers: {
                    "Content-Type": "text/plain",
                    "Content-Disposition": `attachment; filename="complyze-install-${org.name.replace(/\s+/g, "-").toLowerCase()}.ps1"`,
                },
            });
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/* ─── Script Generators ───────────────────────────────────────────────── */

interface ScriptParams {
    token: string;
    org_id: string;
    group_id: string;
    controlPlaneUrl: string;
    agentVersion: string;
    orgName: string;
}

function generateMacScript(p: ScriptParams): string {
    return `#!/bin/bash
# ============================================================
# Complyze Endpoint Agent — macOS Installer
# Organization: ${p.orgName}
# Generated: ${new Date().toISOString()}
# ============================================================
# This script installs and enrolls the Complyze agent.
# Deploy via MDM (Jamf/Intune) or run directly as root.
# No user interaction required.
set -e

COMPLYZE_TOKEN="${p.token}"
COMPLYZE_ORG="${p.org_id}"
COMPLYZE_GROUP="${p.group_id}"
COMPLYZE_URL="${p.controlPlaneUrl}"
COMPLYZE_VERSION="${p.agentVersion}"
INSTALL_DIR="/usr/local/complyze"
PLIST_PATH="/Library/LaunchDaemons/co.complyze.agent.plist"
LOG_PATH="/var/log/complyze-agent.log"

echo "==> Complyze Enterprise Agent Installer v${p.agentVersion}"
echo "==> Organization: ${p.orgName}"
echo ""

# 1. Create install dir
mkdir -p "$INSTALL_DIR"

# 2. Download agent binary
echo "==> Downloading agent..."
curl -fsSL "$COMPLYZE_URL/api/agent/installer?version=$COMPLYZE_VERSION&platform=mac" \\
  -o "$INSTALL_DIR/complyze-agent"
chmod +x "$INSTALL_DIR/complyze-agent"

# 3. Write config
cat > "$INSTALL_DIR/config.json" <<CONFIG
{
  "control_plane_url": "$COMPLYZE_URL/api",
  "org_id": "$COMPLYZE_ORG",
  "group_id": "$COMPLYZE_GROUP",
  "enrollment_token": "$COMPLYZE_TOKEN",
  "agent_version": "$COMPLYZE_VERSION",
  "poll_interval_seconds": 60,
  "fail_closed_ttl_hours": 24
}
CONFIG
chmod 600 "$INSTALL_DIR/config.json"

# 4. Enroll device
echo "==> Enrolling device..."
"$INSTALL_DIR/complyze-agent" enroll \\
  --token "$COMPLYZE_TOKEN" \\
  --url "$COMPLYZE_URL/api" \\
  --org "$COMPLYZE_ORG" \\
  --group "$COMPLYZE_GROUP"

# 5. Install LaunchDaemon (persistent, starts on boot)
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>co.complyze.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${p.controlPlaneUrl === 'https://complyze.co' ? '/usr/local/complyze/complyze-agent' : '/usr/local/complyze/complyze-agent'}</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/complyze-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/complyze-agent.log</string>
    <key>WorkingDirectory</key>
    <string>/usr/local/complyze</string>
</dict>
</plist>
PLIST

chmod 644 "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"

# 6. Load the daemon
launchctl load -w "$PLIST_PATH" 2>/dev/null || launchctl bootstrap system "$PLIST_PATH" 2>/dev/null || true

echo ""
echo "==> ✅ Complyze Agent installed and running."
echo "==> Device will appear in admin dashboard within 60 seconds."
echo "==> Logs: $LOG_PATH"
`;
}

function generateWindowsScript(p: ScriptParams): string {
    return `# ============================================================
# Complyze Endpoint Agent — Windows Installer (PowerShell)
# Organization: ${p.orgName}
# Generated: ${new Date().toISOString()}
# ============================================================
# Run as Administrator. Deploy via Intune or GPO.
# No user interaction required.

$ErrorActionPreference = "Stop"

$COMPLYZE_TOKEN = "${p.token}"
$COMPLYZE_ORG   = "${p.org_id}"
$COMPLYZE_GROUP = "${p.group_id}"
$COMPLYZE_URL   = "${p.controlPlaneUrl}"
$COMPLYZE_VER   = "${p.agentVersion}"
$INSTALL_DIR    = "C:\\Program Files\\Complyze"
$LOG_PATH       = "C:\\ProgramData\\Complyze\\agent.log"
$SVC_NAME       = "ComplyzeAgent"

Write-Host "==> Complyze Enterprise Agent Installer v${p.agentVersion}"
Write-Host "==> Organization: ${p.orgName}"

# 1. Create install directory
New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
New-Item -ItemType Directory -Force -Path "C:\\ProgramData\\Complyze" | Out-Null

# 2. Download agent
Write-Host "==> Downloading agent..."
Invoke-WebRequest -Uri "$COMPLYZE_URL/api/agent/installer?version=$COMPLYZE_VER&platform=win" \`
  -OutFile "$INSTALL_DIR\\complyze-agent.exe"

# 3. Write config
@{
    control_plane_url    = "$COMPLYZE_URL/api"
    org_id               = $COMPLYZE_ORG
    group_id             = $COMPLYZE_GROUP
    enrollment_token     = $COMPLYZE_TOKEN
    agent_version        = $COMPLYZE_VER
    poll_interval_seconds = 60
    fail_closed_ttl_hours = 24
} | ConvertTo-Json | Set-Content -Path "$INSTALL_DIR\\config.json" -Encoding UTF8

# 4. Enroll device
Write-Host "==> Enrolling device..."
& "$INSTALL_DIR\\complyze-agent.exe" enroll \`
    --token $COMPLYZE_TOKEN \`
    --url "$COMPLYZE_URL/api" \`
    --org $COMPLYZE_ORG \`
    --group $COMPLYZE_GROUP

# 5. Install as Windows Service
Write-Host "==> Registering Windows Service..."
$existingSvc = Get-Service -Name $SVC_NAME -ErrorAction SilentlyContinue
if ($existingSvc) {
    Stop-Service -Name $SVC_NAME -Force -ErrorAction SilentlyContinue
    sc.exe delete $SVC_NAME | Out-Null
}
New-Service \`
    -Name $SVC_NAME \`
    -DisplayName "Complyze AI Governance Agent" \`
    -Description "Enforces AI governance policy across endpoints per Complyze configuration." \`
    -BinaryPathName "$INSTALL_DIR\\complyze-agent.exe start" \`
    -StartupType Automatic | Out-Null

Start-Service -Name $SVC_NAME

# 6. Block QUIC/UDP port 443 (forces TCP to go through proxy)
$ruleName = "Complyze_QUIC_Block"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule \`
        -DisplayName $ruleName \`
        -Direction Outbound \`
        -Protocol UDP \`
        -RemotePort 443 \`
        -Action Block | Out-Null
    Write-Host "==> QUIC/UDP blocking enabled."
}

Write-Host ""
Write-Host "==> Complyze Agent installed and running as Windows Service."
Write-Host "==> Device will appear in admin dashboard within 60 seconds."
Write-Host "==> Logs: $LOG_PATH"
`;
}
