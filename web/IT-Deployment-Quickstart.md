# Complyze Agent IT Deployment Quickstart

## Overview
This guide covers mass deployment of the Complyze Endpoint Agent v1.2, which runs strictly as a background daemon capturing AI traffic against administrative corporate policy requirements. 

## Silent Installation Targets

### macOS (Jamf, Kandji, Addigy)
1. **Via Configuration Profile (Recommended):**
   Create a Custom Settings payload for the domain `com.complyze.agent`. Push a dictionary key `EnrollmentToken` mapped to your specific string. The `.pkg` Installer automatically resolves this natively via `defaults read` during `postinstall`.
2. **Via Staged File (Fallback):**
   Alternatively, drop a token file restricted exclusively to `.pkg` access.

```bash
# Push this script natively alongside the PKG via MDM explicitly setting root permissions
mkdir -p "/Library/Application Support/Complyze"
echo "your_enrollment_token" > "/Library/Application Support/Complyze/enrollment_token"
chmod 600 "/Library/Application Support/Complyze/enrollment_token"

sudo installer -pkg /tmp/ComplyzeAgent.pkg -target /
```

### Windows (Intune, SCCM)
To deploy safely without interrupting standard users over domain enrollment flags:
```powershell
msiexec.exe /i ComplyzeAgent.msi /quiet ORG_TOKEN="your_enrollment_token"
```

## Secondary Local Enrollment Sequence
If silently mapping the `ORG_TOKEN` parameter structurally fails within strict locked environments, you may manually pipe the post-install setup commands to the binary location:
```bash
# macOS Manual
sudo /usr/local/bin/node "/Library/Application Support/Complyze/endpoint-agent.mjs" enroll --token <token>

# Windows PowerShell Manual
node "$env:ProgramFiles\Complyze\endpoint-agent.mjs" enroll --token <token>
```

## End-User Verification & Monitoring 

IT can seamlessly observe exact success deployments mapping native OS systems to check that the daemon correctly supervises the interceptor routing:

1. **Verify Services Running:**
   - **macOS:** `sudo launchctl list | grep com.complyze.agent`
   - **Windows:** `Get-Service | Where-Object Name -eq 'ComplyzeEndpointAgent'`
2. **Reviewing Core Execution Logs:**
   - **macOS:** Check the output explicitly to `tail -f /var/log/complyze-agent.log`
   - **Windows:** The default `NSSM` route dumps securely to `C:\ProgramData\Complyze\agent.log`
3. **Admin UI Check:**
   - Log into the Complyze Web Dashboard.
   - Proceed to **Devices**.
   - Review incoming heartbeat data — deployed end-nodes reliably appear with shifting active states.
