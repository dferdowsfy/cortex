const { app, Tray, Menu, shell, Notification, ipcMain, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, exec, execSync } = require('child_process');
const sudo = require('sudo-prompt');
const os = require('os');
const crypto = require('crypto');

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

// ─── Heartbeat & Registration ────────────────────────────────────────────────

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
                workspace_id: 'default_workspace'
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
            isMonitoringEnabled: isMonitoringEnabled
        });
    }
}

function startLifecycle() {
    sendHeartbeat();
    syncGlobalSettings(); // Sync settings from dashboard
    heartbeatInterval = setInterval(() => {
        sendHeartbeat();
        syncGlobalSettings();
    }, 30000); // 30s heartbeat & sync
}

async function syncGlobalSettings() {
    try {
        const res = await fetch(`${DASHBOARD_URL}/api/proxy/settings`);
        if (res.ok) {
            const data = await res.json();
            // If settings changed on dashboard, reflect them in the agent
            if (data.proxy_enabled !== isMonitoringEnabled) {
                console.log(`[sync] Updating monitoring state to ${data.proxy_enabled} from dashboard`);
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
        console.warn('[sync] settings failed:', err.message);
    }
}

// ─── Proxy Management ─────────────────────────────────────────────────────────

function startProxy() {
    if (proxyProcess || !isMonitoringEnabled) return;

    try {
        proxyProcess = fork(PROXY_SCRIPT_PATH, ['--port', PROXY_PORT.toString()], {
            stdio: 'inherit',
            env: {
                ...process.env,
                COMPLYZE_API: `${DASHBOARD_URL}/api/proxy/intercept`,
                MONITOR_MODE: 'observe',
                CERTS_DIR: path.join(app.getPath('userData'), 'certs')
            }
        });

        proxyProcess.on('exit', (code) => {
            console.log(`Proxy exited with code ${code}`);
            proxyProcess = null;
            updateTray();
        });

        // Enable system proxy
        setSystemProxy(true);
        updateTray();
    } catch (e) {
        console.error('Failed to start proxy:', e);
    }
}

function stopProxy() {
    if (proxyProcess) {
        proxyProcess.kill();
        proxyProcess = null;
    }
    setSystemProxy(false);
    updateTray();
}

function getActiveInterface() {
    try {
        // Find the interface with the default gateway
        const routeCmd = "route -n get default | grep 'interface:' | awk '{print $2}'";
        const iface = execSync(routeCmd).toString().trim();
        if (iface) {
            // Map BSD interface (en0) to Service Name (Wi-Fi)
            const serviceCmd = `networksetup -listnetworkserviceorder | grep "Device: ${iface}" -B 1 | head -n 1 | cut -d ' ' -f 2-`;
            const service = execSync(serviceCmd).toString().trim();
            return service || "Wi-Fi";
        }
    } catch (e) {
        console.warn('Failed to detect active interface, defaulting to Wi-Fi');
    }
    return "Wi-Fi";
}

function setSystemProxy(enable) {
    if (process.platform !== 'darwin') return;

    const interfaceName = getActiveInterface();
    let cmd = '';

    if (enable) {
        // Use PAC file for selective interception (prevents blocking all sites)
        const pacUrl = `http://127.0.0.1:${PROXY_PORT}/proxy.pac`;
        cmd = `networksetup -setautoproxyurl "${interfaceName}" "${pacUrl}" && networksetup -setautoproxystate "${interfaceName}" on`;
    } else {
        cmd = `networksetup -setautoproxystate "${interfaceName}" off`;
    }

    sudo.exec(cmd, sudoOptions, (error) => {
        if (error) console.error('Proxy config error:', error);
        else console.log(`Proxy ${enable ? 'enabled' : 'disabled'} on interface "${interfaceName}" via PAC`);
    });
}

// ─── UI / Tray ───────────────────────────────────────────────────────────────

function getStatusLabel() {
    if (!isMonitoringEnabled) return 'Monitoring Disabled';
    if (proxyProcess) return 'Monitoring Active';
    return 'Initializing...';
}

function getStatusIcon() {
    const iconName = isMonitoringEnabled ? 'tray-active.png' : 'tray-inactive.png';
    return path.join(__dirname, iconName);
}

function updateTray() {
    if (!tray) return;

    const iconPath = getStatusIcon();
    let icon = nativeImage.createFromPath(iconPath);

    // Resize to fit macOS tray (typically 18x18 or 22x22)
    icon = icon.resize({ width: 18, height: 18 });

    const contextMenu = Menu.buildFromTemplate([
        { label: `Complyze Agent v${AGENT_VERSION}`, enabled: false },
        { label: `Status: ${getStatusLabel()}`, enabled: false },
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

    tray.setImage(icon);
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

// ─── App Lifecycle ───────────────────────────────────────────────────────────

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('ready', () => {
        const iconPath = path.join(__dirname, 'tray-active.png');
        let icon = nativeImage.createFromPath(iconPath);
        icon = icon.resize({ width: 18, height: 18 });

        tray = new Tray(icon);
        updateTray();

        // Create UI
        createWindow();

        // Start background tasks
        startProxy();
        startLifecycle();
    });

    app.on('window-all-closed', (e) => {
        e.preventDefault(); // Keep app running in tray
    });

    app.on('before-quit', () => {
        stopProxy();
    });
}
