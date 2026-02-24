# Post-Remediation Validation Report

## A) UDP/QUIC Blocking

**Scenario:** Local Admin attempts to remove OS firewall rules.
**Result:** By executing `pfctl -F all` (macOS) or `Remove-NetFirewallRule` (Windows), an admin can flush the injected rules. The daemon does not currently monitor firewall state on a tight loop; it only injects them during `enforceSystemProxyState(true)`.
**Risk Level:** High
**Operational Impact:** Allows an administrative user to silently bypass the proxy by deliberately re-opening UDP 443. 
**Required Adjustment:** Shift firewall rule enforcement from a one-time toggle to the 60-second `setInterval` loop, ensuring rules are constantly re-asserted if dropped.

**Scenario:** User connects to a VPN client (e.g., Tailscale, GlobalProtect).
**Result:** VPN clients create virtual TUN/TAP adapters with their own routing tables. The macOS `networksetup` proxy is Wi-Fi/Ethernet specific, meaning virtual adapter traffic completely evades the proxy while tunneling all outbound port 443 traffic (TCP and UDP) directly to the VPN gateway.
**Risk Level:** Critical
**Operational Impact:** Full enforcement bypass for all network traffic.
**Required Adjustment:** P0 remediation only patched browser QUIC over standard Wi-Fi. P2 remediation (Network Extensions / WFP) is strictly required to intercept all virtual adapters and kernel-level socket traffic.

**Scenario:** IPv6 UDP 443 Evasion.
**Result:** The current `pf` rule (`block drop out proto udp from any to any port 443`) and PowerShell rule only explicitly apply to IPv4 depending on the OS's default protocol binding syntax (e.g., Mac `pf` may default to inet only).
**Risk Level:** Medium
**Operational Impact:** IPv6-enabled networks to AI vendors supporting IPv6 (like Google) could successfully negotiate HTTP/3. 
**Required Adjustment:** Explicitly define `inet6` block rules alongside `inet` in both `pf` and Windows Defender Firewall.

**Scenario:** Legitimate apps rely on UDP 443.
**Result:** Browsers gracefully fall back to TCP. However, specific non-browser applications (e.g., proprietary VoIP software or games) utilizing custom UDP 443 protocols will experience hard failures.
**Risk Level:** Low
**Operational Impact:** Very minimal for standard corporate web traffic, but can cause localized breakage for highly specific UDP applications.
**Required Adjustment:** Document this limitation for IT. Ensure firewall rules strictly target the browser process (if possible) or accept the global UDP 443 drop as an acceptable enterprise trade-off.

---

## B) RSA Policy Signature Verification

**Scenario:** Local attacker tampers with `data.policy_config` payload in-transit.
**Result:** The `verifyPolicySignature` function mathematically hashes the tampered payload against the RSA Public Key. The signature match fails, triggering `!verifyPolicySignature(data)`.
**Risk Level:** Low
**Operational Impact:** The agent refuses to apply the new policy and safely logs an error. 
**Required Adjustment:** None. The core functionality works as designed.

**Scenario:** Attacker triggers forced Fail-Closed state via payload tampering.
**Result:** When signature verification fails, the agent explicitly calls `enforceSystemProxyState(false)`. Wait, the remediation code sets it to `false` (disabling the proxy) instead of failing closed! This actually opens the network up instead of blocking it. 
**Risk Level:** Critical
**Operational Impact:** An attacker can intentionally MITM their own API traffic and mangle the signature. The agent detects the bad signature and responds by *turning the proxy off*, granting the attacker unmonitored internet access.
**Required Adjustment:** Change `enforceSystemProxyState(false)` to `syncProxyConfigWithPolicy({ fail_closed: true, enable_ai_monitoring: true })` inside the signature verification failure block.

**Scenario:** Local Admin replaces the hardcoded `ENTERPRISE_PUBLIC_KEY`.
**Result:** Because the public key is a string inside the mutable `endpoint-agent.mjs` script, a local admin can replace it with their own public key, and then sign arbitrary malicious payloads with their own matching private key.
**Risk Level:** High
**Operational Impact:** Complete takeover of the policy engine by local administrators. 
**Required Adjustment:** Bundle `endpoint-agent.mjs` into a compiled binary (e.g., via `pkg` or `nexe`) instead of distributing readable source code, or shift to OS-level code signing mechanisms to verify the agent binary hasn't been modified.

**Scenario:** RSA Key Compromise / Key Rotation Support.
**Result:** The private key is hardcoded into `enrollment-store.ts`. If the server is breached and the private key is dumped, there is currently no mechanism to rotate the public key embedded inside 1,000 deployed agents without pushing a new application update via MDM.
**Risk Level:** High
**Operational Impact:** A compromised key demands a complete redeployment of the agent infrastructure.
**Required Adjustment:** Implement a Key Management Service (KMS). Use intermediate certificates or JWKS (JSON Web Key Sets) to allow the agent to fetch and verify new public keys anchored by a master root CA.

---

## C) Fail-Closed Mode

**Scenario:** Device travels to a hotel with a Captive Portal Wi-Fi.
**Result:** The Captive Portal requires the user to click "Accept" on a web page before internet access is granted. If the agent's 72-hour TTL has expired, the proxy goes into `block` mode. The user cannot access the Captive Portal page because all web traffic is blocked by the proxy, preventing them from ever getting internet access to restore the API heartbeat.
**Risk Level:** High
**Operational Impact:** The laptop is permanently locked out of the internet (brick status) until it connects to an open network. 
**Required Adjustment:** Implement a "Captive Portal Detection" bypass (e.g., allowing traffic to local subnets or known portal domains like `captive.apple.com`), or provide an offline "Break Glass" override sequence.

**Scenario:** Attacker intentional offline DoS.
**Result:** An attacker intentionally modifies `/etc/hosts` to block `complyze-api-domain.com`. After 72 hours, the machine drops into fail-closed mode. 
**Risk Level:** Low
**Operational Impact:** The attacker successfully created a Denial of Service against themselves. Since they can't access the internet, their threat to corporate data via AI tools is neutralized, which is the exact intended outcome.
**Required Adjustment:** None. 

**Scenario:** Fail-closed blocks critical OS background services (Updates, DNS).
**Result:** DNS (UDP 53) natively ignores HTTP proxies, so DNS continues to function. However, macOS/Windows software updates running via HTTP/HTTPS may be routed through the Complyze proxy. If the proxy is in `block` mode, OS security patches will fail to download.
**Risk Level:** Medium
**Operational Impact:** Corporate laptops may fall behind on critical Zero-Day patches if stuck in fail-closed for an extended period. 
**Required Adjustment:** Within the proxy's strict blocking logic, explicitly whitelist Apple and Microsoft update domains (e.g., `*.apple.com`, `*.windowsupdate.com`) so that security patches bypass the `fail_closed` network block.
