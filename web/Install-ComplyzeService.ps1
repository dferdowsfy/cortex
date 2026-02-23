# Install-ComplyzeService.ps1
# Requires NSSM or similar node-windows wrapper

$ErrorActionPreference = "Stop"
$ServiceName = "ComplyzeEndpointAgent"

# Ensure Node is globally available
$NodeExe = (Get-Command node).Source
if (-not $NodeExe) {
    Write-Error "Node.js not found in system path. Please install."
    exit 1
}

$AgentScript = "$env:ProgramFiles\Complyze\endpoint-agent.mjs"

# Verify NSSM exists
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Host "NSSM is required to daemonize the node process. Installing via chocolatey or equivalent required."
    exit 1
}

nssm install $ServiceName $NodeExe $AgentScript
nssm set $ServiceName AppDirectory "$env:ProgramFiles\Complyze"
nssm set $ServiceName AppStdout "C:\ProgramData\Complyze\agent.log"
nssm set $ServiceName AppStderr "C:\ProgramData\Complyze\agent.err"
nssm set $ServiceName Start SERVICE_AUTO_START

Start-Service $ServiceName
Write-Host "Complyze Zero-Trust Service Installed & Running!"
