#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ── Firebase ──────────────────────────────────────────────────────────────────
const { initFirebase, onAuthStateChanged, signInWithCustomToken } = require('./lib/firebase-config');
const { FirebaseSettingsSync } = require('./lib/firebase-settings');
const { ProxyController } = require('./lib/proxy-controller');

// ─── Configuration ───────────────────────────────────────────────────────────
const AGENT_VERSION = '1.3.0 (Headless Node.js)';
const PROXY_PORT = 8080;
const PROXY_SCRIPT_PATH = path.join(__dirname, 'scripts', 'proxy-server.js');
const DASHBOARD_URL = process.env.COMPLYZE_DASHBOARD || 'https://complyze.co';

// Use a unified config directory
const CONFIG_DIR = path.join(os.homedir(), '.complyze');
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// ─── State ──────────────────────────────────────────────────────────────────
let proxyController = null;
let isMonitoringEnabled = true;

// Firebase state
let firebaseUid = null;
const settingsSync = new FirebaseSettingsSync();

let currentSettings = {
    blockEnabled: true,
    interceptEnabled: true,
    proxyEnabled: true,
    fullAuditMode: false,
    blockHighRisk: false,
    redactSensitive: false,
    alertOnViolations: true,
    desktopBypass: false,
    riskThreshold: 60,
    retentionDays: 90,
    userAttributionEnabled: true,
};

// ─── Initialize Device ID ────────────────────────────────────────────────────
let deviceId = null;
function getDeviceId() {
    if (deviceId) return deviceId;
    const configPath = path.join(CONFIG_DIR, 'device.json');
    if (fs.existsSync(configPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            deviceId = data.id;
            return deviceId;
        } catch (e) { }
    }

    deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
    fs.writeFileSync(configPath, JSON.stringify({ id: deviceId }));
    return deviceId;
}

// ─── Firebase Auth Initialization ────────────────────────────────────────────
function initializeFirebaseAuth() {
    const { auth, db } = initFirebase();

    if (!auth || !db) {
        console.warn('[firebase] Auth or DB not available, checking for auto-enrollment token');
        checkAutoEnrollment();
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log('[firebase] No authenticated user — checking for auto-enrollment token');
            firebaseUid = null;
            settingsSync.unsubscribe();
            checkAutoEnrollment();
            return;
        }

        firebaseUid = user.uid;
        console.log(`[firebase] Authenticated as uid=${user.uid}`);

        // Subscribe to realtime settings from Firestore
        settingsSync.subscribe(db, user.uid, (settings) => {
            applyInterceptorSettings(settings);
        });
    });
}

function checkAutoEnrollment() {
    // Priority 1: token passed as environment variable (MDM/install script)
    let token = process.env.COMPLYZE_ENROLL_TOKEN;

    // Priority 2: token file written by admin install script
    const tokenPath = path.join(CONFIG_DIR, 'auth-token.json');
    if (!token && fs.existsSync(tokenPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            token = data.customToken;
        } catch (e) { }
    }

    if (token) {
        applyEnrollmentToken(token);
    } else {
        console.log('[enroll] No enrollment token found.');
        console.log('[enroll] To enroll this device, run:');
        console.log(`[enroll]   echo \'{"customToken":"YOUR_TOKEN"}\' > ${tokenPath}`);
        console.log('[enroll] The agent will pick it up automatically within 5 seconds.');
        // Start proxy in standalone observe-only mode without authentication
        startStandaloneProxyFallback();
        // Then watch for a token to be placed
        watchForEnrollmentToken(tokenPath);
    }
}

// Polls for a new enrollment token file every 5 seconds.
// When found, enrolls the device without requiring any user action or restart.
function watchForEnrollmentToken(tokenPath) {
    const watcher = setInterval(() => {
        if (!fs.existsSync(tokenPath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            if (data.customToken) {
                console.log('[enroll] Token file detected — enrolling device...');
                clearInterval(watcher);
                applyEnrollmentToken(data.customToken);
            }
        } catch (e) { }
    }, 5000);
}

function applyEnrollmentToken(token) {
    console.log('[enroll] Applying enrollment token...');
    const { auth } = initFirebase();
    if (auth) {
        signInWithCustomToken(auth, token)
            .then(() => {
                console.log('[enroll] ✅ Device enrolled and managed from', DASHBOARD_URL);
            })
            .catch((err) => {
                console.error('[enroll] ❌ Token sign-in failed:', err.message);
                console.error('[enroll]    The token may be expired. Generate a new one from the Admin Hub.');
                startStandaloneProxyFallback();
            });
    }
}


function startStandaloneProxyFallback() {
    if (!proxyController) {
        proxyController = new ProxyController(null, PROXY_SCRIPT_PATH, () => { });
    }
    proxyController.syncState(true, { ...currentSettings, proxyEnabled: true });
}

// ─── Apply Configuration ─────────────────────────────────────────────────────
function applyInterceptorSettings(settings) {
    if (!settings) return;

    currentSettings = { ...currentSettings, ...settings };

    // Default monitoring to true unless explicitly disabled in settings
    isMonitoringEnabled = currentSettings.proxyEnabled !== false;
    console.log(`[sync] Applying settings. Monitoring enabled: ${isMonitoringEnabled}`);

    if (!proxyController) {
        proxyController = new ProxyController(null, PROXY_SCRIPT_PATH, () => { });
    }

    proxyController.syncState(isMonitoringEnabled, {
        ...currentSettings,
        uid: firebaseUid
    });
}

// ─── Heartbeat Mechanism ─────────────────────────────────────────────────────
function sendHeartbeat() {
    if (!firebaseUid) return;

    const payload = {
        agent_version: AGENT_VERSION,
        device_id: getDeviceId(),
        proxy_running: proxyController ? !!proxyController.proxyProcess : false,
        proxy_enabled: isMonitoringEnabled,
        last_seen: new Date().toISOString(),
        hostname: os.hostname(),
        platform: os.platform(),
    };

    fetch(`${DASHBOARD_URL}/api/proxy/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(err => {
        console.warn('[heartbeat] Failed to send status:', err.message);
    });
}

setInterval(sendHeartbeat, 60000); // 1 min

// ─── Run ─────────────────────────────────────────────────────────────────────
console.log('');
console.log('===================================================');
console.log(`= Complyze Headless Shield v${AGENT_VERSION} =`);
console.log('===================================================');
console.log(`Dashboard: ${DASHBOARD_URL}`);
console.log(`Device ID: ${getDeviceId()}`);
console.log('Running seamlessly in the background.');
console.log('');

initializeFirebaseAuth();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (proxyController) {
        await proxyController.stopProxy();
        await proxyController.disableSystemProxy();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    if (proxyController) {
        await proxyController.stopProxy();
        await proxyController.disableSystemProxy();
    }
    process.exit(0);
});

async function handleCrash(err) {
    console.error('AGENT CRASH:', err);
    if (proxyController) {
        try {
            // Emergency cleanup: try to disable proxy before dying
            await proxyController.disableSystemProxy();
        } catch (e) { }
    }
    process.exit(1);
}

process.on('uncaughtException', handleCrash);
process.on('unhandledRejection', handleCrash);

