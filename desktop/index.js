const { app, ipcMain, shell } = require('electron');
const { menubar } = require('menubar');
const path = require('path');
const sudo = require('sudo-prompt');
const { exec } = require('child_process');
const fs = require('fs');

// Path to the proxy server script
const PROXY_SCRIPT_PATH = path.resolve(__dirname, '../web/scripts/proxy-server.js');
const PROXY_PORT = 8080;

// Dashboard URL — use Vercel for production, localhost for dev
const DASHBOARD_URL = process.env.COMPLYZE_DASHBOARD || 'https://web-one-beta-35.vercel.app';
const API_URL = process.env.COMPLYZE_API || `${DASHBOARD_URL}/api/proxy/intercept`;

// Sudo prompt options
const sudoOptions = {
    name: 'Complyze Proxy',
};

let proxyProcess = null;

// Start the proxy server process
function startProxyServer() {
    if (proxyProcess) return;

    console.log('Starting proxy server...');
    const { fork } = require('child_process');

    // Check if script exists
    if (!fs.existsSync(PROXY_SCRIPT_PATH)) {
        console.error(`Proxy script not found at: ${PROXY_SCRIPT_PATH}`);
        return;
    }

    proxyProcess = fork(PROXY_SCRIPT_PATH, ['--port', PROXY_PORT.toString()], {
        stdio: 'inherit',
        env: { ...process.env, COMPLYZE_API: API_URL }
    });

    proxyProcess.on('error', (err) => {
        console.error('Proxy server failed to start:', err);
    });
}

// Stop the proxy server
function stopProxyServer() {
    if (proxyProcess) {
        console.log('Stopping proxy server...');
        proxyProcess.kill();
        proxyProcess = null;
    }
}

// ─── System Proxy Configuration (macOS) ─────────────────────────────

function setSystemProxy(enable) {
    return new Promise((resolve, reject) => {
        const interfaceName = "Wi-Fi"; // Default to Wi-Fi for MVP
        let cmd = '';

        if (enable) {
            cmd = `networksetup -setwebproxy "${interfaceName}" 127.0.0.1 ${PROXY_PORT} && networksetup -setsecurewebproxy "${interfaceName}" 127.0.0.1 ${PROXY_PORT}`;
        } else {
            cmd = `networksetup -setwebproxystate "${interfaceName}" off && networksetup -setsecurewebproxystate "${interfaceName}" off`;
        }

        sudo.exec(cmd, sudoOptions, (error, stdout, stderr) => {
            if (error) {
                console.error('Sudo error:', error);
                reject(error);
            } else {
                console.log('Sudo success:', stdout);
                resolve(true);
            }
        });
    });
}

function checkProxyStatus() {
    return new Promise((resolve) => {
        exec('networksetup -getwebproxy "Wi-Fi"', (err, stdout) => {
            if (err) {
                resolve(false);
                return;
            }
            // Output format: "Enabled: Yes" or "Enabled: No"
            const isEnabled = stdout.includes('Enabled: Yes');
            resolve(isEnabled);
        });
    });
}

// ─── App Lifecycle ──────────────────────────────────────────────────

const mb = menubar({
    index: `file://${path.join(__dirname, 'index.html')}`,
    // icon: path.join(__dirname, 'assets', 'iconTemplate.png'),
    browserWindow: {
        width: 300,
        height: 250,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    },
    preloadWindow: true,
});

mb.on('ready', () => {
    console.log('Menubar app is ready.');
    startProxyServer();
});

mb.app.on('before-quit', async () => {
    // IMPORTANT: Disable the system proxy before quitting so the user's
    // WiFi isn't left pointing at a dead proxy (which would break all traffic)
    console.log('App quitting — disabling system proxy...');
    try {
        const interfaceName = "Wi-Fi";
        const { execSync } = require('child_process');
        // Use execSync so we block until the proxy is disabled
        execSync(`networksetup -setwebproxystate "${interfaceName}" off`);
        execSync(`networksetup -setsecurewebproxystate "${interfaceName}" off`);
        console.log('System proxy disabled successfully.');
    } catch (err) {
        console.error('Failed to disable system proxy on quit:', err.message);
        // Try via sudo as a last resort (will show password prompt)
        try {
            const cmd = `networksetup -setwebproxystate "Wi-Fi" off && networksetup -setsecurewebproxystate "Wi-Fi" off`;
            sudo.exec(cmd, sudoOptions, () => { });
        } catch { /* eat error — app is quitting anyway */ }
    }
    stopProxyServer();
});

// ─── IPC Handlers ───────────────────────────────────────────────────

ipcMain.handle('proxy-enable', async () => {
    try {
        await setSystemProxy(true);
        return true;
    } catch (e) {
        console.error('Failed to enable proxy:', e);
        return false;
    }
});

ipcMain.handle('proxy-disable', async () => {
    try {
        await setSystemProxy(false);
        return false;
    } catch (e) {
        console.error('Failed to disable proxy:', e);
        return true; // Return true (fail) to keep toggle on? No, return status.
    }
});

ipcMain.handle('proxy-status', async () => {
    return await checkProxyStatus();
});

ipcMain.handle('open-dashboard', () => {
    shell.openExternal(`${DASHBOARD_URL}/monitoring`);
});
