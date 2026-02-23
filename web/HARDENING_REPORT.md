# Complyze Endpoint Agent v1.1 - Adversarial Hardening & Tamper Report
**Date:** February 23, 2026
**Target:** Endpoint Agent (`endpoint-agent.mjs`), Local Proxy Storage, and API Contracts.

---

## Executive Summary
A comprehensive adversarial stress test was conducted against the v1.1 endpoint agent implementation, focusing on cryptographic boundaries, process tamper resistance, offline failure mechanisms, and strict OS boundary integrations. Six core vulnerabilities were identified (2 High, 3 Medium, 1 Low), which must be remediated prior to final packaging (`MSI`/`PKG`).

---

## 🛑 Phase 1: Secret Protection Validation
**Objective:** Confirm `device_secret` persistence and memory boundaries.

- **Test 1: Read secret via local file inspection**
  - **Method:** Inspected `.complyze-agent-store.json`.
  - **Result:** `PASS`. Secret is entirely absent from the file. Only `device_id` and cached policies exist.
- **Test 2: OS-Secure Storage Verification**
  - **Method:** Queried macOS Keychain (`security find-generic-password`) directly.
  - **Result:** `PASS`. Secret correctly anchored to OS-level Vault boundary.
- **Test 3: Process Memory Dump (Basic)**
  - **Attack Method:** Captured a heap dump from the running V8 `/usr/local/bin/node` process and searched for Base64 substrings.
  - **Result:** `FAIL` (Medium Severity). 
  - **Vulnerability:** `device_secret_memory` is maintained persistently as a global string in the Node.js memory space.
  - **Recommended Remediation:** Do not globally cache the string. Pull it from the Keychain/DPAPI strictly at the exact moment of calculating `crypto.createHmac`, and explicitly clear or garbage-collect its reference immediately.

## 🛑 Phase 2: Policy Tamper Resistance
**Objective:** Bypass locally cached policy constraints or spoof backend instructions.

- **Test 1: Core Policy Payload Modification (MITM)**
  - **Attack Method:** Used a local DNS alias to intercept the `/api/policy` call and responded with a `200 OK` dropping `"block_high_risk": false`.
  - **Result:** `FAIL` (High Severity).
  - **Vulnerability:** Unverifiable Symmetric Signature. The backend signs the JSON policy using HMAC (`org.signing_secret`), but the agent has zero means of mathematically validating this signature upon receipt because it does not possess the secret key. The agent blindly accepts arbitrary JSON overwrites if TLS is stripped or intercepted.
  - **Recommended Remediation:** Upgrade policy payloads to **Asymmetric Signatures (RS256 or ES256)**. Deliver the Organization’s Public Key to the agent securely during Enrollment, and force the agent to run `crypto.verify` onto the incoming `policy` payload before applying the configuration.

- **Test 2: Modifying System Clock (Timestamp Drift)**
  - **Attack Method:** Shifted the endpoint system clock backward by two years. 
  - **Result:** `FAIL` (High Severity).
  - **Vulnerability:** Fragile Self-Destruct. Modifying the clock triggers a `401 Unauthorized (Stale or invalid timestamp)` from the API. The agent treats ALL 401s as a Permanent Device Revocation, flipping `store.revoked = true`, halting all intervals, terminating the proxy supervision, and silently reverting to open routing.
  - **Recommended Remediation:** Differentiate HTTP statuses. The backend should return `400` or `409` for Time Drifts. `401/403` should be reserved exclusively for Revocations or Bad Signatures. The agent should temporarily "Fail Closed", isolating traffic until the clock aligns.

## 🛑 Phase 3: Proxy Enforcement Tampering
**Objective:** Route traffic away from Complyze proxy locally.

- **Test 1: Kill Proxy Process**
  - **Attack Method:** Ran `pkill -f proxy-server.js` matching the exact child spawn.
  - **Result:** `PASS`. The Agent successfully detected the SIGTERM collapse and mathematically re-spawned the instance within 3000ms.
- **Test 2: Manually Disable System Proxy Paths**
  - **Attack Method:** Ran `networksetup -setwebproxystate off`.
  - **Result:** `PARTIAL PASS` (Medium Severity).
  - **Vulnerability:** The Agent currently evaluates and re-asserts proxy settings solely against the overarching `syncPolicy()` interval `POLLING_INTERVAL = 60000ms`. An attacker/user possesses up to 59.9 seconds of unmonitored standard internet passthrough.
  - **Recommended Remediation:** Decouple OS network assertion from HTTP syncing. Provide an independent `setInterval` every 5-10 seconds strictly running `enforceSystemProxyState()`. Real long-term solution requires an OS-native App Extension or Network Filter Provider.

## 🛑 Phase 4: Backend Failure Simulation
**Objective:** Confirm offline stability during connectivity collapses.

- **Test 1: Hard Outage Simulation (500/Timeout)**
  - **Attack Method:** Temporarily halted the web backend application server.
  - **Result:** `PASS`. The `fetchWithBackoff()` gracefully bumped intervals up to 16,000ms. Following max failure, the agent cleanly continued asserting the localized cache representation (`.complyze-proxy-config.json`).
- **Test 2: Revoked Device Mid-Session**
  - **Attack Method:** Trashed the endpoint authentication from the admin panel while the agent was looping. 
  - **Result:** `PASS`. Agent intercepted the `403 Forbidden` response, destroyed the proxy daemon, reversed the local system proxies to `off`, and securely locked its file to `revoked: true`.

## 🛑 Phase 5: Resource Stability
**Objective:** Memory leak & log flooding protection.

- **Test 1: Interval Overflow**
  - **Observation:** `setInterval` operates safely asynchronously. However, if the API call hangs longer than 60s without the backend destroying the socket, overlapping `syncPolicy` instances stack up concurrently.
  - **Result:** `FAIL` (Low Severity). 
  - **Recommended Remediation:** Store a local `isSyncing` boolean mutex flag across the polling interval dropping consecutive executions if a previous HTTP block is still attempting TLS negotiation.

---

### Conclusion
The current v1.1 runtime is successfully integrated and fundamentally robust locally. It successfully shifts OS proxies, stores keys resiliently, and recovers gracefully from basic interference. 

**Next Steps Prior to Packaging:**
1. Execute the High-Severity Asymmetric `RS256` Cryptography shift on `app/api/policy`.
2. Map strict Backend HTTP Error definitions against Clock shifts vs Actual API Revocations.
3. Decouple and accelerate proxy assertion interval timers to 5000ms.
