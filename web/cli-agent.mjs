import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

let BASE_URL = 'https://complyze.co/api'; // Dynamic override runtime

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '.complyze-agent-store.json');
const POLLING_INTERVAL = 60 * 1000; // 60 seconds

let store = {
    api_base: 'https://complyze.co/api',
    device_id: null,
    device_secret: null,
    last_policy_version: 0,
    last_policy: null,
    revoked: false
};

function loadStore() {
    if (fs.existsSync(STORE_PATH)) {
        try {
            const data = fs.readFileSync(STORE_PATH, 'utf8');
            store = { ...store, ...JSON.parse(data) };
            BASE_URL = store.api_base; // ensure initialized session preserves designated API runtime environment
            return true;
        } catch (err) {
            console.error('[Error] Failed to load store:', err.message);
        }
    }
    return false;
}

function saveStore() {
    // Restrict permissions to owner read/write (0o600)
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function getAuthHeaders() {
    const timestamp = Date.now().toString();
    const secretHash = crypto.createHash('sha256').update(store.device_secret).digest('hex');
    const signature = crypto.createHmac('sha256', secretHash)
        .update(store.device_id + timestamp)
        .digest('hex');

    return {
        'Content-Type': 'application/json',
        'device_id': store.device_id,
        'timestamp': timestamp,
        'signature': signature
    };
}

async function fetchWithBackoff(url, options, maxRetries = 5) {
    let retries = 0;
    let delay = 1000;
    while (true) {
        try {
            const res = await fetch(url, options);
            if (res.status === 401 || res.status === 403) {
                return res; // Let caller handle revocation or auth failure
            }
            if (!res.ok && res.status >= 500) {
                throw new Error(`Server error: ${res.status}`);
            }
            return res;
        } catch (err) {
            retries++;
            if (retries > maxRetries) {
                console.log(`[Error] Max retries reached enforcing last known policy v${store.last_policy_version || 'None'}`);
                throw err;
            }
            console.log(`[Network Error] ${err.message}. Retrying in ${delay / 1000}s...`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
}

async function enroll(token) {
    console.log(`[Enrollment] Executing enrollment with token: ${token}`);

    // We optionally provide a fingerprint or let server generate
    const fingerprint = crypto.randomUUID();

    const res = await fetch(`${BASE_URL}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            enrollment_token: token,
            device_fingerprint: fingerprint,
            os_type: process.platform,
            agent_version: '1.0.0-cli'
        })
    });

    const data = await res.json();

    if (!res.ok) {
        console.error(`[Enrollment Failed] ${data.error || res.statusText}`);
        process.exit(1);
    }

    console.log(`[Enrollment Success] Device ID: ${data.device_id}`);

    // Store credentials securely
    store.device_id = data.device_id;
    store.device_secret = data.device_secret;
    store.last_policy = data.policy;
    store.last_policy_version = data.policy.policy_version;
    store.revoked = false;

    saveStore();
    console.log(`[Storage] Secure device identity and initial policy saved.`);
}

async function syncPolicy() {
    if (store.revoked) return;

    try {
        console.log(`[Policy Sync] Checking for updates... (Current Version: ${store.last_policy_version || 0})`);

        const res = await fetchWithBackoff(`${BASE_URL}/policy`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const data = await res.json();

        if (res.status === 401 || res.status === 403) {
            console.log(`[Security Alert] Device Access Terminated! Status: ${res.status}. Reason: ${data.error}`);
            store.revoked = true;
            saveStore();
            console.log(`[Terminal] Agent transitioning to Revoked halt state. Sync immediately suspended.`);
            return;
        }

        if (!res.ok) {
            console.log(`[Policy Error] ${data.error}`);
            return;
        }

        // Check for version bump
        if (data.policy_version > store.last_policy_version) {
            console.log(`[Policy Update] Version incremented from ${store.last_policy_version} -> ${data.policy_version}`);
            console.log(`[Policy Configuration] Applied strict enforcement:\n`, JSON.stringify(data.policy_config, null, 2));
            store.last_policy = data;
            store.last_policy_version = data.policy_version;
            saveStore();
        } else {
            console.log(`[Policy Sync] No changes. Version ${data.policy_version} is current.`);
        }

    } catch (err) {
        console.log(`[Network Alert] Applying local fallback resilience protocols. Policy Version ${store.last_policy_version || 'None'} retained.`);
    }
}

async function sendHeartbeat() {
    if (store.revoked) return;

    try {
        const res = await fetchWithBackoff(`${BASE_URL}/heartbeat`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                status: 'active',
                agent_version: '1.0.0-cli'
            })
        });

        const data = await res.json();

        if (res.status === 401 || res.status === 403) {
            console.log(`[Security Alert] Heartbeat Rejected. Status: ${res.status}. Reason: ${data.error}`);
            store.revoked = true;
            saveStore();
            return;
        }

        if (res.ok) {
            store.last_heartbeat = data.timestamp || new Date().toISOString();
            saveStore();
            console.log(`[Heartbeat] Transmitted successfully at ${store.last_heartbeat}`);
        } else {
            console.log(`[Heartbeat Error] ${data.error}`);
        }
    } catch (err) {
        console.log(`[Heartbeat Failed] Unable to confirm presence with backend server.`);
    }
}

async function main() {
    console.log('\n=======================================');
    console.log('   COMPLYZE HEADLESS CLI AGENT v1.0    ');
    console.log('=======================================\n');

    // Parse arguments
    const args = process.argv.slice(2);
    let token = null;
    let envOpt = null;
    let statusOpt = false;
    let resetOpt = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--enroll-token' && i + 1 < args.length) {
            token = args[i + 1];
        } else if (args[i] === '--env' && i + 1 < args.length) {
            envOpt = args[i + 1].toLowerCase();
        } else if (args[i] === '--status') {
            statusOpt = true;
        } else if (args[i] === '--reset') {
            resetOpt = true;
        }
    }

    if (resetOpt) {
        if (fs.existsSync(STORE_PATH)) {
            fs.unlinkSync(STORE_PATH);
            console.log(`[Reset] Wiped old local identity.`);
        }
    }

    loadStore();

    if (statusOpt) {
        console.log(`[Status Report]`);
        console.log(`  API Base:           ${BASE_URL}`);
        console.log(`  Device ID:          ${store.device_id || 'Not Enrolled'}`);
        console.log(`  Org ID:             ${store.last_policy?.org_id || 'N/A'}`);
        console.log(`  Policy Version:     ${store.last_policy_version || 'None'}`);
        console.log(`  Last Heartbeat:     ${store.last_heartbeat || 'Never'}`);
        process.exit(0);
    }

    if (!store.device_id && envOpt) {
        if (envOpt === 'local') {
            store.api_base = 'http://localhost:3737/api';
        } else if (envOpt === 'production') {
            store.api_base = 'https://complyze.co/api';
        }
        BASE_URL = store.api_base;
    }

    console.log(`[Environment] API Base: ${BASE_URL}`);

    if (store.revoked) {
        console.log(`[Terminal] Agent is permanently revoked. Please delete local storage trace and re-enroll.`);
        process.exit(1);
    }

    if (!store.device_id || !store.device_secret) {
        if (!token) {
            console.error(`[Error] Agent is not enrolled. Please provide an enrollment token!`);
            console.log(`Usage: node cli-agent.mjs --enroll-token <token>`);
            process.exit(1);
        }

        await enroll(token);
    } else {
        console.log(`[Agent Initialized] Identity Found: ${store.device_id}`);
        console.log(`[Current Policy] Version ${store.last_policy_version}`);

        if (token) {
            console.log(`[Warning] Ignored --enroll-token because agent is already enrolled.`);
        }
    }

    // Initial sync
    await syncPolicy();
    await sendHeartbeat();

    if (store.revoked) return;

    // Start interval loops
    console.log(`\n[Agent Running] Beginning automated ${POLLING_INTERVAL / 1000}s synchronizations...\n`);

    setInterval(async () => {
        if (!store.revoked) {
            await syncPolicy();
            await sendHeartbeat();
        }
    }, POLLING_INTERVAL);
}

main().catch(console.error);
