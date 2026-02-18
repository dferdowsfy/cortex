#!/usr/bin/env node
/**
 * Complyze AI Traffic Interceptor
 *
 * A transparent MITM proxy that intercepts HTTPS traffic to AI provider APIs,
 * logs requests through the Complyze monitoring API, and forwards to the real
 * destination. This allows organizations to monitor and govern AI usage across
 * desktop apps, browsers, and CLI tools.
 *
 * Usage:
 *   node scripts/proxy-server.js [--port 8080]
 *
 * First-time setup:
 *   1. Run this script (auto-generates CA certificate on first run)
 *   2. Trust CA: sudo security add-trusted-cert -d -r trustRoot \
 *        -k /Library/Keychains/System.keychain certs/ca-cert.pem
 *   3. macOS: System Settings → Wi-Fi → Details → Proxies
 *      → Enable "HTTPS Proxy" → 127.0.0.1 : 8080
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const CERTS_DIR = process.env.CERTS_DIR || path.join(__dirname, '..', 'certs');

// ─── Domain Configuration ────────────────────────────────────────────────────
//
// Architecture:
//   1. ALL AI domains are deep-inspected by default (full prompt visibility)
//   2. Infrastructure domains (Firebase auth, etc.) always pass through
//   3. Admin can enable "Desktop App Bypass" to allow cert-pinned apps
//      — when enabled, UI domains fall back to metadata-only logging
//
// This ensures maximum security posture by default while giving admins
// explicit control over the desktop app compatibility tradeoff.
// ─────────────────────────────────────────────────────────────────────────────

// ALL AI domains — deep inspection by default
const AI_DOMAINS = [
    // API backends
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
    // Web/app UI domains (also inspected — works in browsers)
    'chatgpt.com',
    'chat.openai.com',
    'ab.chatgpt.com',
    'cdn.oaistatic.com',
    'claude.ai',
];

// Domains that cert-pinned desktop apps use — only relevant when
// "Desktop App Bypass" is enabled by the admin. When bypass is ON,
// these switch from deep inspection to metadata-only passthrough.
const DESKTOP_APP_DOMAINS = [
    'chatgpt.com',
    'chat.openai.com',
    'ab.chatgpt.com',
    'cdn.oaistatic.com',
    'claude.ai',
    'ios.chat.openai.com',
    'ws.chatgpt.com',
];

// Infrastructure domains — ALWAYS transparent passthrough (never inspect)
// These handle auth, database, etc. and must never be MITM'd.
const PASSTHROUGH_DOMAINS = [
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firestore.googleapis.com',
    'www.googleapis.com',
    'apis.google.com',
    'accounts.google.com',
    'oauth2.googleapis.com',
];

const MONITOR_MODE_DEFAULT = 'observe';
let desktopBypassEnabled = false;
let blockHighRiskEnabled = false;
let userAttributionEnabled = process.env.USER_ATTRIBUTION_ENABLED === 'true';
let authenticatedUserId = process.env.FIREBASE_UID || null;

// ─── Fail-Open Configuration ─────────────────────────────────────────────────
// When FAIL_OPEN=true (default), any inspection error causes the proxy to
// bypass the scan and forward the original request unchanged. This guarantees
// traffic is never blocked due to internal errors.
// Set FAIL_OPEN=false to block traffic on inspection failure instead.
const FAIL_OPEN = process.env.FAIL_OPEN !== 'false'; // default: true

// Handle settings updates from main process
process.on('message', (msg) => {
    if (msg.type === 'settings-update') {
        const { settings } = msg;
        blockHighRiskEnabled = !!settings.blockHighRisk;
        desktopBypassEnabled = !!settings.desktopBypass;
        userAttributionEnabled = !!settings.userAttributionEnabled;
        authenticatedUserId = settings.uid || null;

        // Sync with local DLP policy engine
        updatePolicy({
            blockingEnabled: blockHighRiskEnabled,
            reuThreshold: settings.riskThreshold || 60
        });

        console.log(`[proxy-msg] Settings Updated: attribution=${userAttributionEnabled ? 'ON' : 'OFF'}, user=${authenticatedUserId ? 'auth' : 'none'}`);
        process.send({ type: 'settings-ack' });
    }
});

// PAC script content generator
function generatePAC() {
    const domains = [...AI_DOMAINS];
    const domainList = domains.map(d => `"${d}"`).join(', ');
    return `
function FindProxyForURL(url, host) {
    var aiDomains = [${domainList}];
    for (var i = 0; i < aiDomains.length; i++) {
        var d = aiDomains[i];
        if (host === d || host.endsWith('.' + d)) {
            return "PROXY 127.0.0.1:${PROXY_PORT}";
        }
    }
    return "DIRECT";
}
`.trim();
}

const { updatePolicy } = require('../dlp/policyEngine');

async function syncSettings() {
    try {
        const res = await fetch('http://localhost:3737/api/proxy/settings');
        if (res.ok) {
            const data = await res.json();
            desktopBypassEnabled = !!data.desktop_bypass;
            blockHighRiskEnabled = !!data.block_high_risk;
            userAttributionEnabled = !!data.user_attribution_enabled;

            // Sync with local DLP policy engine
            updatePolicy({
                blockingEnabled: blockHighRiskEnabled,
                reuThreshold: data.risk_threshold || 60
            });

            console.log(`[sync] Settings: bypass=${desktopBypassEnabled}, block=${blockHighRiskEnabled}, attribution=${userAttributionEnabled}`);
        }
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
        console.log('🔐 Loading existing CA certificate...');
        return {
            key: forge.pki.privateKeyFromPem(fs.readFileSync(keyPath, 'utf8')),
            cert: forge.pki.certificateFromPem(fs.readFileSync(certPath, 'utf8')),
        };
    }

    console.log('🔐 Generating new CA certificate...');
    fs.mkdirSync(CERTS_DIR, { recursive: true });

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(
        cert.validity.notBefore.getFullYear() + 10
    );

    const attrs = [
        { name: 'commonName', value: 'Complyze AI Proxy CA' },
        { name: 'organizationName', value: 'Complyze' },
        { name: 'countryName', value: 'US' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
        { name: 'basicConstraints', cA: true, critical: true },
        {
            name: 'keyUsage',
            keyCertSign: true,
            cRLSign: true,
            digitalSignature: true,
            critical: true,
        },
        { name: 'subjectKeyIdentifier' },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const certPem = forge.pki.certificateToPem(cert);

    fs.writeFileSync(keyPath, keyPem);
    fs.writeFileSync(certPath, certPem);

    console.log(`   ✅ CA cert: ${certPath}`);
    console.log(`   ✅ CA key:  ${keyPath}`);

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
    cert.validity.notAfter.setFullYear(
        cert.validity.notBefore.getFullYear() + 1
    );

    cert.setSubject([{ name: 'commonName', value: domain }]);
    cert.setIssuer(ca.cert.subject.attributes);
    cert.setExtensions([
        {
            name: 'subjectAltName',
            altNames: [
                { type: 2, value: domain },
                { type: 2, value: '*.' + domain },
            ],
        },
    ]);
    cert.sign(ca.key, forge.md.sha256.create());

    const result = {
        key: forge.pki.privateKeyToPem(keys.privateKey),
        cert: forge.pki.certificateToPem(cert),
    };
    certCache.set(domain, result);
    return result;
}

// ─── Complyze API Logging ────────────────────────────────────────────────────

let eventCount = 0;

async function logToComplyze(targetUrl, method, headers, body, dlpResult = null) {
    eventCount++;
    const n = eventCount;

    try {
        // Deterministic User ID logic
        let userId = 'ANON';
        if (userAttributionEnabled && authenticatedUserId) {
            // Hash the UID for security (never store email/name)
            userId = crypto.createHash('sha256').update(authenticatedUserId).digest('hex').substring(0, 16);
        }

        // Output Schema (Deterministic JSON)
        const payload = {
            incident_id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            application: extractAppName(headers, targetUrl),
            risk_score: dlpResult ? dlpResult.finalReu : 0,
            severity: mapRiskToSeverity(dlpResult ? dlpResult.finalReu : 0),
            violation_category: dlpResult && dlpResult.violations ? dlpResult.violations[0] : 'None',
            user_id: userId,
            blocked: blockHighRiskEnabled && dlpResult && dlpResult.action === 'BLOCK',

            // Raw data for optional audit (if Full Audit Mode is on, handled server-side)
            target_url: targetUrl,
            method,
            headers: sanitizeHeaders(headers),
            body: typeof body === 'string' ? body : JSON.stringify(body),
            log_only: true, // Legacy flag
            dlp: dlpResult
        };

        const res = await fetch(COMPLYZE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (res.ok) {
            const data = await res.json();
            const eid = data.event_id || data['X-Complyze-Event-Id'] || 'ok';
            console.log(`      ✅ Logged [${payload.user_id}] event #${n} (${eid})`);
        } else {
            console.log(`      ⚠️  Log failed #${n}: HTTP ${res.status}`);
        }
    } catch (e) {
        console.error(`      ❌ Log error #${n}: ${e.message}`);
    }
}

function extractAppName(headers, url) {
    const ua = headers['user-agent'] || '';
    if (ua.includes('ChatGPT')) return 'ChatGPT Desktop';
    if (ua.includes('Claude')) return 'Claude Desktop';
    return new URL(url).hostname;
}

function mapRiskToSeverity(score) {
    if (score >= 90) return 'Critical';
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
}

function sanitizeHeaders(headers) {
    const safe = { ...headers };
    // Strip auth tokens from stored logs
    delete safe['authorization'];
    delete safe['x-api-key'];
    return safe;
}

// Log metadata for cert-pinned domains (connection-level, no content)
async function logMetadata(hostname) {
    eventCount++;
    const n = eventCount;

    try {
        let userId = 'ANON';
        if (userAttributionEnabled && authenticatedUserId) {
            userId = crypto.createHash('sha256').update(authenticatedUserId).digest('hex').substring(0, 16);
        }

        const res = await fetch(COMPLYZE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                incident_id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                application: hostname,
                risk_score: 0,
                severity: 'Low',
                violation_category: 'None',
                user_id: userId,
                blocked: false,
                target_url: `https://${hostname}/`,
                method: 'CONNECT',
                headers: {},
                body: `[metadata-only: cert-pinned app connection to ${hostname}]`,
                log_only: true,
            }),
        });

        if (res.ok) {
            const data = await res.json();
            console.log(`      📊 Metadata logged [${userId}] #${n} (${data.event_id || 'ok'})`);
        }
    } catch {
        // Silent fail for metadata — non-critical
    }
}

// ─── Inspection Error Logger ─────────────────────────────────────────────────

/**
 * Emits a structured, machine-parseable error record for any inspection
 * failure. All fields are always present so downstream log aggregators can
 * index without schema mismatches.
 *
 * @param {object} opts
 * @param {string}        opts.request_id   - UUID for the in-flight request
 * @param {string}        opts.hostname     - Target hostname
 * @param {number|null}   opts.file_size    - Body/file size in bytes (null when N/A)
 * @param {Error}         opts.error        - The caught error
 * @param {number}        opts.inspection_ms - Elapsed time before the throw
 */
function logInspectionError({ request_id, hostname, file_size, error, inspection_ms }) {
    const entry = {
        event: 'inspection_error',
        timestamp: new Date().toISOString(),
        request_id,
        hostname,
        file_size: file_size != null ? file_size : null,
        error_message: error.message,
        error_stack: error.stack,
        inspection_ms,
        fail_open: FAIL_OPEN,
        action: FAIL_OPEN ? 'bypass' : 'block',
    };
    console.error(`[INSPECTION_ERROR] ${JSON.stringify(entry)}`);
}

// ─── HTTP Request Parser (from raw TLS stream) ──────────────────────────────

class HTTPRequestParser {
    constructor(onRequest) {
        this.onRequest = onRequest;
        this.buffer = Buffer.alloc(0);
        this.state = 'HEADERS';
        this.headers = {};
        this.rawHeaderStr = '';
        this.method = '';
        this.path = '';
        this.httpVersion = '';
        this.contentLength = 0;
        this.bodyBuffer = Buffer.alloc(0);
    }

    feed(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this._parse();
    }

    _parse() {
        if (this.state === 'HEADERS') {
            const idx = this.buffer.indexOf('\r\n\r\n');
            if (idx === -1) return; // Need more data

            this.rawHeaderStr = this.buffer.slice(0, idx).toString();
            const lines = this.rawHeaderStr.split('\r\n');

            // Parse request line: "POST /v1/chat/completions HTTP/1.1"
            const parts = lines[0].split(' ');
            this.method = parts[0];
            this.path = parts[1];
            this.httpVersion = parts[2] || 'HTTP/1.1';

            // Parse headers
            this.headers = {};
            for (let i = 1; i < lines.length; i++) {
                const colonIdx = lines[i].indexOf(':');
                if (colonIdx > 0) {
                    const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
                    const val = lines[i].substring(colonIdx + 1).trim();
                    this.headers[key] = val;
                }
            }

            this.contentLength = parseInt(this.headers['content-length'] || '0');
            this.buffer = this.buffer.slice(idx + 4);
            this.bodyBuffer = Buffer.alloc(0);
            this.state = 'BODY';
            this._parse();
        }

        if (this.state === 'BODY') {
            if (this.contentLength === 0) {
                this.onRequest(this.method, this.path, this.headers, '');
                this._reset();
                if (this.buffer.length > 0) this._parse();
                return;
            }

            this.bodyBuffer = Buffer.concat([this.bodyBuffer, this.buffer]);
            this.buffer = Buffer.alloc(0);

            if (this.bodyBuffer.length >= this.contentLength) {
                const body = this.bodyBuffer.slice(0, this.contentLength).toString();
                const remaining = this.bodyBuffer.slice(this.contentLength);
                this.onRequest(this.method, this.path, this.headers, body);
                this._reset();
                this.buffer = remaining;
                if (remaining.length > 0) this._parse();
            }
        }
    }

    _reset() {
        this.state = 'HEADERS';
        this.headers = {};
        this.rawHeaderStr = '';
        this.method = '';
        this.path = '';
        this.httpVersion = '';
        this.contentLength = 0;
        this.bodyBuffer = Buffer.alloc(0);
    }
}

// ─── Proxy Server ────────────────────────────────────────────────────────────

function startProxy() {
    const ca = ensureCA();
    let connCount = 0;

    const server = http.createServer((req, res) => {
        // Handle basic status check or local dashboard hits
        if (req.url === '/' || req.url === '/dashboard') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Complyze AI Proxy is running. Deployment Mode: ' + (blockHighRiskEnabled ? 'ENFORCE' : 'OBSERVE'));
            return;
        }

        // Serve PAC file for automatic proxy configuration
        if (req.url === '/proxy.pac') {
            res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig' });
            res.end(generatePAC());
            return;
        }

        try {
            // Handle plain HTTP proxy requests
            const target = new URL(req.url);

            if (isAIDomain(target.hostname)) {
                let body = '';
                req.on('data', (chunk) => (body += chunk.toString()));
                req.on('end', () => {
                    console.log(`\n📡 [HTTP] ${req.method} ${req.url}`);
                    logToComplyze(req.url, req.method, req.headers, body);

                    const proxyReq = http.request(
                        { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method: req.method, headers: req.headers },
                        (proxyRes) => {
                            res.writeHead(proxyRes.statusCode, proxyRes.headers);
                            proxyRes.pipe(res);
                        }
                    );
                    proxyReq.on('error', () => res.end());
                    if (body) proxyReq.write(body);
                    proxyReq.end();
                });
            } else {
                // Forward non-AI HTTP traffic
                const proxyReq = http.request(req.url, { method: req.method, headers: req.headers }, (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res);
                });
                proxyReq.on('error', () => res.end());
                req.pipe(proxyReq);
            }
        } catch (err) {
            console.error(`[proxy] invalid URL request: ${req.url}`, err.message);
            res.writeHead(400);
            res.end('Invalid Proxy Request');
        }
    });

    // Handle HTTPS CONNECT tunneling
    server.on('connect', (req, clientSocket, head) => {
        const [hostname, portStr] = req.url.split(':');
        const port = parseInt(portStr) || 443;
        connCount++;
        const id = connCount;

        if (isPassthroughDomain(hostname)) {
            // Infrastructure domains — always transparent, never inspect
            handleTunnel(hostname, port, clientSocket, head);
        } else if (shouldDeepInspect(hostname)) {
            // Deep inspection: MITM to read full prompt content
            console.log(`\n🔍 [#${id}] INTERCEPTING → ${hostname}:${port}`);
            handleMITM(hostname, port, clientSocket, head, ca, id);
        } else if (shouldLogMetadata(hostname)) {
            // Desktop bypass mode: metadata-only logging
            console.log(`\n📊 [#${id}] METADATA (desktop bypass) → ${hostname}:${port}`);
            logMetadata(hostname);
            handleTunnel(hostname, port, clientSocket, head);
        } else {
            // Transparent pass-through for non-AI domains
            handleTunnel(hostname, port, clientSocket, head);
        }
    });

    server.on('error', (err) => {
        console.error('Server error:', err.message);
    });

    // Sync desktop bypass setting on startup and every 30 seconds
    syncSettings();
    setInterval(syncSettings, 30000);

    server.listen(PROXY_PORT, '127.0.0.1', () => {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║           🛡️  Complyze AI Traffic Interceptor                 ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log(`║  Proxy:     127.0.0.1:${PROXY_PORT}                                    ║`);
        console.log(`║  PAC URL:   http://127.0.0.1:${PROXY_PORT}/proxy.pac                   ║`);
        console.log(`║  Dashboard: http://localhost:3737/dashboard                    ║`);
        console.log(`║  Mode:      ${(blockHighRiskEnabled ? 'ENFORCE' : 'OBSERVE').padEnd(46)}║`);
        console.log('║  Deep Inspection (all AI domains):                             ║');
        AI_DOMAINS.forEach((d) => {
            console.log(`║    🔍 ${d.padEnd(53)}║`);
        });
        console.log('║                                                                ║');
        console.log('║  Block Sensitive: ' + (blockHighRiskEnabled ? '🟢 ON ' : '🔴 OFF') + '                                   ║');
        console.log('║  Desktop App Bypass: ' + (desktopBypassEnabled ? '🟢 ON ' : '🔴 OFF') + '                                    ║');
        console.log('║  (Toggle in Settings → allows cert-pinned apps)               ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('Waiting for AI traffic... (press Ctrl+C to stop)\n');
    });
}

// Transparent TCP tunnel (for non-AI domains)
function handleTunnel(hostname, port, clientSocket, head) {
    const serverSocket = net.connect(port, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => serverSocket.destroy());
    clientSocket.on('close', () => serverSocket.destroy());
    serverSocket.on('close', () => clientSocket.destroy());
}

// MITM handler: decrypt, log, and forward AI traffic
function handleMITM(hostname, port, clientSocket, head, ca, connId) {
    // Tell the client the tunnel is ready
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    // Generate a domain-specific certificate signed by our CA
    const domainCert = getCertForDomain(hostname, ca);

    // Wrap the client connection in TLS (we act as the HTTPS "server")
    const tlsSocket = new tls.TLSSocket(clientSocket, {
        isServer: true,
        key: domainCert.key,
        cert: domainCert.cert,
    });

    // Link to local AI-DLP engine
    const { processOutgoingPrompt } = require('./dlp/textInterceptor');

    // Parse decrypted HTTP requests from the TLS stream
    const parser = new HTTPRequestParser(async (method, reqPath, headers, body) => {
        const targetUrl = `https://${hostname}${reqPath}`;
        const bodyLen = body ? body.length : 0;
        const request_id = crypto.randomUUID();
        const contentType = (headers['content-type'] || '').toLowerCase();
        const isMultipart = contentType.includes('multipart/form-data');

        // ─── 🛡️ LOCAL AI-DLP SCANNING ──────────────────────────────────────────
        let dlpResult = null;

        if (method === 'POST' && bodyLen > 0 && !isMultipart) {
            // ── Text Inspection ──
            const inspectionStart = Date.now();
            try {
                dlpResult = await processOutgoingPrompt(body, {
                    appName: 'Browser/Web',
                    destinationType: isAIDomain(hostname) ? 'public_ai' : 'unknown'
                });
                const inspectionMs = Date.now() - inspectionStart;
                console.log(`   🛡️  TEXT SCAN [${request_id}]: REU=${dlpResult.finalReu} | ${dlpResult.explanation} | ${inspectionMs}ms`);
            } catch (err) {
                const inspectionMs = Date.now() - inspectionStart;
                logInspectionError({ request_id, hostname, file_size: bodyLen, error: err, inspection_ms: inspectionMs });
                if (!FAIL_OPEN) {
                    try {
                        tlsSocket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nContent-Length: 52\r\n\r\nRequest blocked: inspection service unavailable.');
                        tlsSocket.end();
                    } catch { }
                    return;
                }
                // FAIL_OPEN=true: bypass inspection, forward original request unchanged
                dlpResult = null;
            }
        }

        if (method === 'POST' && bodyLen > 0 && isMultipart) {
            // ── Attachment Inspection ──
            // Multipart bodies carry file uploads. We scan the raw body text
            // for embedded sensitive patterns; file_size is logged for triage.
            const inspectionStart = Date.now();
            try {
                dlpResult = await processOutgoingPrompt(body, {
                    appName: 'Browser/Web',
                    destinationType: isAIDomain(hostname) ? 'public_ai' : 'unknown'
                });
                const inspectionMs = Date.now() - inspectionStart;
                console.log(`   📎 ATTACHMENT SCAN [${request_id}]: REU=${dlpResult.finalReu} | ${bodyLen} bytes | ${inspectionMs}ms`);
            } catch (err) {
                const inspectionMs = Date.now() - inspectionStart;
                logInspectionError({ request_id, hostname, file_size: bodyLen, error: err, inspection_ms: inspectionMs });
                if (!FAIL_OPEN) {
                    try {
                        tlsSocket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nContent-Length: 52\r\n\r\nRequest blocked: inspection service unavailable.');
                        tlsSocket.end();
                    } catch { }
                    return;
                }
                // FAIL_OPEN=true: bypass inspection, forward original request unchanged
                dlpResult = null;
            }
        }

        console.log(`   📨 [${request_id}] ${method} ${reqPath} (${bodyLen} bytes)`);

        // Log to Complyze asynchronously
        logToComplyze(targetUrl, method, headers, body || '', dlpResult);

        // ─── Policy Enforcement Layer ──────────────────────────────────────────
        const shouldBlock = dlpResult && dlpResult.action === 'BLOCK';

        // Only block if "block_high_risk" is toggled on in the dashboard
        if (blockHighRiskEnabled && shouldBlock) {
            console.log(`   🚫 Blocked by Local DLP Policy: ${targetUrl} (REU: ${dlpResult.finalReu})`);
            try {
                tlsSocket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: 48\r\n\r\nAccess blocked by local Complyze Security Policy.');
                tlsSocket.end();
            } catch { }
            return;
        }

        // Forward to the real AI server
        const fwdHeaders = { ...headers, host: hostname };
        delete fwdHeaders['proxy-connection'];

        const proxyReq = https.request(
            { hostname, port, path: reqPath, method, headers: fwdHeaders },
            (proxyRes) => {
                // Build raw HTTP response to send back through the TLS socket
                let head = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage || ''}\r\n`;
                const rh = proxyRes.rawHeaders;
                for (let i = 0; i < rh.length; i += 2) {
                    head += `${rh[i]}: ${rh[i + 1]}\r\n`;
                }
                head += '\r\n';

                const isChunked = proxyRes.headers['transfer-encoding'] === 'chunked';
                try {
                    tlsSocket.write(head);
                    proxyRes.on('data', (chunk) => {
                        if (!chunk || chunk.length === 0) return;
                        try {
                            if (isChunked) {
                                tlsSocket.write(chunk.length.toString(16) + '\r\n');
                                tlsSocket.write(chunk);
                                tlsSocket.write('\r\n');
                            } else {
                                tlsSocket.write(chunk);
                            }
                        } catch { }
                    });
                    proxyRes.on('end', () => {
                        if (isChunked) {
                            try { tlsSocket.write('0\r\n\r\n'); } catch { }
                        }
                        console.log(`   📬 ← ${proxyRes.statusCode} ${proxyRes.statusMessage || ''}`);
                    });
                } catch { }
            }
        );

        proxyReq.on('error', (err) => {
            console.error(`   ❌ Forward error: ${err.message}`);
            try {
                tlsSocket.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
            } catch { }
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
    });

    tlsSocket.on('data', (chunk) => parser.feed(chunk));

    tlsSocket.on('error', (err) => {
        if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
            console.error(`   ⚠️  [#${connId}] TLS: ${err.message}`);
        }
    });
}

// ─── Start ───────────────────────────────────────────────────────────────────
startProxy();
