const { fork, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const sudo = require('sudo-prompt');
const os = require('os');

const PROXY_PORT = 8080;
const sudoOptions = { name: 'Complyze Agent' };

class ProxyController {
    constructor(app, scriptPath, monitorCallback) {
        this.app = app;
        this.scriptPath = scriptPath;
        this.monitorCallback = monitorCallback;
        this.proxyProcess = null;
        this.isMonitoringRequested = false;
        this.failSafeTimer = null;
        this.lastHeartbeat = Date.now();
        this.certsDir = path.join(os.homedir(), '.complyze', 'certs');
    }

    async syncState(enable, settings = {}) {
        this.isMonitoringRequested = enable;

        if (enable) {
            await this.ensureProxyRunning(settings);
            await this.enableSystemProxy();
            this.startFailSafe();
        } else {
            await this.stopProxy();
            await this.disableSystemProxy();
            this.stopFailSafe();
        }
    }

    async ensureProxyRunning(settings) {
        if (this.proxyProcess && !this.proxyProcess.killed) {
            // Update settings if already running
            this.proxyProcess.send({ type: 'settings-update', settings });
            return;
        }

        console.log('[proxy-ctrl] Starting proxy server...');

        // Ensure CA exists before starting
        this.ensureCertsDir();

        this.proxyProcess = fork(this.scriptPath, ['--port', String(PROXY_PORT)], {
            stdio: 'inherit',
            env: {
                ...process.env,
                CERTS_DIR: this.certsDir,
                PROXY_ENABLED: String(settings.proxyEnabled !== false),
                BLOCK_ENABLED: String(settings.blockEnabled),
                BLOCK_HIGH_RISK: String(settings.blockHighRisk),
                REDACT_SENSITIVE: String(settings.redactSensitive),
                RISK_THRESHOLD: String(settings.riskThreshold),
                DESKTOP_BYPASS: String(settings.desktopBypass),
                USER_ATTRIBUTION_ENABLED: String(settings.userAttributionEnabled),
                INSPECT_ATTACHMENTS: String(settings.inspectAttachments || false),
                FIREBASE_UID: settings.uid || '',
            }
        });

        this.proxyProcess.on('exit', (code) => {
            console.log(`[proxy-ctrl] Proxy exited with code ${code}`);
            this.proxyProcess = null;
            if (this.monitorCallback) this.monitorCallback();
            if (this.isMonitoringRequested) {
                // Unexpected exit, fail-safe will handle system proxy
                console.warn('[proxy-ctrl] Unexpected proxy exit while monitoring enabled');
            }
        });

        // Wait for port to be ready before trusting CA
        const ready = await this.waitForPort(PROXY_PORT, 5000);
        if (ready) {
            await this.trustCACert();
            if (this.monitorCallback) this.monitorCallback();
        }
    }

    async stopProxy() {
        if (this.proxyProcess) {
            this.proxyProcess.kill();
            this.proxyProcess = null;
            if (this.monitorCallback) this.monitorCallback();
        }
    }

    async trustCACert() {
        const certPath = path.join(this.certsDir, 'ca-cert.pem');
        if (!fs.existsSync(certPath)) return;

        console.log('[proxy-ctrl] Ensuring CA cert is trusted...');
        // Only trust if not already in system keychain to avoid redundant prompts
        try {
            const checkCmd = `security find-certificate -c "Complyze AI Proxy CA"`;
            execSync(checkCmd, { stdio: 'ignore' });
            return; // Already exists
        } catch (e) {
            // Continue to trust
        }

        const trustCmd = `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`;
        sudo.exec(trustCmd, sudoOptions, (err) => {
            if (err) console.error('[proxy-ctrl] Failed to trust CA cert:', err);
            else console.log('[proxy-ctrl] CA cert trusted successfully');
        });
    }

    async enableSystemProxy() {
        if (process.platform !== 'darwin') return;
        const iface = this.getActiveInterface();
        console.log(`[proxy-ctrl] Enabling global proxy on ${iface}`);

        // Set both HTTP and HTTPS proxy
        const cmd = `networksetup -setwebproxy "${iface}" 127.0.0.1 ${PROXY_PORT} && ` +
            `networksetup -setsecurewebproxy "${iface}" 127.0.0.1 ${PROXY_PORT} && ` +
            `networksetup -setwebproxystate "${iface}" on && ` +
            `networksetup -setsecurewebproxystate "${iface}" on && ` +
            `networksetup -setautoproxystate "${iface}" off`; // Disable PAC just in case

        sudo.exec(cmd, sudoOptions, (err) => {
            if (err) console.error('[proxy-ctrl] Failed to set system proxy:', err);
        });
    }

    async disableSystemProxy() {
        if (process.platform !== 'darwin') return;
        const iface = this.getActiveInterface();
        console.log(`[proxy-ctrl] Disabling global proxy on ${iface}`);

        const cmd = `networksetup -setwebproxystate "${iface}" off && ` +
            `networksetup -setsecurewebproxystate "${iface}" off`;

        sudo.exec(cmd, sudoOptions, (err) => {
            if (err) console.error('[proxy-ctrl] Failed to disable system proxy:', err);
        });
    }

    startFailSafe() {
        if (this.failSafeTimer) return;
        this.failSafeTimer = setInterval(async () => {
            if (!this.isMonitoringRequested) return;

            const alive = await this.isPortOpen(PROXY_PORT);
            if (!alive) {
                console.warn('[proxy-ctrl] Fail-safe: Proxy server unreachable. Disabling system proxy.');
                await this.disableSystemProxy();
                // Attempt restart
                this.ensureProxyRunning({});
            }
        }, 5000);
    }

    stopFailSafe() {
        if (this.failSafeTimer) {
            clearInterval(this.failSafeTimer);
            this.failSafeTimer = null;
        }
    }

    getActiveInterface() {
        try {
            // 1. Get the current default device (e.g. en0)
            const activeIf = execSync("route get default | grep interface | awk '{print $2}'", { encoding: 'utf8' }).trim();
            if (!activeIf) return "Wi-Fi";

            // 2. Map device to service name using service order list
            const serviceOrder = execSync("networksetup -listnetworkserviceorder", { encoding: 'utf8' });
            const lines = serviceOrder.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes(`Device: ${activeIf}`)) {
                    // The service name is in the preceding line, e.g. "(2) Wi-Fi"
                    const prevLine = lines[i - 1] || "";
                    const match = prevLine.match(/^\(\d+\)\s+(.*)$/);
                    if (match) return match[1].trim();
                }
            }
            return "Wi-Fi";
        } catch (e) {
            console.error('[proxy-ctrl] Error detecting active interface:', e.message);
            return "Wi-Fi";
        }
    }

    isPortOpen(port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(1000);
            socket.once('connect', () => { socket.destroy(); resolve(true); });
            socket.once('timeout', () => { socket.destroy(); resolve(false); });
            socket.once('error', () => { socket.destroy(); resolve(false); });
            socket.connect(port, '127.0.0.1');
        });
    }

    async waitForPort(port, timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await this.isPortOpen(port)) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    }

    ensureCertsDir() {
        if (!fs.existsSync(this.certsDir)) {
            fs.mkdirSync(this.certsDir, { recursive: true });
        }
    }
}

module.exports = { ProxyController };
