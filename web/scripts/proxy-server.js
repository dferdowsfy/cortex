#!/usr/bin/env node
/**
 * Complyze AI Traffic Interceptor
 *
 * A transparent MITM proxy that intercepts HTTPS traffic to AI provider APIs,
 * logs requests through the Complyze monitoring API, and forwards to the real
 * destination. This allows organizations to monitor and govern AI usage across
 * desktop apps, browsers, and CLI tools.
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { spawn } = require('child_process');

let forge;
try {
    forge = require('node-forge');
} catch {
    console.error('❌ Missing dependency: node-forge');
    console.error('   Run: npm install node-forge');
    process.exit(1);
}

// ─── Configuration ───────────────────────────────────────────────────────────

const PROXY_PORT = parseInt(
    process.argv.find((_, i, a) => a[i - 1] === '--port') || '8080'
);
const COMPLYZE_API =
    process.env.COMPLYZE_API || 'http://localhost:3737/api/proxy/intercept';
const WORKSPACE_ID = process.env.COMPLYZE_WORKSPACE || 'local-dev';
const CERTS_DIR = path.join(__dirname, '..', 'certs');
const STRICT_PIN_MODE = String(process.env.STRICT_PIN_MODE || 'false').toLowerCase() === 'true';
const PROXY_STATE_FILE = path.join(__dirname, '..', 'proxy-state.json');
const WATCHDOG_MODE = process.argv.includes('--watchdog');
const CHILD_PROXY_MODE = process.argv.includes('--child-proxy');
const BETA_MODE = String(process.env.BETA_MODE || 'false').toLowerCase() === 'true';

// ─── Domain Configuration ────────────────────────────────────────────────────

// ALL AI domains — deep inspection by default
const AI_DOMAINS = [
    'api.openai.com',
    'api.anthropic.com',
    'api.cohere.com',
    'api.mistral.ai',
    'api.together.ai',
    'api.together.xyz',
    'openrouter.ai',
    'api.perplexity.ai',
    'api.groq.com',
    'api.fireworks.ai',
    'api.replicate.com',
    'generativelanguage.googleapis.com',
    'chatgpt.com',
    'chat.openai.com',
    'ab.chatgpt.com',
    'cdn.oaistatic.com',
    'claude.ai',
    'perplexity.ai',
    'www.perplexity.ai',
];

// Domains that cert-pinned desktop apps use
const DESKTOP_APP_DOMAINS = [
    'chatgpt.com',
    'chat.openai.com',
    'ab.chatgpt.com',
    'cdn.oaistatic.com',
    'claude.ai',
    'ios.chat.openai.com',
    'ws.chatgpt.com',
    'perplexity.ai',
    'www.perplexity.ai',
];

// Infrastructure domains — ALWAYS transparent passthrough (never inspect)
const PASSTHROUGH_DOMAINS = [
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firestore.googleapis.com',
    'www.googleapis.com',
    'apis.google.com',
    'accounts.google.com',
    'oauth2.googleapis.com',
];

let MONITOR_MODE = process.env.MONITOR_MODE || 'observe'; // observe (default) or enforce
if (BETA_MODE) MONITOR_MODE = 'observe';
let desktopBypassEnabled = false;
let inspectAttachmentsEnabled = true; // inspect multipart/form-data uploads by default

const INSPECTION_WARNING_MS = 300;
const LATENCY_WINDOW_SIZE = 100;

const certPinningState = new Map();

const proxyMetrics = {
    totalRequests: 0,
    totalInspectionWarnings: 0,
    recentLatenciesMs: [],
    rollingAverageLatencyMs: 0,
    lastRequest: null,
};


function looksLikePinningFailure(error) {
    const msg = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
    return [
        'alert certificate unknown',
        'unknown ca',
        'bad certificate',
        'certificate verify failed',
        'handshake failure',
        'socket hang up',
        'tlsv1 alert',
        'ecconnreset'
    ].some((token) => msg.includes(token));
}

function markHostAsPinned(hostname, reason = 'tls_handshake_failed') {
    if (!hostname) return;
    const current = certPinningState.get(hostname) || {
        hostname,
        mode: 'deep-inspect',
        detections: 0,
        metadataConnections: 0,
        bytesTransferred: 0,
        lastDetectedAt: null,
        lastMetadataAt: null,
        reason,
    };

    current.mode = STRICT_PIN_MODE ? 'deep-inspect' : 'metadata-only';
    current.reason = reason;
    current.detections += 1;
    current.lastDetectedAt = new Date().toISOString();
    certPinningState.set(hostname, current);

    if (STRICT_PIN_MODE) {
        console.warn(`[PINNING] Detected TLS pinning for ${hostname}, but STRICT_PIN_MODE=true so deep inspection remains enabled.`);
    } else {
        console.warn(`[PINNING] Detected TLS pinning for ${hostname}. Switching to metadata-only mode.`);
    }
}

function recordMetadataTraffic(hostname, bytesTransferred) {
    if (!hostname) return;
    const current = certPinningState.get(hostname) || {
        hostname,
        mode: 'metadata-only',
        detections: 0,
        metadataConnections: 0,
        bytesTransferred: 0,
        lastDetectedAt: null,
        lastMetadataAt: null,
        reason: 'metadata_only',
    };

    current.mode = current.mode || 'metadata-only';
    current.metadataConnections += 1;
    current.bytesTransferred += bytesTransferred;
    current.lastMetadataAt = new Date().toISOString();
    certPinningState.set(hostname, current);

    console.log(`[METADATA] hostname=${hostname} bytes=${bytesTransferred} frequency=${current.metadataConnections}`);
}

function createTransparentTunnel(clientSocket, head, hostname, port, trackMetadata = false) {
    const serverSocket = net.connect(port, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) {
            serverSocket.write(head);
        }

        let bytesUpstream = 0;
        let bytesDownstream = 0;

        if (trackMetadata) {
            clientSocket.on('data', (chunk) => { bytesUpstream += chunk.length; });
            serverSocket.on('data', (chunk) => { bytesDownstream += chunk.length; });
        }

        let finalized = false;
        const finalize = () => {
            if (!trackMetadata || finalized) return;
            finalized = true;
            const totalBytes = bytesUpstream + bytesDownstream;
            recordMetadataTraffic(hostname, totalBytes);
        };

        clientSocket.once('close', finalize);
        serverSocket.once('close', finalize);

        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', () => clientSocket.destroy());
}


function canManageSystemProxy() {
    return process.platform === 'darwin';
}

function listNetworkServices() {
    if (!canManageSystemProxy()) return [];
    try {
        const output = execSync('networksetup -listallnetworkservices', { encoding: 'utf8' });
        return output
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('An asterisk'));
    } catch {
        return [];
    }
}

function readSecureWebProxy(service) {
    try {
        const output = execSync(`networksetup -getsecurewebproxy "${service}"`, { encoding: 'utf8' });
        const enabled = /Enabled:\s+Yes/i.test(output);
        const hostMatch = output.match(/Server:\s+(.+)/i);
        const portMatch = output.match(/Port:\s+(\d+)/i);
        return {
            enabled,
            server: hostMatch ? hostMatch[1].trim() : '',
            port: portMatch ? Number(portMatch[1]) : 0,
        };
    } catch {
        return { enabled: false, server: '', port: 0 };
    }
}

function captureProxyState() {
    const services = listNetworkServices();
    return {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        proxyHost: '127.0.0.1',
        proxyPort: PROXY_PORT,
        services: services.map((name) => ({ name, secureWebProxy: readSecureWebProxy(name) })),
    };
}

function applyManagedProxySettings() {
    if (!canManageSystemProxy()) {
        console.warn('[PROXY-RECOVERY] System proxy management is only supported on macOS.');
        return;
    }
    const services = listNetworkServices();
    for (const service of services) {
        try {
            execSync(`networksetup -setsecurewebproxy "${service}" 127.0.0.1 ${PROXY_PORT}`);
            execSync(`networksetup -setsecurewebproxystate "${service}" on`);
        } catch (err) {
            console.warn(`[PROXY-RECOVERY] Failed to set proxy for ${service}: ${err.message}`);
        }
    }
}

function restoreProxyState(state, reason = 'shutdown') {
    if (!state || !canManageSystemProxy()) return;
    for (const service of state.services || []) {
        try {
            const cfg = service.secureWebProxy || { enabled: false, server: '', port: 0 };
            if (cfg.enabled && cfg.server && cfg.port) {
                execSync(`networksetup -setsecurewebproxy "${service.name}" ${cfg.server} ${cfg.port}`);
                execSync(`networksetup -setsecurewebproxystate "${service.name}" on`);
            } else {
                execSync(`networksetup -setsecurewebproxystate "${service.name}" off`);
            }
        } catch (err) {
            console.warn(`[PROXY-RECOVERY] Failed restoring proxy for ${service.name}: ${err.message}`);
        }
    }
    console.log(`[PROXY-RECOVERY] Restored system proxy settings (${reason}).`);
}

function persistProxyState(state) {
    try {
        fs.writeFileSync(PROXY_STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
        console.warn(`[PROXY-RECOVERY] Failed to persist state: ${err.message}`);
    }
}

function readPersistedProxyState() {
    try {
        if (!fs.existsSync(PROXY_STATE_FILE)) return null;
        return JSON.parse(fs.readFileSync(PROXY_STATE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

function clearPersistedProxyState() {
    try {
        if (fs.existsSync(PROXY_STATE_FILE)) fs.unlinkSync(PROXY_STATE_FILE);
    } catch { }
}

function repairOrphanedProxyStateOnStartup() {
    if (!canManageSystemProxy()) return;
    const persisted = readPersistedProxyState();
    if (!persisted || !Array.isArray(persisted.services)) return;

    let orphanDetected = false;
    for (const service of persisted.services) {
        const current = readSecureWebProxy(service.name);
        if (current.enabled && current.server === '127.0.0.1' && current.port === persisted.proxyPort) {
            orphanDetected = true;
            break;
        }
    }

    if (orphanDetected) {
        console.warn('[PROXY-RECOVERY] Detected orphaned local proxy settings. Auto-repairing network state.');
        restoreProxyState(persisted, 'startup-repair');
    }
    clearPersistedProxyState();
}

function updateRollingLatency(latencyMs) {
    proxyMetrics.recentLatenciesMs.push(latencyMs);
    if (proxyMetrics.recentLatenciesMs.length > LATENCY_WINDOW_SIZE) {
        proxyMetrics.recentLatenciesMs.shift();
    }
    const sum = proxyMetrics.recentLatenciesMs.reduce((acc, val) => acc + val, 0);
    proxyMetrics.rollingAverageLatencyMs = sum / proxyMetrics.recentLatenciesMs.length;
}

async function syncSettings() {
    try {
        const res = await fetch(`http://localhost:3737/api/proxy/settings?workspaceId=${WORKSPACE_ID}`);
        if (res.ok) {
            const data = await res.json();
            desktopBypassEnabled = !!data.desktop_bypass;
            MONITOR_MODE = BETA_MODE ? 'observe' : (data.block_high_risk ? 'enforce' : 'observe');
            if (typeof data.inspect_attachments === 'boolean') {
                inspectAttachmentsEnabled = data.inspect_attachments;
            }
        }
    } catch { }
}

async function registerHeartbeat() {
    try {
        await fetch('http://localhost:3737/api/agent/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: 'local-proxy-server',
                hostname: os.hostname(),
                os: 'macOS',
                version: '1.0.0-proxy',
                status: 'Healthy',
                workspace_id: WORKSPACE_ID,
                service_connectivity: true,
                traffic_routing: true,
                os_integration: true
            }),
        });
    } catch { }
}

function isAIDomain(hostname) {
    if (!hostname) return false;
    return AI_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

function isPassthroughDomain(hostname) {
    if (!hostname) return false;
    return PASSTHROUGH_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

function isDesktopAppDomain(hostname) {
    if (!hostname) return false;
    return DESKTOP_APP_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

function shouldDeepInspect(hostname) {
    if (!hostname) return false;
    if (isPassthroughDomain(hostname)) return false;
    if (!isAIDomain(hostname)) return false;

    const pinnedState = certPinningState.get(hostname);
    if (!STRICT_PIN_MODE && pinnedState?.mode === 'metadata-only') return false;

    if (desktopBypassEnabled && isDesktopAppDomain(hostname)) return false;
    return true;
}

function shouldLogMetadata(hostname) {
    if (!hostname) return false;
    if (desktopBypassEnabled && isDesktopAppDomain(hostname)) return true;
    return false;
}

// ─── Certificate Management ─────────────────────────────────────────────────

const certCache = new Map();

function ensureCA() {
    const keyPath = path.join(CERTS_DIR, 'ca-key.pem');
    const certPath = path.join(CERTS_DIR, 'ca-cert.pem');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
            key: forge.pki.privateKeyFromPem(fs.readFileSync(keyPath, 'utf8')),
            cert: forge.pki.certificateFromPem(fs.readFileSync(certPath, 'utf8')),
        };
    }

    fs.mkdirSync(CERTS_DIR, { recursive: true });
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [
        { name: 'commonName', value: 'Complyze AI Proxy CA' },
        { name: 'organizationName', value: 'Complyze' },
        { name: 'countryName', value: 'US' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
        { name: 'basicConstraints', cA: true, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
        { name: 'subjectKeyIdentifier' },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(keys.privateKey));
    fs.writeFileSync(certPath, forge.pki.certificateToPem(cert));

    return { key: keys.privateKey, cert };
}

function getCertForDomain(domain, ca) {
    if (certCache.has(domain)) return certCache.get(domain);
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = Date.now().toString(16);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: domain }]);
    cert.setIssuer(ca.cert.subject.attributes);
    cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: domain }, { type: 2, value: '*.' + domain }] }]);
    cert.sign(ca.key, forge.md.sha256.create());
    const result = { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) };
    certCache.set(domain, result);
    return result;
}

// ─── Complyze API Logging ────────────────────────────────────────────────────

let eventCount = 0;

async function logToComplyze(targetUrl, method, headers, body, dlpResult = null, attachmentResults = []) {
    eventCount++;
    try {
        const hasAttachments = attachmentResults.length > 0;
        const payload = {
            target_url: targetUrl,
            method,
            headers: sanitizeHeaders(headers),
            body: typeof body === 'string' ? body : '[binary]',
            user_id: 'local-user',
            log_only: true,
            dlp: dlpResult,
            is_attachment_upload: hasAttachments,
            attachments: hasAttachments ? attachmentResults.map(a => ({
                filename: a.filename,
                file_type: a.fileType,
                file_size: a.fileSize,
                detected_categories: a.detectedCategories,
                sensitivity_points: a.sensitivityPoints,
                is_bulk: a.isBulk
            })) : undefined
        };
        await fetch(COMPLYZE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload,
                workspace_id: WORKSPACE_ID
            }),
        });
    } catch (e) {
        console.error(`❌ Log error: ${e.message}`);
    }
}

function sanitizeHeaders(headers) {
    const safe = { ...headers };
    delete safe['authorization'];
    delete safe['x-api-key'];
    delete safe['cookie'];
    return safe;
}

// ─── Multipart Attachment Parser ─────────────────────────────────────────────

/**
 * Extracts the multipart boundary from a Content-Type header value.
 * e.g. "multipart/form-data; boundary=----WebKitFormBoundaryXYZ" -> "----WebKitFormBoundaryXYZ"
 */
function parseMultipartBoundary(contentType) {
    const match = contentType.match(/boundary=([^\s;]+)/i);
    return match ? match[1] : null;
}

/**
 * Parses a multipart/form-data body buffer and inspects any file parts
 * for sensitive content using the DLP attachment inspector.
 *
 * @param {Buffer} bodyBuffer - The raw multipart body
 * @param {string} contentType - The Content-Type header value
 * @returns {Promise<Array>} Array of attachment inspection results
 */
async function parseAndInspectMultipart(bodyBuffer, contentType) {
    const boundary = parseMultipartBoundary(contentType);
    if (!boundary) return [];

    const { inspectAttachmentBuffer } = require('./dlp/attachmentInspector');
    const results = [];
    const boundaryBuf = Buffer.from('--' + boundary);
    const closingBuf = Buffer.from('--' + boundary + '--');

    let searchStart = 0;

    while (searchStart < bodyBuffer.length) {
        // Find the next boundary marker
        const boundaryPos = bodyBuffer.indexOf(boundaryBuf, searchStart);
        if (boundaryPos === -1) break;

        // Check if this is the closing boundary
        const closingCheck = bodyBuffer.slice(boundaryPos, boundaryPos + closingBuf.length);
        if (closingCheck.equals(closingBuf)) break;

        const partStart = boundaryPos + boundaryBuf.length;

        // Skip \r\n after boundary
        const dataStart = partStart + (bodyBuffer[partStart] === 0x0d && bodyBuffer[partStart + 1] === 0x0a ? 2 : 0);

        // Find end of this part (next boundary)
        const nextBoundary = bodyBuffer.indexOf(boundaryBuf, dataStart);
        if (nextBoundary === -1) break;

        // Part data ends before \r\n before next boundary
        const partEnd = nextBoundary - 2; // strip trailing \r\n
        const partData = bodyBuffer.slice(dataStart, partEnd > dataStart ? partEnd : dataStart);

        // Find end of part headers
        const headerEnd = partData.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
            const partHeaderStr = partData.slice(0, headerEnd).toString();
            const partBody = partData.slice(headerEnd + 4);

            // Extract filename from Content-Disposition
            const filenameMatch = partHeaderStr.match(/Content-Disposition:[^\r\n]*filename="([^"]+)"/i);
            if (filenameMatch && partBody.length > 0) {
                const filename = filenameMatch[1];
                try {
                    console.log(`[DLP] Inspecting attachment: ${filename} (${partBody.length} bytes)`);
                    const result = await inspectAttachmentBuffer(partBody, filename);
                    results.push({ filename, ...result });
                    if (result.sensitivityPoints > 0) {
                        console.log(`[DLP] Attachment "${filename}" — ${result.sensitivityPoints} pts, categories: ${result.detectedCategories.join(', ')}`);
                    }
                } catch (err) {
                    console.error(`[DLP] Failed to inspect attachment "${filename}":`, err.message);
                }
            }
        }

        searchStart = nextBoundary;
    }

    return results;
}

// ─── HTTP Request Parser (binary-safe) ───────────────────────────────────────

/**
 * Parses raw HTTP/1.1 request bytes from a TLS socket stream.
 * Keeps the body as a Buffer (binary-safe) for multipart/binary uploads.
 * Calls onRequest(method, path, headers, bodyBuffer) when a full request is ready.
 */
class HTTPRequestParser {
    constructor(onRequest) {
        this.onRequest = onRequest;
        this.buffer = Buffer.alloc(0);
        this.state = 'HEADERS';
        this.headers = {};
        this.bodyBuffer = Buffer.alloc(0);
        this.method = '';
        this.path = '';
        this.contentLength = 0;
    }
    feed(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this._parse();
    }
    _parse() {
        if (this.state === 'HEADERS') {
            const idx = this.buffer.indexOf('\r\n\r\n');
            if (idx === -1) return;
            const lines = this.buffer.slice(0, idx).toString().split('\r\n');
            const parts = lines[0].split(' ');
            this.method = parts[0];
            this.path = parts[1];
            for (let i = 1; i < lines.length; i++) {
                const colonIdx = lines[i].indexOf(':');
                if (colonIdx > 0) {
                    this.headers[lines[i].substring(0, colonIdx).trim().toLowerCase()] = lines[i].substring(colonIdx + 1).trim();
                }
            }
            this.contentLength = parseInt(this.headers['content-length'] || '0');
            this.buffer = this.buffer.slice(idx + 4);
            this.state = 'BODY';
            this._parse();
        }
        if (this.state === 'BODY') {
            if (this.contentLength === 0) {
                // Pass empty buffer — onRequest handles the empty case
                this.onRequest(this.method, this.path, this.headers, Buffer.alloc(0));
                this._reset();
                if (this.buffer.length > 0) this._parse();
                return;
            }
            this.bodyBuffer = Buffer.concat([this.bodyBuffer, this.buffer]);
            this.buffer = Buffer.alloc(0);
            if (this.bodyBuffer.length >= this.contentLength) {
                const bodyBuf = this.bodyBuffer.slice(0, this.contentLength);
                const remaining = this.bodyBuffer.slice(this.contentLength);
                this.onRequest(this.method, this.path, this.headers, bodyBuf);
                this._reset();
                this.buffer = remaining;
                if (remaining.length > 0) this._parse();
            }
        }
    }
    _reset() { this.state = 'HEADERS'; this.headers = {}; this.bodyBuffer = Buffer.alloc(0); }
}

// ─── Main Proxy ───

function startProxy() {
    const ca = ensureCA();
    const originalProxyState = captureProxyState();
    applyManagedProxySettings();
    persistProxyState(originalProxyState);

    let shuttingDown = false;
    const gracefulShutdown = (reason) => {
        if (shuttingDown) return;
        shuttingDown = true;
        restoreProxyState(originalProxyState, reason);
        clearPersistedProxyState();
        process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('sigint'));
    process.on('SIGTERM', () => gracefulShutdown('sigterm'));
    process.on('uncaughtException', (err) => {
        console.error('[PROXY-RECOVERY] Uncaught exception:', err);
        restoreProxyState(originalProxyState, 'crash-uncaught-exception');
        clearPersistedProxyState();
        process.exit(1);
    });
    process.on('unhandledRejection', (err) => {
        console.error('[PROXY-RECOVERY] Unhandled rejection:', err);
        restoreProxyState(originalProxyState, 'crash-unhandled-rejection');
        clearPersistedProxyState();
        process.exit(1);
    });

    const server = http.createServer((req, res) => {
        if (req.url === '/proxy/metrics') {
            const response = {
                totalRequests: proxyMetrics.totalRequests,
                rollingAverageLatencyMs: Number(proxyMetrics.rollingAverageLatencyMs.toFixed(2)),
                inspectionWarningsOver300ms: proxyMetrics.totalInspectionWarnings,
                windowSize: proxyMetrics.recentLatenciesMs.length,
                lastRequest: proxyMetrics.lastRequest,
                strictPinMode: STRICT_PIN_MODE,
                betaMode: BETA_MODE,
                certPinningHosts: Array.from(certPinningState.values()),
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response, null, 2));
            return;
        }

        if (req.url === '/proxy.pac') {
            const domains = [...AI_DOMAINS, ...PASSTHROUGH_DOMAINS];
            const pacScript = `function FindProxyForURL(url, host) {
                if (isPlainHostName(host) || host === "127.0.0.1" || host === "localhost" || shExpMatch(host, "*.local")) return "DIRECT";
                var aiDomains = ${JSON.stringify(domains)};
                for (var i = 0; i < aiDomains.length; i++) {
                    if (host === aiDomains[i] || shExpMatch(host, "*." + aiDomains[i])) return "PROXY 127.0.0.1:8080";
                }
                return "DIRECT";
            }`;
            res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig' });
            res.end(pacScript);
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        const banner = BETA_MODE ? '\nMonitoring Mode Active' : '';
        res.end(`Complyze AI Proxy is active.${banner}`);
    });

    server.on('connect', (req, clientSocket, head) => {
        const [hostname, portStr] = req.url.split(':');
        const port = parseInt(portStr) || 443;
        if (shouldDeepInspect(hostname)) {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            const domainCert = getCertForDomain(hostname, ca);
            const tlsSocket = new tls.TLSSocket(clientSocket, { isServer: true, key: domainCert.key, cert: domainCert.cert });
            const { processOutgoingPrompt, processAttachmentUpload } = require('./dlp/textInterceptor');

            // bodyBuffer is now always a Buffer (binary-safe)
            const parser = new HTTPRequestParser(async (method, reqPath, headers, bodyBuffer) => {
                const requestStart = Date.now();
                const contentType = headers['content-type'] || '';
                const isMultipart = contentType.includes('multipart/form-data');
                let dlpResult = null;
                let attachmentResults = [];
                let textInspectionMs = 0;
                let attachmentParsingMs = 0;

                if (method === 'POST' && bodyBuffer.length > 0) {
                    if (isMultipart && inspectAttachmentsEnabled) {
                        // ── Attachment Upload Path ──────────────────────────────
                        const attachmentParseStart = Date.now();
                        try {
                            attachmentResults = await parseAndInspectMultipart(bodyBuffer, contentType);
                        } catch (err) {
                            console.error('[DLP] Multipart parse error:', err.message);
                        }
                        attachmentParsingMs = Date.now() - attachmentParseStart;

                        if (attachmentResults.length > 0) {
                            const textInspectionStart = Date.now();
                            dlpResult = await processAttachmentUpload(attachmentResults, {
                                appName: hostname,
                                destinationType: 'public_ai'
                            });
                            textInspectionMs = Date.now() - textInspectionStart;
                        }
                    } else if (!isMultipart) {
                        // ── Text / JSON Prompt Path ─────────────────────────────
                        const bodyStr = bodyBuffer.toString('utf8');
                        const textInspectionStart = Date.now();
                        dlpResult = await processOutgoingPrompt(bodyStr, {
                            appName: 'Desktop/Web',
                            destinationType: 'public_ai'
                        });
                        textInspectionMs = Date.now() - textInspectionStart;
                    }
                }

                const inspectionLatencyMs = textInspectionMs + attachmentParsingMs;
                if (inspectionLatencyMs > INSPECTION_WARNING_MS) {
                    proxyMetrics.totalInspectionWarnings += 1;
                    console.warn(`[PERF] Inspection latency ${inspectionLatencyMs}ms exceeded ${INSPECTION_WARNING_MS}ms for ${method} https://${hostname}${reqPath}`);
                }

                // Log body: sanitize binary multipart as a placeholder string
                const logBody = isMultipart
                    ? `[multipart/form-data; ${attachmentResults.length} file(s)]`
                    : bodyBuffer.toString('utf8');

                logToComplyze(
                    `https://${hostname}${reqPath}`,
                    method,
                    headers,
                    logBody,
                    dlpResult,
                    attachmentResults
                );

                if (!BETA_MODE && MONITOR_MODE === 'enforce' && dlpResult?.action === 'BLOCK') {
                    const blockMsg = isMultipart
                        ? 'Blocked by Complyze Policy: Sensitive attachment detected'
                        : 'Blocked by Complyze Policy: Critical risk content detected';
                    tlsSocket.write(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: ${blockMsg.length}\r\n\r\n${blockMsg}`);
                    tlsSocket.end();
                    return;
                }

                const interceptToForwardMs = Date.now() - requestStart;
                proxyMetrics.totalRequests += 1;
                updateRollingLatency(interceptToForwardMs);
                proxyMetrics.lastRequest = {
                    timestamp: new Date().toISOString(),
                    target: `https://${hostname}${reqPath}`,
                    method,
                    interceptToForwardMs,
                    textInspectionMs,
                    attachmentParsingMs,
                    inspectionLatencyMs,
                };

                console.log(`[PERF] ${method} https://${hostname}${reqPath} | intercept→forward=${interceptToForwardMs}ms | textInspection=${textInspectionMs}ms | attachmentParsing=${attachmentParsingMs}ms | rollingAvg=${proxyMetrics.rollingAverageLatencyMs.toFixed(2)}ms`);

                const proxyReq = https.request({ hostname, port, path: reqPath, method, headers: { ...headers, host: hostname } }, (proxyRes) => {
                    tlsSocket.write(`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage || ''}\r\n`);
                    proxyRes.rawHeaders.forEach((v, i) => { if (i % 2 === 0) tlsSocket.write(`${v}: ${proxyRes.rawHeaders[i + 1]}\r\n`); });
                    tlsSocket.write('\r\n');
                    proxyRes.pipe(tlsSocket);
                });
                // Write the original buffer (preserves binary for multipart)
                proxyReq.write(bodyBuffer);
                proxyReq.end();
            });
            let handshakeFailureHandled = false;
            tlsSocket.on('data', (chunk) => parser.feed(chunk));
            tlsSocket.on('error', (err) => {
                if (!handshakeFailureHandled && looksLikePinningFailure(err)) {
                    handshakeFailureHandled = true;
                    markHostAsPinned(hostname, err.code || 'tls_handshake_failed');
                }
                tlsSocket.destroy();
            });
            clientSocket.on('error', (err) => {
                if (!handshakeFailureHandled && looksLikePinningFailure(err)) {
                    handshakeFailureHandled = true;
                    markHostAsPinned(hostname, err.code || 'client_tls_handshake_failed');
                }
            });
        } else {
            const pinnedState = certPinningState.get(hostname);
            const metadataOnly = shouldLogMetadata(hostname) || pinnedState?.mode === 'metadata-only';
            createTransparentTunnel(clientSocket, head, hostname, port, metadataOnly);
        }
    });

    syncSettings();
    registerHeartbeat();
    setInterval(syncSettings, 10000);
    setInterval(registerHeartbeat, 15000);
    server.listen(PROXY_PORT, '127.0.0.1', () => {
        console.log(`🚀 Proxy active on ${PROXY_PORT} | Mode: ${MONITOR_MODE}${BETA_MODE ? ' | Beta Mode' : ''}`);
        if (BETA_MODE) {
            console.log('📢 Monitoring Mode Active');
            console.log('📢 Beta Mode: inspection runs, policy enforcement disabled, events are log-only.');
        }
    });
}

function startWatchdog() {
    let shuttingDown = false;
    let child = null;

    const spawnChild = () => {
        if (shuttingDown) return;
        child = spawn(process.execPath, [__filename, '--child-proxy'], {
            stdio: 'inherit',
            env: process.env,
        });

        child.on('exit', (code, signal) => {
            if (shuttingDown) return;
            console.warn(`[WATCHDOG] Proxy exited (code=${code}, signal=${signal}). Restarting...`);
            setTimeout(spawnChild, 1000);
        });
    };

    const stop = () => {
        shuttingDown = true;
        if (child && !child.killed) child.kill('SIGTERM');
        process.exit(0);
    };

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    spawnChild();
}

repairOrphanedProxyStateOnStartup();
if (WATCHDOG_MODE || !CHILD_PROXY_MODE) {
    startWatchdog();
} else {
    startProxy();
}
