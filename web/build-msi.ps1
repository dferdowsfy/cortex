$ErrorActionPreference = "Stop"
Write-Host "========================================="
Write-Host " Building Windows MSI for Complyze Agent"
Write-Host "========================================="

$OutputDir = "dist"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path "$OutputDir\payload" | Out-Null
New-Item -ItemType Directory -Force -Path "$OutputDir\payload\scripts" | Out-Null

Copy-Item "endpoint-agent.mjs" -Destination "$OutputDir\payload\"
Copy-Item "scripts" -Destination "$OutputDir\payload\scripts" -Recurse
Copy-Item "Install-ComplyzeService.ps1" -Destination "$OutputDir\payload\"

Write-Host "In a full production environment, this step executes WiX Toolset to package Native MSI."
Write-Host "Simulating WiX compilation for testing..."

# Write a dummy MSI representation for smoke testing simulation
Set-Content -Path "$OutputDir\ComplyzeAgent.msi" -Value "MOCK_MSI_BINARY"

Write-Host "✅ SUCCESS: MSI generated at $OutputDir\ComplyzeAgent.msi"
