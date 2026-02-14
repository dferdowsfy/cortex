/**
 * /api/agent/download — GET
 * Redirects to the appropriate installer based on platform.
 * For macOS: serves the install script (.command file)
 * For Windows: serves a PowerShell installer script (.ps1)
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const platform = req.nextUrl.searchParams.get("platform") || "macOS";
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    if (platform === "windows") {
        // Serve a Windows PowerShell installer
        const script = `# Complyze Agent — Windows Installer
# https://complyze.ai
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Complyze Agent Installer" -ForegroundColor Cyan
Write-Host "  ─────────────────────────" -ForegroundColor DarkGray
Write-Host ""

$InstallDir = "$env:LOCALAPPDATA\\Complyze"
$DashboardUrl = "${baseUrl}"

# Check dependencies
function Check-Dep($name, $url) {
    if (!(Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "  $name is required but not installed." -ForegroundColor Red
        Write-Host "  Install from: $url" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  $name found" -ForegroundColor Green
}

Check-Dep "git" "https://git-scm.com"
Check-Dep "node" "https://nodejs.org"
Check-Dep "npm" "https://nodejs.org"
Write-Host ""

# Clone or update
if (Test-Path $InstallDir) {
    Write-Host "  Updating existing installation..." -ForegroundColor Yellow
    Set-Location $InstallDir
    git fetch --all --quiet
    git reset --hard origin/main --quiet
} else {
    Write-Host "  Downloading Complyze Agent..." -ForegroundColor Yellow
    git clone --quiet https://github.com/dferdowsfy/cortex.git $InstallDir
}
Write-Host ""

# Install dependencies
Write-Host "  Installing dependencies..." -ForegroundColor Yellow
Set-Location "$InstallDir\\desktop"
npm install --silent
Write-Host ""

Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  Launching Complyze Agent..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dashboard: $DashboardUrl/monitoring" -ForegroundColor DarkGray
Write-Host ""

$env:COMPLYZE_DASHBOARD = $DashboardUrl
Start-Process -FilePath "$InstallDir\\desktop\\node_modules\\.bin\\electron.cmd" -ArgumentList "$InstallDir\\desktop" -WindowStyle Hidden

Write-Host "  Agent is running in the background." -ForegroundColor Green
`;

        return new NextResponse(script, {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": 'attachment; filename="install-complyze.ps1"',
                "Cache-Control": "no-cache",
            },
        });
    }

    // macOS — redirect to the existing installer endpoint
    return NextResponse.redirect(new URL("/api/agent/installer", baseUrl));
}
