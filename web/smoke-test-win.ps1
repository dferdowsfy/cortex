Write-Host "Starting Smoke Test Matrix (Windows)..."

Write-Host "[1] Verify MSI Exists"
if (-not (Test-Path "dist\ComplyzeAgent.msi")) {
    Write-Error "Fail: MSI not found."
    exit 1
}
Write-Host " [OK]"

Write-Host "[2] Simulate Enrollment"
$Token = $(node generate-token.mjs | Select-Object -Last 1)
node endpoint-agent.mjs enroll --token $Token
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fail: Enrollment returned bad exit code."
    exit 1
}
Write-Host " [OK]"

Write-Host "[3] Smoke Test Complete: ALL CLEAR."
