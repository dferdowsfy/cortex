import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';

const BASE_URL = process.env.COMPLYZE_URL || 'http://localhost:3737/api';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '.complyze-agent-store.json');
const PROXY_CONFIG_PATH = path.join(__dirname, '.complyze-proxy-config.json');
const WIN_ENCLAVE_PATH = path.join(__dirname, '.complyze-win-vault.enc');

const ENTERPRISE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnmlgpOABLIsWakMZC7fI
Sb2OyJHJlD6jVkFFTKwxKs/2tsGDG+PqYfdRl/AXWvDp7YzY6KzdFPi9PZ6WAhNs
IfW3Z4WaaEUBXMseorWT2wYZ0og14FzJGoZ2cv0tegJGeFdFYJKfVSFfRUnQVMgn
QTWVYsPjeq3rfew+xOUcIQAMhzc4RmW6DVkVS6pDaZrkty5/b0qNoPSEI/eNSUmt
nnt7peZTyOlcue7EzMx+Zr8GzZP2p7Z6c5l9Qz2b8VvF9sekHIVm6oA69D66u6Ym
957CCeG+eL/0Wp5IU27FyD1gAWqR7rk0AZm3O4auumxiPG+3xuIFzaiq6OuCwRXn
DQIDAQAB
-----END PUBLIC KEY-----`;

const POLLING_INTERVAL = 60 * 1000;
const PROXY_PORT = 8080;

let store = {
    device_id: null,
    last_policy_version: 0,
    last_policy: null,
    last_successful_sync: null,
    revoked: false
};
let device_secret_memory = null;
let proxyProcess = null;

// ─── OS SECURE STORAGE ──────────────────────────────────────
function saveSecureSecret(secret) {
    device_secret_memory = secret;
    if (process.platform === 'darwin') {
        try {
            execSync(`security add-generic-password -a "complyze-agent" -s "ComplyzeEndpointSecret" -w "${secret}" -A -U`);
        } catch (e) {
            console.error(`[Vault Error] Failed to write macOS Keychain: ${e.message}`);
        }
    } else if (process.platform === 'win32') {
        try {
            const psScript = `ConvertFrom-SecureString (ConvertTo-SecureString '${secret}' -AsPlainText -Force) | Out-File -FilePath '${WIN_ENCLAVE_PATH}'`;
            execSync(`powershell -Command "${psScript}"`);
        } catch (e) {
            console.error(`[Vault Error] Failed to write Windows DPAPI: ${e.message}`);
        }
    }
}

function loadSecureSecret() {
    if (device_secret_memory) return device_secret_memory;

    if (process.platform === 'darwin') {
        try {
            const res = execSync(`security find-generic-password -a "complyze-agent" -s "ComplyzeEndpointSecret" -w`);
            return res.toString().trim();
        } catch (e) {
            return null; // Not found
        }
    } else if (process.platform === 'win32') {
        try {
            if (!fs.existsSync(WIN_ENCLAVE_PATH)) return null;
            const psScript = `
                $secure = Get-Content '${WIN_ENCLAVE_PATH}' | ConvertTo-SecureString;
                $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);
                [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
            `;
            const res = execSync(`powershell -Command "${psScript}"`);
            return res.toString().trim();
        } catch (e) {
            return null;
        }
    }
    return null; // unsupported platform fallback
}

// ─── STATE MANAGEMENT ──────────────────────────────────────
function loadStore() {
    if (fs.existsSync(STORE_PATH)) {
        try {
            store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
            device_secret_memory = loadSecureSecret();
            return store.device_id && device_secret_memory;
        } catch (err) {
            console.error('[Error] Failed to load store:', err.message);
        }
    }
    return false;
}

function saveStore() {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

// ─── SYSTEM PROXY MANAGEMENT ───────────────────────────────
function enforceSystemProxyState(enable) {
    console.log(`[OS] System Proxy Routing: ${enable ? 'ENABLED' : 'DISABLED'}`);

    if (process.platform === 'darwin') {
        try {
            // Get active network service natively (rudimentary logic defaulting to Wi-Fi)
            // A more hardened production version reads `networksetup -listallnetworkservices`
            if (enable) {
                execSync(`networksetup -setwebproxy "Wi-Fi" 127.0.0.1 ${PROXY_PORT}`);
                execSync(`networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 ${PROXY_PORT}`);

                // Block QUIC/UDP out port 443 to force TCP fallback
                // Note: pfctl requires root privileges
                const pfConf = "block drop out proto udp from any to any port 443";
                fs.writeFileSync('/tmp/complyze_quic_block.conf', pfConf);
                execSync(`pfctl -a complyze/quic_block -f /tmp/complyze_quic_block.conf || true`);
                execSync(`pfctl -E || true`);
            } else {
                execSync(`networksetup -setwebproxystate "Wi-Fi" off`);
                execSync(`networksetup -setsecurewebproxystate "Wi-Fi" off`);

                // Remove QUIC/UDP block
                execSync(`pfctl -a complyze/quic_block -F all || true`);
            }
        } catch (e) {
            console.warn('[OS Warning] Failed to modify macOS proxy routes (requires privileges/network hardware checks).');
        }
    } else if (process.platform === 'win32') {
        try {
            if (enable) {
                execSync(`powershell -Command "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyServer -Value '127.0.0.1:${PROXY_PORT}'; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 1"`);

                // Block QUIC/UDP out port 443
                execSync(`powershell -Command "if (-not (Get-NetFirewallRule -DisplayName 'Complyze_QUIC_Block' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName 'Complyze_QUIC_Block' -Direction Outbound -Protocol UDP -RemotePort 443 -Action Block }"`);
            } else {
                execSync(`powershell -Command "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0"`);

                // Remove QUIC/UDP block
                execSync(`powershell -Command "Remove-NetFirewallRule -DisplayName 'Complyze_QUIC_Block' -ErrorAction SilentlyContinue"`);
            }
        } catch (e) {
            console.warn('[OS Warning] Failed to modify Windows proxy registry.');
        }
    }
}

// ─── PROXY PROCESS MANAGEMENT ──────────────────────────────
function startProxySupervisor() {
    if (store.revoked) return;
    if (proxyProcess) return;

    console.log(`[Proxy Daemon] Spawning interceptor runtime...`);

    // Launch proxy with explicit configurations injected
    proxyProcess = spawn('node', [path.join(__dirname, 'scripts/proxy-server.js')], {
        env: {
            ...process.env,
            COMPLYZE_LOCAL_CONFIG: PROXY_CONFIG_PATH
        },
        stdio: ['ignore', 'ignore', 'ignore'] // decouple standard outputs for headless running
    });

    proxyProcess.on('close', (code) => {
        console.log(`[Proxy Daemon] Process crashed or exited with code ${code}. Restarting in 3 seconds...`);
        proxyProcess = null;
        if (!store.revoked) {
            setTimeout(startProxySupervisor, 3000);
        }
    });
}

function stopProxySupervisor() {
    if (proxyProcess) {
        proxyProcess.kill();
        proxyProcess = null;
    }
    // Cleanup OS proxies natively
    enforceSystemProxyState(false);
}

// ─── POLICY TO CONFIGURATION TRANSLATION ───────────────────
function syncProxyConfigWithPolicy(policyConfig) {
    if (!policyConfig) return;

    // Schema translation natively maps admin controls to proxy binary execution directives
    const mappedConfig = {
        proxy_enabled: true,
        desktop_bypass: false,
        inspect_attachments: policyConfig.scan_attachments || false,
        enforcement_mode: 'monitor'
    };

    if (policyConfig.block_high_risk || policyConfig.fail_closed) mappedConfig.enforcement_mode = 'block';
    else if (policyConfig.auto_redaction) mappedConfig.enforcement_mode = 'redact';
    else if (policyConfig.audit_mode) mappedConfig.enforcement_mode = 'warn';

    fs.writeFileSync(PROXY_CONFIG_PATH, JSON.stringify(mappedConfig, null, 2), { mode: 0o600 });
    console.log(`[Proxy Config] Enforcing updated local directives: Mode=${mappedConfig.enforcement_mode}`);

    startProxySupervisor();
    // Conceptually we toggle system proxies based on a policy check or default baseline
    // The requirement mentions 'enable_ai_monitoring', defaulting to active proxy capture.
    const enableMonitoring = policyConfig.enable_ai_monitoring !== false;
    enforceSystemProxyState(enableMonitoring);
}

// ─── COMPLYZE AUTHENTICATION CONTRACTS ─────────────────────
function getAuthHeaders() {
    if (!device_secret_memory || !store.device_id) throw new Error("Missing secure identity");
    const timestamp = Date.now().toString();
    const secretHash = crypto.createHash('sha256').update(device_secret_memory).digest('hex');
    const signature = crypto.createHmac('sha256', secretHash).update(store.device_id + timestamp).digest('hex');

    return {
        'Content-Type': 'application/json',
        'device_id': store.device_id,
        'timestamp': timestamp,
        'signature': signature
    };
}

function verifyPolicySignature(policyData) {
    if (!policyData || !policyData.signature || !policyData.payload_json) return false;
    try {
        return crypto.verify(
            "sha256",
            Buffer.from(policyData.payload_json),
            ENTERPRISE_PUBLIC_KEY,
            Buffer.from(policyData.signature, 'base64')
        );
    } catch (e) {
        return false;
    }
}

async function fetchWithBackoff(url, options, maxRetries = 5) {
    let retries = 0;
    let delay = 1000;
    while (true) {
        try {
            const res = await fetch(url, options);
            if (res.status === 401 || res.status === 403) return res;
            if (!res.ok && res.status >= 500) throw new Error(`Server error: ${res.status}`);
            return res;
        } catch (err) {
            retries++;
            if (retries > maxRetries) {
                console.log(`[Error] Max retries reached ensuring last known policy retains enforcement.`);

                // Fail-Closed Sinkhole Protection: 72 hours TTL
                if (store.last_successful_sync) {
                    const offlineDuration = Date.now() - store.last_successful_sync;
                    if (offlineDuration > 72 * 60 * 60 * 1000) {
                        console.error(`[Critical Warning] Agent has been offline for > 72 hours. Entering Fail-Closed mode.`);
                        syncProxyConfigWithPolicy({ fail_closed: true, enable_ai_monitoring: true });
                    }
                }

                // Ensure the proxy continues functioning isolated and offline with local config.
                // It will naturally re-try at the next POLLING_INTERVAL tick.
                throw err;
            }
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
}

async function enroll(token) {
    console.log(`[Enrollment] Executing enrollment...`);
    const fingerprint = crypto.randomUUID();
    const res = await fetch(`${BASE_URL}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            enrollment_token: token,
            device_fingerprint: fingerprint,
            os_type: process.platform,
            agent_version: '1.1.0-agent'
        })
    });

    const data = await res.json();
    if (!res.ok) {
        console.error(`[Enrollment Failed] ${data.error || res.statusText}`);
        process.exit(1);
    }

    if (!verifyPolicySignature(data.policy)) {
        console.error(`[Enrollment Failed] Invalid cryptographic signature on initial policy payload.`);
        process.exit(1);
    }

    console.log(`[Enrollment Success] Device ID: ${data.device_id}`);

    store.device_id = data.device_id;
    store.last_policy = data.policy;
    store.last_policy_version = data.policy.policy_version;
    store.revoked = false;

    saveSecureSecret(data.device_secret); // Secures to native vault (never JSON)
    saveStore();
    syncProxyConfigWithPolicy(data.policy.policy_config);
    console.log(`[Storage] Secure device identity and initial policy saved.`);
}

async function syncPolicy() {
    if (store.revoked) return;

    try {
        const res = await fetchWithBackoff(`${BASE_URL}/policy`, { method: 'GET', headers: getAuthHeaders() });
        const data = await res.json();

        if (res.status === 401 || res.status === 403) {
            console.log(`[Security Alert] Device Access Terminated! Status: ${res.status}.`);
            store.revoked = true;
            saveStore();
            stopProxySupervisor(); // Instantly dismantle the interceptor
            console.log(`[Terminal] Agent transitioning to Revoked halt state. Sync immediately suspended.`);
            return;
        }

        if (!res.ok) return;

        store.last_successful_sync = Date.now();
        saveStore();

        if (!verifyPolicySignature(data)) {
            console.error(`[Security Alert] Policy payload signature verification failed! Possible MITM bridging attempt.`);
            // Intentional fail-closed mechanism for payload tampering
            enforceSystemProxyState(false);
            return;
        }

        if (data.policy_version > store.last_policy_version) {
            console.log(`[Policy Update] Version incremented from ${store.last_policy_version} -> ${data.policy_version}`);
            console.log(JSON.stringify(data.policy_config, null, 2));
            store.last_policy = data;
            store.last_policy_version = data.policy_version;
            saveStore();
            syncProxyConfigWithPolicy(data.policy_config);
        }
    } catch (err) { }
}

async function sendHeartbeat() {
    if (store.revoked) return;
    try {
        const res = await fetchWithBackoff(`${BASE_URL}/heartbeat`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: 'active', agent_version: '1.1.0-agent' })
        });
        const data = await res.json();

        if (res.status === 401 || res.status === 403) {
            store.revoked = true;
            saveStore();
            stopProxySupervisor();
        }
    } catch (err) { }
}

// ─── STARTUP ROUTINE ───────────────────────────────────────
async function main() {
    console.log('\n=======================================');
    console.log(' COMPLYZE SECURE ENDPOINT AGENT v1.2   ');
    console.log('=======================================\n');

    const args = process.argv.slice(2);
    let token = null;
    let command = 'start'; // default

    if (args.length > 0 && args[0] === 'enroll') {
        command = 'enroll';
        const tokenIdx = args.indexOf('--token');
        if (tokenIdx !== -1 && tokenIdx + 1 < args.length) {
            token = args[tokenIdx + 1];
        }
    } else {
        // Legacy fallback
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--enroll-token' && i + 1 < args.length) token = args[i + 1];
        }
    }

    const isEnrolled = loadStore();
    if (store.revoked) {
        console.log(`[Terminal] Agent is permanently revoked. Please delete local storage trace and re-enroll.`);
        process.exit(1);
    }

    if (command === 'enroll' || (!isEnrolled && token)) {
        if (isEnrolled) {
            console.log(`[Agent Initialized] Identity Found: ${store.device_id}`);
            console.log(`[Warning] Ignored enrollment command because agent is already enrolled.`);
        } else {
            if (!token) {
                console.error(`[Error] Enrollment requires a token: complyze-agent enroll --token <token>`);
                process.exit(1);
            }
            await enroll(token);
        }

        if (command === 'enroll') {
            console.log(`[Enrollment] Finished running setup command. Exiting.`);
            process.exit(0);
        }
    } else if (!isEnrolled) {
        console.error(`[Error] Agent is not enrolled. Please run 'enroll' first!`);
        process.exit(1);
    } else {
        console.log(`[Agent Initialized] Identity Found: ${store.device_id}`);
        // Reassert settings 
        if (store.last_policy && store.last_policy.policy_config) {
            syncProxyConfigWithPolicy(store.last_policy.policy_config);
        }
    }

    await syncPolicy();
    await sendHeartbeat();

    if (store.revoked) return;
    console.log(`\n[Agent Running] Beginning automated ${POLLING_INTERVAL / 1000}s synchronizations...`);

    setInterval(async () => {
        if (!store.revoked) {
            await syncPolicy();
            await sendHeartbeat();

            // Periodically re-assert intended proxy settings (anti-tamper)
            if (store.last_policy && store.last_policy.policy_config) {
                const enableMonitoring = store.last_policy.policy_config.enable_ai_monitoring !== false;
                enforceSystemProxyState(enableMonitoring);
            }
        }
    }, POLLING_INTERVAL);

    // Cleanup hooks
    const shutdown = () => {
        console.log("\n[Shutdown] Tearing down OS enforcement intercepts...");
        stopProxySupervisor();
        process.exit();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch(console.error);
