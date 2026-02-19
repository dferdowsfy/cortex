const { app, Tray, Menu, shell, Notification, ipcMain, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, exec, execSync } = require('child_process');
const sudo = require('sudo-prompt');
const os = require('os');
const crypto = require('crypto');

// ── Firebase ──────────────────────────────────────────────────────────────────
const { initFirebase, onAuthStateChanged, signInWithCustomToken } = require('./lib/firebase-config');
const { FirebaseSettingsSync } = require('./lib/firebase-settings');
const { ProxyController } = require('./lib/proxy-controller');

// ─── Configuration ───────────────────────────────────────────────────────────
const AGENT_VERSION = '1.2.0';
const PROXY_PORT = 8080;
const PROXY_SCRIPT_PATH = path.join(__dirname, 'scripts', 'proxy-server.js');
const DASHBOARD_URL = process.env.COMPLYZE_DASHBOARD || 'http://localhost:3737';

const sudoOptions = {
    name: 'Complyze Monitoring Agent',
};

// ─── State ──────────────────────────────────────────────────────────────────
let tray = null;
let mainWindow = null;
let proxyProcess = null;
let isMonitoringEnabled = true;
let heartbeatInterval = null;
let deviceId = null;
let lastSyncTime = 'Never';

// Firebase state
let firebaseUid = null;
const settingsSync = new FirebaseSettingsSync();

// Proxy control
let proxyController = null;

// Current settings from Firestore (cached for offline fallback)
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
};

// ─── Initialize Device ID ────────────────────────────────────────────────────
function getDeviceId() {
    if (deviceId) return deviceId;
    const configPath = path.join(app.getPath('userData'), 'device.json');
    if (fs.existsSync(configPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            deviceId = data.id;
            return deviceId;
        } catch (e) { }
    }

    deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ id: deviceId }));
    return deviceId;
}

// ─── Firebase Auth Initialization ────────────────────────────────────────────
function initializeFirebaseAuth() {
    const { auth, db } = initFirebase();

    if (!auth || !db) {
        console.warn('[firebase] Auth or DB not available, falling back to API sync');
        startLegacyLifecycle();
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log('[firebase] No authenticated user — waiting for login');
            firebaseUid = null;
            settingsSync.unsubscribe();
            // Fall back to API-based sync until user logs in
            startLegacyLifecycle();
            return;
        }

        firebaseUid = user.uid;
        console.log(`[firebase] Authenticated as uid=${user.uid}`);

        // Subscribe to realtime settings from Firestore
        settingsSync.subscribe(db, user.uid, (settings) => {
            applyInterceptorSettings(settings);
        });

        // Stop legacy polling if it was running
        stopLegacyLifecycle();

        // Continue heartbeat for agent registration (but not settings sync)
        startHeartbeatOnly();
    });

    // Attempt to sign in with stored token
    const tokenPath = path.join(app.getPath('userData'), 'auth-token.json');
    if (fs.existsSync(tokenPath)) {
        try {
            const { customToken } = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            if (customToken) {
                signInWithCustomToken(auth, customToken).catch((err) => {
                    console.warn('[firebase] Stored token expired or invalid:', err.message);
                });
            }
        } catch (e) {
            console.warn('[firebase] Failed to read stored token:', e.message);
        }
    }
}

// ─── Apply Settings from Firestore (realtime) ───────────────────────────────
function applyInterceptorSettings(settings) {
    currentSettings = { ...currentSettings, ...settings };
    console.log('[settings] Applying:', JSON.stringify(currentSettings));

    const shouldMonitor = currentSettings.proxyEnabled && currentSettings.interceptEnabled;
    const prevMonitoring = isMonitoringEnabled;
    isMonitoringEnabled = shouldMonitor;

    if (proxyController) {
        proxyController.syncState(isMonitoringEnabled, {
            ...currentSettings,
            uid: firebaseUid
        });
    }

    if (shouldMonitor !== prevMonitoring) {
        new Notification({
            title: 'Complyze Agent',
            body: isMonitoringEnabled
                ? 'Monitoring enabled (synced from dashboard)'
                : 'Monitoring disabled (synced from dashboard)',
        }).show();
    }

    lastSyncTime = new Date().toLocaleTimeString();
    updateTray();
    syncStatusToWindow();
}

// ─── Heartbeat (registration only — settings come from Firestore) ───────────
async function sendHeartbeat() {
    const status = isMonitoringEnabled ? (proxyProcess ? 'Healthy' : 'Connecting') : 'Offline';

    try {
        const res = await fetch(`${DASHBOARD_URL}/api/agent/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: getDeviceId(),
                version: AGENT_VERSION,
                hostname: os.hostname(),
                os: process.platform === 'darwin' ? 'macOS' : 'Windows',
                status: status,
                service_connectivity: true,
                traffic_routing: isMonitoringEnabled && !!proxyProcess,
                os_integration: true,
                workspace_id: 'default_workspace',
                firebase_synced: !!firebaseUid,
            }),
        });

        if (res.ok) {
            lastSyncTime = new Date().toLocaleTimeString();
            updateTray();
            syncStatusToWindow();
        }
    } catch (err) {
        console.warn('[heartbeat] failed:', err.message);
    }
}

function syncStatusToWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-update', {
            status: isMonitoringEnabled ? (proxyProcess ? 'Healthy' : 'Connecting') : 'Offline',
            deviceId: getDeviceId(),
            lastSync: lastSyncTime,
            isMonitoringEnabled: isMonitoringEnabled,
            firebaseSynced: !!firebaseUid,
            settings: currentSettings,
        });
    }
}

// ─── Heartbeat-only loop (when Firebase is active) ───────────────────────────
function startHeartbeatOnly() {
    stopLegacyLifecycle();
    sendHeartbeat();
    heartbeatInterval = setInterval(() => {
        sendHeartbeat();
    }, 30000);
}

// ─── Legacy API-based sync (fallback when Firebase isn't available) ──────────
let legacyInterval = null;

function startLegacyLifecycle() {
    if (legacyInterval) return;
    sendHeartbeat();
    syncGlobalSettingsLegacy();
    legacyInterval = setInterval(() => {
        sendHeartbeat();
        syncGlobalSettingsLegacy();
    }, 30000);
}

function stopLegacyLifecycle() {
    if (legacyInterval) {
        clearInterval(legacyInterval);
        legacyInterval = null;
    }
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

async function syncGlobalSettingsLegacy() {
    try {
        const res = await fetch(`${DASHBOARD_URL}/api/proxy/settings`);
        if (res.ok) {
            const data = await res.json();
            if (data.proxy_enabled !== isMonitoringEnabled) {
                console.log(`[sync-legacy] Updating monitoring state to ${data.proxy_enabled} from dashboard`);
                isMonitoringEnabled = data.proxy_enabled;
                if (isMonitoringEnabled) {
                    startProxy();
                } else {
                    stopProxy();
                }
                updateTray();
                syncStatusToWindow();
            }
        }
    } catch (err) {
        console.warn('[sync-legacy] settings failed:', err.message);
    }
}

// ─── Proxy Management ─────────────────────────────────────────────────────────
function startProxy() {
    if (proxyController) {
        proxyController.syncState(true, { ...currentSettings, uid: firebaseUid });
    }
}

function stopProxy() {
    if (proxyController) {
        proxyController.syncState(false);
    }
}

// ─── UI / Tray ───────────────────────────────────────────────────────────────
function getStatusLabel() {
    if (!isMonitoringEnabled) return 'Monitoring Disabled';
    return 'Monitoring Active';
}

function getSyncLabel() {
    if (firebaseUid) return 'Realtime Sync (Firebase)';
    return 'API Sync (Legacy)';
}

function getStatusIcon() {
    // Use pre-generated colored PNG icons (green = active, gray = inactive).
    // Electron's nativeImage.createFromDataURL does NOT support SVG, only raster.
    // Do NOT use setTemplateImage — that forces macOS monochrome rendering.
    const iconFile = isMonitoringEnabled ? 'tray-active.png' : 'tray-inactive.png';
    const iconPath = path.join(__dirname, iconFile);
    const img = nativeImage.createFromPath(iconPath);
    const resized = img.resize({ width: 18, height: 18 });
    resized.setTemplateImage(false);
    return resized;
}

function updateTray() {
    if (!tray) return;

    const contextMenu = Menu.buildFromTemplate([
        { label: `Complyze Agent v${AGENT_VERSION}`, enabled: false },
        { label: `Status: ${getStatusLabel()}`, enabled: false },
        { label: `Sync: ${getSyncLabel()}`, enabled: false },
        { label: `Last Sync: ${lastSyncTime}`, enabled: false },
        { type: 'separator' },
        { label: 'Open Status Window', click: () => { if (mainWindow) { mainWindow.show(); } else { createWindow(); } } },
        {
            label: isMonitoringEnabled ? 'Disable Monitoring' : 'Enable Monitoring',
            click: () => toggleMonitoring()
        },
        { label: 'Open Control Dashboard', click: () => shell.openExternal(`${DASHBOARD_URL}/dashboard`) },
        { type: 'separator' },
        { label: 'Check for Updates...', click: () => { } },
        { label: 'Quit Complyze', click: () => { app.isQuiting = true; app.quit(); } },
    ]);

    tray.setImage(getStatusIcon());
    tray.setToolTip(`Complyze Agent: ${getStatusLabel()}`);
    tray.setContextMenu(contextMenu);
}

function toggleMonitoring() {
    isMonitoringEnabled = !isMonitoringEnabled;

    if (isMonitoringEnabled) {
        startProxy();
    } else {
        stopProxy();
    }

    // Write toggle state back to Firestore so dashboard reflects change
    if (firebaseUid) {
        settingsSync.updateSettings({
            proxyEnabled: isMonitoringEnabled,
            interceptEnabled: isMonitoringEnabled,
        });
    }

    sendHeartbeat();
    syncStatusToWindow();
    updateTray();

    new Notification({
        title: 'Complyze Agent',
        body: isMonitoringEnabled ? 'Monitoring has been enabled.' : 'Monitoring has been disabled.'
    }).show();
}

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 500,
        resizable: false,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'hiddenInset',
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        syncStatusToWindow();
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

ipcMain.on('toggle-monitoring', () => {
    toggleMonitoring();
});

// Handle Firebase token from dashboard deep link
ipcMain.on('firebase-token', (event, token) => {
    if (token) {
        const tokenPath = path.join(app.getPath('userData'), 'auth-token.json');
        fs.writeFileSync(tokenPath, JSON.stringify({ customToken: token }));
        const { auth } = initFirebase();
        if (auth) {
            signInWithCustomToken(auth, token).catch((err) => {
                console.error('[firebase] Sign-in with token failed:', err.message);
            });
        }
    }
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────

// Helper: show and focus the main window (create if needed)
function showAndFocusWindow() {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    } else {
        createWindow();
    }
}

// Helper: handle deep link URLs (complyze://open, complyze://login?token=...)
function handleDeepLink(url) {
    if (!url || typeof url !== 'string') return;
    console.log('[protocol] Received deep link:', url);

    try {
        const parsed = new URL(url);

        if (parsed.protocol === 'complyze:') {
            // Always bring window to front on any deep link
            showAndFocusWindow();

            // Handle login with token
            if (parsed.hostname === 'login' || parsed.pathname === '//login') {
                const token = parsed.searchParams.get('token');
                if (token) {
                    const tokenPath = path.join(app.getPath('userData'), 'auth-token.json');
                    fs.writeFileSync(tokenPath, JSON.stringify({ customToken: token }));
                    const { auth } = initFirebase();
                    if (auth) {
                        signInWithCustomToken(auth, token).catch((err) => {
                            console.error('[firebase] Deep-link sign-in failed:', err.message);
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[protocol] Failed to parse deep link URL:', e.message);
        // Fallback: still show the window
        showAndFocusWindow();
    }
}

// Register protocol for browser deep-linking
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('complyze', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('complyze');
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        showAndFocusWindow();

        // Handle protocol link: complyze://open or complyze://login
        const url = commandLine.pop();
        handleDeepLink(url);
    });

    // macOS: handle complyze:// protocol when app is already running
    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeepLink(url);
    });
    app.on('ready', () => {
        // Create Tray IMMEDIATELY for maximum visibility — use programmatic green icon
        tray = new Tray(getStatusIcon());
        tray.setToolTip('Complyze Agent — Monitoring Active');
        updateTray();

        // Initialize Proxy Controller
        proxyController = new ProxyController(app, PROXY_SCRIPT_PATH, () => {
            updateTray();
            syncStatusToWindow();
        });

        // Create UI with slight delay to ensure tray is registered
        setTimeout(() => {
            createWindow();
            initializeFirebaseAuth();
            if (isMonitoringEnabled) startProxy();
        }, 100);
    });

    app.on('window-all-closed', (e) => {
        e.preventDefault(); // Keep app running in tray
    });

    app.on('before-quit', () => {
        settingsSync.unsubscribe();
        stopLegacyLifecycle();
        stopProxy();
    });
}
