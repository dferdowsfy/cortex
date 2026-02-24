# Complyze Enterprise Agent - Simulated Threat Analysis & Audit Report

**Date:** February 23, 2026
**Confidentiality:** Internal / Restricted
**Scope:** Complyze macOS & Windows Endpoint Agent (`endpoint-agent.mjs`) & Associated Next.js API Routes

## Executive Summary
This report details the findings of a simulated adversarial threat modeling exercise conducted against the Complyze Enterprise Agent architecture. The objective of this exercise was to identify potential bypasses, tampering vectors, and desynchronization risks from the perspective of a malicious insider or penetration tester.

The assessment identified **1 Critical**, **4 High**, **2 Medium**, and **1 Low** risk vulnerabilities within the current zero-trust enrollment and proxy enforcement lifecycle. 

---

## 1. Enrollment Token Security

### 1.1 Token Interception & Rogue Device Enrollment
* **Risk Level:** Medium
* **Vector:** An attacker extracts the `--token` parameter from an MDM deployment script or intercepts it during provisioning. The attacker then runs the enrollment script on a personal, unmanaged VM to provision a valid `device_id` and `device_secret`.
* **Real-world likelihood:** Medium. (Requires access to MDM profiles or deployment logs, which IT/Engineering often possess).
* **Mitigation / Remediation:** 
  1. Bind enrollment tokens to the corporate IP egress CIDR range during the `POST /api/enroll` step.
  2. Implement strict `max_uses = 1` policies for individually distributed tokens.
  3. Correlate device telemetry (MAC address, OS serial number) with the MDM asset inventory via Microsoft Graph API or Jamf Pro API before issuing the secret.

---

## 2. Device Identity & Secret Handling

### 2.1 Secret Extraction via Local Admin
* **Risk Level:** High
* **Vector:** A user with local administrator privileges uses native OS tools (e.g., `security dump-keychain` on macOS or Mimikatz/PowerShell for Windows DPAPI) to extract the `ComplyzeEndpointSecret`. Using this persistent secret, the user authors a custom script to sign fake `POST /api/heartbeat` requests, spoofing compliance while entirely disabling the local intercept proxy.
* **Real-world likelihood:** High (Prevalent among engineering and technical teams with local admin rights).
* **Mitigation / Remediation:** 
  1. Migrate from symmetric HMAC device secrets to asymmetric device certificates stored in hardware-backed secure enclaves (macOS Secure Enclave / Windows TPM 2.0) where private keys are physically non-exportable.
  2. Transition to mTLS (Mutual TLS) for API authentication.

### 2.2 API Call Replay Attacks
* **Risk Level:** Low
* **Vector:** The agent generates signatures using `device_id + timestamp`. If the backend does not strictly validate the `timestamp` threshold, an attacker can capture a valid heartbeat request and replay it indefinitely to spoof compliance. 
* **Real-world likelihood:** Low (Requires network inspection and lack of backend timestamp enforcement).
* **Mitigation / Remediation:** 
  1. Backend must reject timestamps older than +/- 5 minutes.
  2. Include a cryptographic nonce in each request, tracking used nonces on the server (or leverage JWTs with JTI claims).

---

## 3. Policy Sync & Integrity

### 3.1 Malicious Server Sinkholing (API Disconnection)
* **Risk Level:** High
* **Vector:** A user modifies their `/etc/hosts` file or local egress firewall to route `complyze-api-domain.com` to `127.0.0.1`. The agent consistently catches exceptions in `fetchWithBackoff()` and fails-open, continuing to use the `last_policy` indefinitely. System administrators can never revoke the tool or push new critical block rules.
* **Real-world likelihood:** High (Standard evasion tactic to bypass corporate monitoring).
* **Mitigation / Remediation:** 
  1. Implement a "maximum offline duration" (e.g., 72 hours) in the local daemon. If `api/policy` fails consecutively beyond this threshold, the proxy enters a fail-closed state, aggressively blocking all web traffic until backend connectivity is restored.

### 3.2 Missing Local Payload Signature Verification
* **Risk Level:** High
* **Vector:** While the backend returns a `signedPolicy`, the endpoint agent does not currently appear to cryptographically verify the signature of `data.policy_config` against a known public key before writing it to `.complyze-proxy-config.json`. A local attacker could deploy a MITM (Man-in-the-Middle) script that intercepts the local API call and returns a modified JSON payload (`block_high_risk: false`).
* **Real-world likelihood:** Medium
* **Mitigation / Remediation:** 
  1. Hardcode a Complyze ECDSA/RSA public key inside `endpoint-agent.mjs`. 
  2. Use `crypto.verify` to validate the JWT/Signature of the policy payload upon every sync *before* applying the configuration to disk.

---

## 4. Proxy Enforcement Bypass

### 4.1 QUIC & UDP HTTP/3 Evasion
* **Risk Level:** Critical
* **Vector:** OS-level proxy settings (`networksetup`, Windows Registry) typically only bind TCP traffic (Ports 80/443). Modern browsers (Chrome, Edge) heavily utilize QUIC (UDP 443) for AI services such as Google Gemini. UDP traffic ignores the system HTTP proxy and routes directly to the AI vendor, completely bypassing Complyze inspection.
* **Real-world likelihood:** Critical (Happens silently by default in modern browsers).
* **Mitigation / Remediation:** 
  1. The agent must inject OS firewall rules (e.g., `pf` on macOS, Windows Defender Firewall rules) to aggressively DROP outbound UDP Port 443 traffic. This forces modern browsers to gracefully fallback to TCP, thereby routing traffic through the Complyze proxy.

### 4.2 Application-Layer Proxy Defiance
* **Risk Level:** High
* **Vector:** System proxies are fundamentally "polite" requests to applications. A malicious user can launch Chrome via Terminal with `Google Chrome --no-proxy-server="*"` or execute a VPN client (e.g., Tailscale, NordVPN) which creates a virtual network interface (TUN/TAP) that routes traffic beneath the OS HTTP Proxy layer.
* **Real-world likelihood:** High
* **Mitigation / Remediation:** 
  1. For Enterprise deployments, migrate from HTTP Proxies to Network Extensions. Implement a macOS **Network Extension (NEFilterDataProvider)** and a Windows **Windows Filtering Platform (WFP)** driver. This intercepts packets at the socket level kernel space, rendering VPNs and browser flags irrelevant.

---

## 5. Process Tampering

### 5.1 Unloading the Supervisor Daemon
* **Risk Level:** High
* **Vector:** A user runs `kill -9 <agent_pid>` or executes `launchctl unload com.complyze.agent.plist`. Because the proxy enforcer daemon is deceased, the OS disables the proxy, or the user manually turns it off immediately afterward without the agent reverting it.
* **Real-world likelihood:** High (if local admin).
* **Mitigation / Remediation:** 
  1. On macOS, utilize the **Endpoint Security Framework (ESF)** to prevent the Complyze process from being terminated by anyone other than `root` via an authorized, signed uninstaller.
  2. Implement an MDM Self-Healing profile that restarts the `launch-daemon` continuously if killed.
  3. Adopt a multi-process watchdog architecture (Process A monitors Process B, and vice-versa).

---

## 6. Backend Scalability & Failure Mode

### 6.1 Polling Storms & Serverless Throttling
* **Risk Level:** Medium
* **Vector:** At 10,000 devices polling every 60 seconds, the frontend generates approximately 166 API requests per second (RPS) sustained. Because the Next.js API routes are serverless, this naturally triggers massive concurrent cold starts, database connection exhaustion, and significant billing anomalies. 
* **Real-world likelihood:** Definite (Impacting system availability as the customer base scales).
* **Mitigation / Remediation:** 
  1. Add **Jitter** to the `POLLING_INTERVAL` (e.g., `60000 + Math.random() * 15000`) so thousands of devices do not wake up on the exact same millisecond.
  2. Transition policy synchronization from "aggressive polling" to **Firebase Cloud Messaging (FCM)** or **Server-Sent Events (SSE)**. This allows devices to maintain an idle socket and forces the server to "Push" the config only when an Administrator triggers a change in the UI. Polling can be reduced to a fail-safe execution every 4-8 hours instead.

---
**Audit Concluded.** 
*Document generated by Complyze Secure Agent Architecture analysis.*
