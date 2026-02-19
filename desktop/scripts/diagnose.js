#!/usr/bin/env node
/**
 * Complyze Proxy Diagnostics
 *
 * Runs compatibility and health checks for the Complyze proxy:
 *   - CA certificate file validity
 *   - CA certificate OS trust
 *   - Proxy reachability
 *   - System proxy configuration
 *   - VPN / competing proxy detection
 *   - HTTPS passthrough verification (google.com, slack.com, github.com)
 *   - AI domain interception verification (api.openai.com)
 *
 * Usage:
 *   node scripts/diagnose.js            # human-readable output + report file
 *   node scripts/diagnose.js --json     # JSON output only
 *
 * Exit codes:
 *   0 = all checks pass or warn
 *   1 = one or more checks failed
 *   2 = fatal internal error
 */

'use strict';

const fs = require('fs');
const net = require('net');
const tls = require('tls');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ─── Configuration ────────────────────────────────────────────────────────────

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10);
const CERTS_DIR = path.join(__dirname, '..', 'certs');
const CA_CERT_PATH = path.join(CERTS_DIR, 'ca-cert.pem');
const REPORT_FILE = path.join(CERTS_DIR, 'diagnostics-report.json');
const CHECK_TIMEOUT_MS = parseInt(process.env.CHECK_TIMEOUT_MS || '5000', 10);
const JSON_MODE = process.argv.includes('--json');

const PASSTHROUGH_HOSTS = ['google.com', 'slack.com', 'github.com'];
const INTERCEPT_HOSTS = ['api.openai.com'];

// Common competing-proxy ports to probe
const COMPETING_PORTS = [1080, 3128, 7890, 8888, 9090, 1087];

// ─── Result helpers ───────────────────────────────────────────────────────────

function pass(message, detail) { return { status: 'pass', message, ...(detail != null ? { detail } : {}) }; }
function warn(message, detail) { return { status: 'warn', message, ...(detail != null ? { detail } : {}) }; }
function fail(message, detail) { return { status: 'fail', message, ...(detail != null ? { detail } : {}) }; }
function skip(message, detail) { return { status: 'skip', message, ...(detail != null ? { detail } : {}) }; }

// ─── Utilities ────────────────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
    ]);
}

/** Attempt TCP connect; resolves true if connected, false otherwise */
function tcpConnect(host, port, ms) {
    return new Promise(resolve => {
        const sock = net.createConnection({ host, port });
        const timer = setTimeout(() => { sock.destroy(); resolve(false); }, ms);
        sock.once('connect', () => { clearTimeout(timer); sock.destroy(); resolve(true); });
        sock.once('error', () => { clearTimeout(timer); resolve(false); });
    });
}

/**
 * Send HTTP CONNECT through proxy, upgrade to TLS, return peer certificate.
 * rejectUnauthorized=false so we can inspect self-signed MITM certs.
 */
function connectViaProxy(proxyHost, proxyPort, targetHost, targetPort, ms) {
    return new Promise((resolve, reject) => {
        const sock = net.createConnection({ host: proxyHost, port: proxyPort });
        const timer = setTimeout(() => { sock.destroy(); reject(new Error('Timeout')); }, ms);

        sock.once('error', err => { clearTimeout(timer); reject(err); });

        sock.once('connect', () => {
            sock.write(
                `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                `Host: ${targetHost}:${targetPort}\r\n\r\n`
            );

            let buf = '';
            sock.on('data', chunk => {
                buf += chunk.toString('binary');
                const headerEnd = buf.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;

                sock.removeAllListeners('data');

                const statusLine = buf.split('\r\n')[0];
                if (!/^HTTP\/1\.[01] 200/.test(statusLine)) {
                    clearTimeout(timer);
                    sock.destroy();
                    reject(new Error(`Proxy CONNECT returned: ${statusLine}`));
                    return;
                }

                const tlsSocket = tls.connect({
                    socket: sock,
                    servername: targetHost,
                    rejectUnauthorized: false,
                });

                tlsSocket.once('secureConnect', () => {
                    clearTimeout(timer);
                    const cert = tlsSocket.getPeerCertificate(true);
                    tlsSocket.destroy();
                    resolve(cert);
                });

                tlsSocket.once('error', err => {
                    clearTimeout(timer);
                    reject(err);
                });
            });
        });
    });
}

// ─── Check 1: CA certificate file ────────────────────────────────────────────

async function checkCACert() {
    if (!fs.existsSync(CA_CERT_PATH)) {
        return fail(`CA cert not found at ${CA_CERT_PATH}.`, {
            path: CA_CERT_PATH,
            hint: 'Start the proxy once to auto-generate the CA certificate.',
        });
    }

    let pem;
    try {
        pem = fs.readFileSync(CA_CERT_PATH, 'utf8');
    } catch (err) {
        return fail(`Cannot read CA cert: ${err.message}`, { path: CA_CERT_PATH });
    }

    if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
        return fail('CA cert file exists but does not contain a valid PEM certificate.', { path: CA_CERT_PATH });
    }

    // Try to parse expiry with openssl
    try {
        const { stdout } = await execAsync(
            `openssl x509 -noout -enddate -in "${CA_CERT_PATH}"`,
            { timeout: 3000 }
        );
        const match = stdout.match(/notAfter=(.+)/);
        if (match) {
            const expiry = new Date(match[1].trim());
            const now = new Date();
            if (expiry < now) {
                return fail(`CA cert expired on ${expiry.toISOString()}.`, {
                    path: CA_CERT_PATH,
                    expiry: expiry.toISOString(),
                });
            }
            const daysLeft = Math.floor((expiry - now) / 86400000);
            if (daysLeft < 30) {
                return warn(`CA cert expires in ${daysLeft} day(s) (${expiry.toISOString().slice(0, 10)}).`, {
                    path: CA_CERT_PATH,
                    expiry: expiry.toISOString(),
                    days_remaining: daysLeft,
                });
            }
            return pass(`CA cert is valid (expires in ${daysLeft} days).`, {
                path: CA_CERT_PATH,
                expiry: expiry.toISOString(),
                days_remaining: daysLeft,
            });
        }
    } catch {
        // openssl unavailable — confirm PEM presence only
    }

    return pass('CA cert file exists and contains a PEM certificate.', { path: CA_CERT_PATH });
}

// ─── Check 2: CA certificate OS trust ────────────────────────────────────────

async function checkCATrust() {
    if (!fs.existsSync(CA_CERT_PATH)) {
        return skip('CA cert not found — skipping trust check.');
    }

    const platform = os.platform();

    try {
        if (platform === 'darwin') {
            const { stdout } = await execAsync(
                `security find-certificate -a -p /Library/Keychains/System.keychain 2>/dev/null ` +
                `| openssl x509 -noout -subject 2>/dev/null | grep -i complyze`,
                { timeout: 5000 }
            );
            if (stdout.trim()) {
                return pass('CA cert is trusted in macOS System Keychain.');
            }
            return fail('CA cert is NOT in macOS System Keychain.', {
                hint: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${CA_CERT_PATH}"`,
            });
        }

        if (platform === 'linux') {
            // Get the CN of our CA cert
            let cn = '';
            try {
                const { stdout: subj } = await execAsync(
                    `openssl x509 -noout -subject -in "${CA_CERT_PATH}" 2>/dev/null`,
                    { timeout: 3000 }
                );
                cn = (subj.match(/CN\s*=\s*([^,\n/]+)/) || [])[1]?.trim() || '';
            } catch { /* openssl unavailable */ }

            // Check common CA bundle locations
            const caBundles = [
                '/etc/ssl/certs/ca-certificates.crt',   // Debian/Ubuntu
                '/etc/pki/tls/certs/ca-bundle.crt',     // RHEL/CentOS
                '/etc/ssl/ca-bundle.pem',                // OpenSUSE
            ];
            const bundle = caBundles.find(b => fs.existsSync(b));

            if (bundle && cn) {
                try {
                    const { stdout: grep } = await execAsync(
                        `grep -c "${cn}" "${bundle}" 2>/dev/null || echo 0`,
                        { timeout: 3000 }
                    );
                    if (parseInt(grep.trim(), 10) > 0) {
                        return pass('CA cert CN found in system CA bundle.', { bundle, cn });
                    }
                } catch { /* grep failed */ }
            }

            // Fallback: check /etc/ssl/certs/ for a file with matching hash
            try {
                const { stdout: hash } = await execAsync(
                    `openssl x509 -noout -hash -in "${CA_CERT_PATH}" 2>/dev/null`,
                    { timeout: 3000 }
                );
                const certHash = hash.trim();
                if (certHash && fs.existsSync(`/etc/ssl/certs/${certHash}.0`)) {
                    return pass('CA cert is trusted (hash symlink found in /etc/ssl/certs/).', { hash: certHash });
                }
            } catch { /* openssl unavailable */ }

            return fail('CA cert does not appear to be trusted by the system.', {
                hint: `Copy ca-cert.pem to /usr/local/share/ca-certificates/complyze.crt then run: sudo update-ca-certificates`,
            });
        }

        if (platform === 'win32') {
            const { stdout } = await execAsync(
                `certutil -store Root 2>nul | findstr /i "Complyze"`,
                { timeout: 5000 }
            );
            if (stdout.trim()) {
                return pass('CA cert is trusted in Windows Root certificate store.');
            }
            return fail('CA cert is NOT in Windows Root certificate store.', {
                hint: `Run as admin: certutil -addstore Root "${CA_CERT_PATH}"`,
            });
        }

        return skip(`CA trust check not implemented for platform: ${platform}.`);
    } catch (err) {
        return warn(`CA trust check inconclusive: ${err.message}`, { platform });
    }
}

// ─── Check 3: Proxy running ───────────────────────────────────────────────────

async function checkProxyRunning() {
    const reachable = await tcpConnect('127.0.0.1', PROXY_PORT, CHECK_TIMEOUT_MS);
    if (reachable) {
        return pass(`Proxy is listening on 127.0.0.1:${PROXY_PORT}.`, { port: PROXY_PORT });
    }
    return fail(`Proxy is NOT reachable on 127.0.0.1:${PROXY_PORT}.`, {
        port: PROXY_PORT,
        hint: 'Start the proxy with: npm run proxy',
    });
}

// ─── Check 4: System proxy settings ──────────────────────────────────────────

async function checkProxySettings() {
    const issues = [];
    const details = {};

    // Check environment variables first
    const envProxy =
        process.env.HTTPS_PROXY || process.env.https_proxy ||
        process.env.HTTP_PROXY || process.env.http_proxy || '';

    if (envProxy) {
        details.env_proxy = envProxy;
        if (!envProxy.includes('127.0.0.1') && !envProxy.includes('localhost')) {
            issues.push(`Environment proxy (${envProxy}) does not point to our proxy (127.0.0.1:${PROXY_PORT})`);
        }
    }

    const platform = os.platform();

    if (platform === 'darwin') {
        try {
            // 1. Get the current default device (e.g. en0)
            const { stdout: activeIfRaw } = await execAsync("route get default | grep interface | awk '{print $2}'", { timeout: 3000 }).catch(() => ({ stdout: '' }));
            const activeIf = activeIfRaw.trim();

            let service = 'Wi-Fi';
            if (activeIf) {
                // 2. Map device to service name using service order list
                const { stdout: serviceOrder } = await execAsync("networksetup -listnetworkserviceorder", { timeout: 3000 }).catch(() => ({ stdout: '' }));
                const lines = serviceOrder.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(`Device: ${activeIf}`)) {
                        const prevLine = lines[i - 1] || "";
                        const match = prevLine.match(/^\(\d+\)\s+(.*)$/);
                        if (match) {
                            service = match[1].trim();
                            break;
                        }
                    }
                }
            }

            const { stdout: secureProxy } = await execAsync(
                `networksetup -getsecurewebproxy "${service}" 2>/dev/null`,
                { timeout: 3000 }
            );

            const serverMatch = secureProxy.match(/Server:\s*(\S+)/);
            const portMatch = secureProxy.match(/Port:\s*(\d+)/);
            const enabledMatch = secureProxy.match(/Enabled:\s*(\w+)/);

            if (serverMatch && portMatch) {
                details.macos_https_proxy = `${serverMatch[1]}:${portMatch[1]}`;
                details.macos_https_proxy_enabled = enabledMatch ? enabledMatch[1] : 'unknown';
                details.macos_network_service = service.trim();

                if (enabledMatch && enabledMatch[1].toLowerCase() !== 'yes') {
                    issues.push(`macOS HTTPS proxy (${details.macos_https_proxy}) is configured but not enabled`);
                } else if (serverMatch[1] !== '127.0.0.1' || portMatch[1] !== String(PROXY_PORT)) {
                    issues.push(`macOS HTTPS proxy (${details.macos_https_proxy}) does not match 127.0.0.1:${PROXY_PORT}`);
                }
            } else {
                issues.push(`macOS HTTPS proxy is not configured for service "${service.trim()}"`);
            }
        } catch { /* networksetup unavailable */ }
    }

    if (issues.length === 0) {
        const hasEnvProxy = !!envProxy;
        return pass(
            hasEnvProxy
                ? `Proxy env var is set: ${envProxy}`
                : 'No conflicting proxy settings detected.',
            details
        );
    }

    return warn(`Proxy settings may need attention: ${issues.join('; ')}`, details);
}

// ─── Check 5: VPN / competing proxy detection ─────────────────────────────────

async function detectVPNAndProxy() {
    const findings = [];

    // Network interfaces with VPN-like names
    const ifaces = os.networkInterfaces();
    const vpnIfaces = Object.keys(ifaces).filter(name =>
        /^(utun|tun\d|ppp\d|tap\d|vpn|wg\d|wireguard|ipsec)/i.test(name)
    );
    if (vpnIfaces.length > 0) {
        findings.push({ type: 'vpn_interface', interfaces: vpnIfaces });
    }

    // Environment proxy vars pointing to a third-party proxy
    const proxyEnvVars = [
        'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
        'http_proxy', 'https_proxy', 'all_proxy',
    ];
    const thirdPartyEnv = proxyEnvVars
        .filter(v => process.env[v])
        .map(v => ({ var: v, value: process.env[v] }))
        .filter(e => !e.value.includes('127.0.0.1') && !e.value.includes('localhost'));
    if (thirdPartyEnv.length > 0) {
        findings.push({ type: 'env_proxy', proxies: thirdPartyEnv });
    }

    // Probe competing proxy ports on localhost
    const listeningPorts = (
        await Promise.all(
            COMPETING_PORTS
                .filter(p => p !== PROXY_PORT)
                .map(async p => (await tcpConnect('127.0.0.1', p, 500)) ? p : null)
        )
    ).filter(Boolean);
    if (listeningPorts.length > 0) {
        findings.push({ type: 'competing_proxy_ports', ports: listeningPorts });
    }

    if (findings.length === 0) {
        return pass('No VPN or competing proxy detected.');
    }

    const summary = findings.map(f => {
        if (f.type === 'vpn_interface') return `VPN interface(s): ${f.interfaces.join(', ')}`;
        if (f.type === 'env_proxy') return `Env proxy: ${f.proxies.map(e => `${e.var}=${e.value}`).join(', ')}`;
        if (f.type === 'competing_proxy_ports') return `Listening proxy ports: ${f.ports.join(', ')}`;
        return JSON.stringify(f);
    }).join('; ');

    return warn(`Potential VPN or competing proxy: ${summary}`, { findings });
}

// ─── Check 6: HTTPS passthrough tests ────────────────────────────────────────

async function testPassthrough(hostname) {
    const proxyUp = await tcpConnect('127.0.0.1', PROXY_PORT, 1500);
    if (!proxyUp) {
        return skip(`Proxy not running — skipping passthrough test for ${hostname}.`);
    }

    try {
        const cert = await withTimeout(
            connectViaProxy('127.0.0.1', PROXY_PORT, hostname, 443, CHECK_TIMEOUT_MS),
            CHECK_TIMEOUT_MS,
            `passthrough ${hostname}`
        );

        if (!cert || !cert.subject) {
            return warn(`Could not retrieve TLS certificate for ${hostname} through proxy.`, { host: hostname });
        }

        const issuerCN = (cert.issuer && cert.issuer.CN) || '';
        const issuerO = (cert.issuer && cert.issuer.O) || '';

        // Our MITM CA would have "Complyze" in the issuer
        if (/complyze/i.test(issuerCN) || /complyze/i.test(issuerO)) {
            return fail(
                `${hostname} is being intercepted by the Complyze proxy (expected passthrough).`,
                { host: hostname, cert_issuer: cert.issuer }
            );
        }

        return pass(
            `${hostname} passes through correctly (cert issuer: ${issuerCN || issuerO}).`,
            { host: hostname, cert_issuer: cert.issuer }
        );
    } catch (err) {
        if (/timeout|ECONNREFUSED|ECONNRESET/i.test(err.message + (err.code || ''))) {
            return warn(`Passthrough test for ${hostname} inconclusive: ${err.message}`, { host: hostname });
        }
        return fail(`Passthrough test failed for ${hostname}: ${err.message}`, { host: hostname });
    }
}

// ─── Check 7: AI domain interception tests ───────────────────────────────────

async function testInterception(hostname) {
    const proxyUp = await tcpConnect('127.0.0.1', PROXY_PORT, 1500);
    if (!proxyUp) {
        return skip(`Proxy not running — skipping interception test for ${hostname}.`);
    }

    try {
        const cert = await withTimeout(
            connectViaProxy('127.0.0.1', PROXY_PORT, hostname, 443, CHECK_TIMEOUT_MS),
            CHECK_TIMEOUT_MS,
            `interception ${hostname}`
        );

        if (!cert || !cert.subject) {
            return warn(`Could not retrieve TLS certificate for ${hostname} through proxy.`, { host: hostname });
        }

        const issuerCN = (cert.issuer && cert.issuer.CN) || '';
        const issuerO = (cert.issuer && cert.issuer.O) || '';

        if (/complyze/i.test(issuerCN) || /complyze/i.test(issuerO)) {
            return pass(
                `${hostname} is correctly intercepted by the Complyze proxy.`,
                { host: hostname, cert_issuer: cert.issuer }
            );
        }

        return fail(
            `${hostname} is NOT being intercepted — traffic passes through uninspected.`,
            {
                host: hostname,
                cert_issuer: cert.issuer,
                hint: 'Ensure this domain is in AI_DOMAINS and the proxy MITM logic covers it.',
            }
        );
    } catch (err) {
        if (/timeout|ECONNREFUSED|ECONNRESET/i.test(err.message + (err.code || ''))) {
            return warn(`Interception test for ${hostname} inconclusive: ${err.message}`, { host: hostname });
        }
        return fail(`Interception test failed for ${hostname}: ${err.message}`, { host: hostname });
    }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

async function runAllChecks() {
    const started = new Date().toISOString();
    const checks = [];

    async function run(name, fn) {
        const t0 = Date.now();
        let result;
        try {
            result = await fn();
        } catch (err) {
            result = fail(`Unexpected error: ${err.message}`, { stack: err.stack });
        }
        checks.push({ name, result, duration_ms: Date.now() - t0 });
    }

    await run('ca_cert_file', checkCACert);
    await run('ca_cert_trust', checkCATrust);
    await run('proxy_running', checkProxyRunning);
    await run('proxy_settings', checkProxySettings);
    await run('vpn_detection', detectVPNAndProxy);

    for (const host of PASSTHROUGH_HOSTS) {
        await run(`passthrough_${host.replace(/\./g, '_')}`, () => testPassthrough(host));
    }
    for (const host of INTERCEPT_HOSTS) {
        await run(`interception_${host.replace(/\./g, '_')}`, () => testInterception(host));
    }

    const statuses = checks.map(c => c.result.status);
    const overall = statuses.includes('fail') ? 'fail'
        : statuses.includes('warn') ? 'warn'
            : 'pass';

    return {
        generated_at: started,
        proxy_port: PROXY_PORT,
        ca_cert_path: CA_CERT_PATH,
        platform: os.platform(),
        hostname: os.hostname(),
        overall,
        checks,
    };
}

// ─── Report I/O ───────────────────────────────────────────────────────────────

function writeReport(report) {
    try {
        fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
    } catch (err) {
        console.error(`[DIAGNOSE] Could not write report to ${REPORT_FILE}: ${err.message}`);
    }
}

// ─── Human-readable printer ───────────────────────────────────────────────────

const STATUS_ICON = { pass: '✅', warn: '⚠️ ', fail: '❌', skip: '⏭️ ' };

function printReport(report) {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║           Complyze Proxy — Diagnostics Report                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    console.log(`  Platform  : ${report.platform}`);
    console.log(`  Hostname  : ${report.hostname}`);
    console.log(`  Timestamp : ${report.generated_at}`);
    console.log(`  Report    : ${REPORT_FILE}`);
    console.log(`  Overall   : ${STATUS_ICON[report.overall] || '?'} ${report.overall.toUpperCase()}\n`);

    for (const { name, result, duration_ms } of report.checks) {
        const icon = STATUS_ICON[result.status] || '?';
        const label = name.padEnd(42);
        console.log(`  ${icon} ${label} (${duration_ms}ms)`);
        console.log(`       ${result.message}`);
        if (result.detail && result.detail.hint) {
            console.log(`       💡 ${result.detail.hint}`);
        }
    }

    console.log('');
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
    runAllChecks()
        .then(report => {
            writeReport(report);
            if (JSON_MODE) {
                console.log(JSON.stringify(report, null, 2));
            } else {
                printReport(report);
            }
            process.exit(report.overall === 'fail' ? 1 : 0);
        })
        .catch(err => {
            console.error('[DIAGNOSE] Fatal error:', err.message);
            process.exit(2);
        });
}

module.exports = { runAllChecks, writeReport };
