# Chief Security Architect Decision: Enterprise Pilot Go/No-Go

## Decision: PROCEED TO CONTROLLED PILOT

**Rationale:** 
Despite the remaining architectural limitations of User-Space + OS Proxy enforcement (Tier A), Complyze is sufficiently hardened to validate its core value proposition (AI tool visibility, risk classification, and baseline data-loss prevention) against an acceptable threat model for a controlled, finite pilot. 

The primary pilot blockers (silent UDP/HTTP3 evasion, arbitrary payload spoofing, and API sinkholing) have been effectively neutralized by the 30-Day sprint remediations. Rewriting the core engine to leverage Kernel-Level/Network Extensions (Tier B) before a pilot would induce massive engineering delay (90+ days) and eliminate the opportunity for critical UX, admin, and early-adopter feedback.

However, this "Proceed" decision is strictly conditional based on the environment and contractual transparency outlined below.

---

## 1) Strict Pilot Constraints

To mitigate the remaining High/Critical evasion risks (VPN bypass, key mutability, protocol bridging), the pilot must operate within these exact parameters:

*   **Target Organization:** Information Worker / Non-Technical organization (e.g., Legal, HR, Sales, standard corporate environment). The pilot must **not** be deployed to Engineering, DevOps, or IT Security teams.
*   **Privilege Level:** Target endpoints must be strictly managed devices where the end-user does **not** possess Local Administrator rights. 
*   **Network Environment:** The organization must not require "Always-On" full-tunnel client-side VPNs (e.g., GlobalProtect, Zscaler Client Connector) that universally override OS proxy settings via virtual adapters, as this will entirely blind the Complyze agent. Split-tunnel VPNs are acceptable only if port 80/443 traffic to the internet relies on the physical adapter.
*   **Scale:** Maximum 500 endpoints for the duration of the pilot to monitor false-positive rates of the fail-closed mechanism.

## 2) Contractual Enforcement Limitations

The following limitations must be transparently communicated to the buyer (CISO / IT Director) as known architectural bounds for the initial version:

1.  **VPN & Virtual Adapter Blind Spot:** Complyze does not inspect traffic routed through third-party encrypted tunnels (VPNs) or virtual network adapters that operate below the OS system proxy layer.
2.  **Captive Portal Isolation:** The fail-closed mechanism (triggered after 72 hours of offline/sinkhole status) blocks all HTTP/HTTPS traffic. This will prevent users from authenticating to hotel or airplane Captive Portals. IT Helpdesk intervention or a secure local override token may be required to un-brick the network connection.
3.  **Local Admin Evasion:** If a user possesses or escalates to Local Administrator privileges, they possess the technical capability to manually flush firewall drop-rules or modify the agent binary to bypass enforcement. 

## 3) Risk Acceptance Statement

By executing this controlled pilot, we accept the residual risk that a determined, technically sophisticated user—specifically one employing zero-trust VPN clients or possessing administrative execution contexts—can bypass the Complyze enforcement perimeter. We accept that Complyze v1.x acts as a **friction-based preventative control** alongside deep visibility, rather than an omnipresent, mathematically un-bypassable cryptographic barrier. 

## 4) Mandatory Architectural Future State

To progress from a "Controlled Pilot" to a "General Availability Enterprise Platform" capable of securing engineering teams and high-compliance (SOC2/HIPAA) infrastructure:

**macOS Network Extensions (NEFilterDataProvider) and Windows Filtering Platform (WFP) drivers are absolutely mandatory.** 

We cannot sell a Tier A user-space proxy as a hardened DLP tool to enterprise security teams. The 90-day engineering sprint to transition away from `networksetup`/Registry keys into kernel-space socket interception must begin immediately upon pilot commencement.
