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
const crypto = require('crypto');
const telemetry = require('./telemetry');

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
const WORKSPACE_ID = process.env.COMPLYZE_WORKSPACE || process.env.FIREBASE_UID || 'default';
const CERTS_DIR = path.join(__dirname, '..', 'certs');

// ─── Domain Configuration ────────────────────────────────────────────────────

// API-only domains — safe to MITM (no Cloudflare JS challenges, no HTTP/2 requirement)
const API_DOMAINS = [
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
];

// Web UI domains — protected by Cloudflare, MITM breaks HTTP/2 negotiation.
// These are tunneled transparently, with metadata-only logging.
const WEB_UI_DOMAINS = [
    'chatgpt.com',
    'chat.openai.com',
    'claude.ai',
    'perplexity.ai',
    'www.perplexity.ai',
    'ios.chat.openai.com',
    'ws.chatgpt.com',
];

// Combined list for quick "is this an AI domain?" checks
const AI_DOMAINS = [...API_DOMAINS, ...WEB_UI_DOMAINS];

// Domains that cert-pinned desktop apps use
const DESKTOP_APP_DOMAINS = [
    'chatgpt.com',
    'chat.openai.com',
    'claude.ai',
    'perplexity.ai',
    'www.perplexity.ai',
];

// Infrastructure domains — ALWAYS transparent passthrough (never inspect)
const PASSTHROUGH_DOMAINS = [
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firestore.googleapis.com',
    'firebaseio.com',
    'firebase.io',
    'googleapis.com',
    'www.googleapis.com',
    'apis.google.com',
    'accounts.google.com',
    'oauth2.googleapis.com',
    'gstatic.com',
    'www.google-analytics.com',
    'googletagmanager.com',
    'firebase.googleapis.com',
    'firebasestorage.googleapis.com',
    'cloudfirestore.googleapis.com',
    'firebaseapp.com',
    'firebase.com',
];

let proxyEnabled = true;
let MONITOR_MODE = process.env.MONITOR_MODE || 'observe'; // observe (default) or enforce
let enforcementMode = process.env.ENFORCEMENT_MODE || 'monitor'; // monitor | warn | redact | block
let desktopBypassEnabled = false;
let inspectAttachmentsEnabled = false;
let redactSensitiveEnabled = false;
const TRACE_MODE = process.env.TRACE_MODE === 'true';
const VALID_ENFORCEMENT_MODES = ['monitor', 'warn', 'redact', 'block'];

// ─── Fail-Open Configuration ─────────────────────────────────────────────────
// When FAIL_OPEN=true (default), any inspection error causes the proxy to
// bypass the scan and forward the original request unchanged. This guarantees
// traffic is never blocked due to internal errors.
// Set FAIL_OPEN=false to block traffic on inspection failure instead.
const FAIL_OPEN = process.env.FAIL_OPEN !== 'false'; // default: true

// ─── Memory & Size Guards ─────────────────────────────────────────────────────
// MAX_INSPECTION_SIZE_MB : attachments larger than this skip deep scanning.
//   Metadata is still logged and the request is forwarded unchanged.
// MAX_BODY_SIZE_MB       : requests whose Content-Length exceeds this are
//   rejected with 413 before any body is buffered (OOM prevention).
// INSPECTION_TIMEOUT_MS  : hard wall-clock limit for one inspection call.
// MAX_MEMORY_MB          : heap threshold that triggers a warning log.
const MAX_INSPECTION_SIZE_MB = parseFloat(process.env.MAX_INSPECTION_SIZE_MB || '15');
const MAX_INSPECTION_BYTES = MAX_INSPECTION_SIZE_MB * 1024 * 1024;
const MAX_BODY_SIZE_MB = parseFloat(process.env.MAX_BODY_SIZE_MB || '50');
const MAX_BODY_BYTES = MAX_BODY_SIZE_MB * 1024 * 1024;
const INSPECTION_TIMEOUT_MS = parseInt(process.env.INSPECTION_TIMEOUT_MS || '3000');
const MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB || '512');

async function syncSettings() {
    try {
        const res = await fetch(`http://localhost:3737/api/proxy/settings?workspaceId=${WORKSPACE_ID}`);
        if (res.ok) {
            const data = await res.json();
            proxyEnabled = data.proxy_enabled !== false;
            desktopBypassEnabled = !!data.desktop_bypass;
            inspectAttachmentsEnabled = !!data.inspect_attachments;
            redactSensitiveEnabled = !!data.redact_sensitive;

            // Read canonical enforcement_mode from settings (single source of truth)
            if (data.enforcement_mode && VALID_ENFORCEMENT_MODES.includes(data.enforcement_mode)) {
                enforcementMode = data.enforcement_mode;
            } else {
                // Legacy fallback: derive from boolean flags
                if (data.block_high_risk) {
                    enforcementMode = 'block';
                } else if (data.redact_sensitive) {
                    enforcementMode = 'redact';
                } else {
                    enforcementMode = 'monitor';
                }
            }

            // Keep legacy MONITOR_MODE in sync for telemetry/logging
            MONITOR_MODE = enforcementMode === 'block' ? 'enforce' : 'observe';
        } else {
            console.warn(`[SETTINGS_SYNC] ⚠️ Fetch failed (${res.status}). Enforcement mode defaults to ${enforcementMode}.`);
        }
    } catch (err) {
        console.warn(`[SETTINGS_SYNC] ⚠️ Connection error: ${err.message}. Enforcement defaults to ${enforcementMode}.`);
        inspectAttachmentsEnabled = false; // Fail-safe: OFF
    }
}

async function registerHeartbeat() {
    try {
        await fetch('http://localhost:3737/api/agent/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: 'local-proxy-server',
                hostname: require('os').hostname(),
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

/**
 * Determines if a hostname belongs to an AI service provider.
 */
function isAIDomain(hostname) {
    if (!hostname) return false;
    return AI_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
}

/**
 * Determines if a hostname is an API-only domain (safe to MITM).
 */
function isAPIDomain(hostname) {
    if (!hostname) return false;
    return API_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
}

/**
 * Determines if a hostname is a web UI domain (Cloudflare-protected, NOT safe to MITM).
 */
function isWebUIDomain(hostname) {
    if (!hostname) return false;
    return WEB_UI_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
}

function handleTunnel(hostname, port, clientSocket, head) {
    if (!hostname || Number.isNaN(port)) {
        if (TRACE_MODE) console.warn(`[TUNNEL] Invalid target '${hostname}:${port}' — closing socket fail-open.`);
        clientSocket.destroy();
        return;
    }

    if (TRACE_MODE) console.log(`[TUNNEL] Passing through: ${hostname}:${port}`);

    const serverSocket = net.connect(port, hostname, () => {
        if (clientSocket.destroyed) return serverSocket.destroy();
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.setTimeout(30000, () => serverSocket.destroy());
    clientSocket.setTimeout(30000, () => clientSocket.destroy());

    serverSocket.on('error', (err) => {
        if (TRACE_MODE) console.error(`[TUNNEL] Upstream error (${hostname}): ${err.message}`);
        clientSocket.destroy();
    });

    clientSocket.on('error', (err) => {
        serverSocket.destroy();
    });

    clientSocket.on('close', () => serverSocket.destroy());
    serverSocket.on('close', () => clientSocket.destroy());
}

function parseConnectTarget(rawUrl = '') {
    if (!rawUrl || typeof rawUrl !== 'string') return null;

    const trimmed = rawUrl.trim();
    const withoutBrackets = trimmed.startsWith('[') ? trimmed.slice(1) : trimmed;
    const clean = withoutBrackets.endsWith(']') ? withoutBrackets.slice(0, -1) : withoutBrackets;
    const idx = clean.lastIndexOf(':');

    if (idx === -1) {
        return { hostname: clean.toLowerCase(), port: 443 };
    }

    const hostname = clean.slice(0, idx).toLowerCase();
    const parsedPort = parseInt(clean.slice(idx + 1), 10);
    const port = Number.isFinite(parsedPort) ? parsedPort : 443;

    if (!hostname) return null;
    return { hostname, port };
}

function isPassthroughDomain(hostname) {
    if (!hostname) return false;
    return PASSTHROUGH_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

function isDesktopAppDomain(hostname) {
    if (!hostname) return false;
    return DESKTOP_APP_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

function isBrowserRequest(req) {
    if (!req || !req.headers) return false;
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    return ua.includes('mozilla/') || ua.includes('chrome/') || ua.includes('safari/') || ua.includes('edge/');
}

function shouldDeepInspect(hostname, req) {
    if (!hostname) return false;
    if (!proxyEnabled) return false; // Inactive mode: no deep inspection
    // Safety: never inspect loopback or local dashboard
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return false;
    if (isPassthroughDomain(hostname)) return false;
    // Only MITM pure API domains — web UI domains (chatgpt.com, claude.ai)
    // are Cloudflare-protected and break under HTTP/1.1 downgrade.
    if (!isAPIDomain(hostname)) return false;
    if (desktopBypassEnabled && isDesktopAppDomain(hostname) && !isBrowserRequest(req)) return false;
    return true;
}

function shouldLogMetadata(hostname, req) {
    if (!hostname) return false;
    // Web UI AI domains: transparent tunnel + metadata-only logging
    if (proxyEnabled && isWebUIDomain(hostname)) return true;
    // Log metadata for AI domains even if deep inspection is disabled (Passive Mode)
    if (!proxyEnabled && isAIDomain(hostname)) return true;
    if (desktopBypassEnabled && isDesktopAppDomain(hostname) && !isBrowserRequest(req)) return true;
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

async function logToComplyze(targetUrl, method, headers, body, dlpResult = null) {
    eventCount++;
    try {
        const payload = {
            target_url: targetUrl,
            method,
            headers: sanitizeHeaders(headers),
            body: typeof body === 'string' ? body : JSON.stringify(body),
            user_id: 'local-user',
            log_only: true,
            dlp: dlpResult
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

// Log metadata for cert-pinned domains (connection-level, no content)
async function logMetadata(hostname) {
    eventCount++;
    try {
        const payload = {
            target_url: `https://${hostname}/`,
            method: 'CONNECT',
            headers: {},
            body: `[metadata-only: connection to ${hostname}]`,
            user_id: 'local-user',
            log_only: true,
            dlp: null
        };
        await fetch(COMPLYZE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload,
                workspace_id: WORKSPACE_ID
            }),
        });
        console.log(`      📊 Metadata logged #${eventCount}`);
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

/**
 * Races an inspection promise against INSPECTION_TIMEOUT_MS.
 * Rejects with { code: 'INSPECTION_TIMEOUT' } if the scan does not finish
 * in time, ensuring a hung DLP engine cannot stall a request indefinitely.
 */
function withInspectionTimeout(promise) {
    const err = Object.assign(
        new Error(`Inspection timed out after ${INSPECTION_TIMEOUT_MS}ms`),
        { code: 'INSPECTION_TIMEOUT' }
    );
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(err), INSPECTION_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
}

/**
 * Logs a structured record when a body exceeds a size limit.
 *   reason 'body_too_large'        → Content-Length > MAX_BODY_BYTES   (→ 413)
 *   reason 'attachment_size_limit' → Content-Length > MAX_INSPECTION_BYTES (→ skip)
 */
function logOversizedBody({ request_id, hostname, content_length, reason }) {
    const limitBytes = reason === 'body_too_large' ? MAX_BODY_BYTES : MAX_INSPECTION_BYTES;
    const entry = {
        event: reason,
        timestamp: new Date().toISOString(),
        request_id,
        hostname,
        content_length,
        limit_bytes: limitBytes,
        limit_mb: (limitBytes / (1024 * 1024)).toFixed(1),
        action: reason === 'body_too_large' ? 'reject_413' : 'skip_inspection',
    };
    console.warn(`[SIZE_LIMIT] ${JSON.stringify(entry)}`);
}

/**
 * Polls heap usage every 5 s and emits a structured warning whenever it
 * exceeds MAX_MEMORY_MB. The interval is unref'd so it never prevents a
 * clean process exit.
 */
function startMemoryWatchdog() {
    setInterval(() => {
        const heapMB = process.memoryUsage().heapUsed / (1024 * 1024);
        if (heapMB > MAX_MEMORY_MB) {
            console.error(
                `[MEMORY_LIMIT] Heap ${heapMB.toFixed(1)}MB exceeds ${MAX_MEMORY_MB}MB threshold — ` +
                `inspect for buffered large bodies or restart the proxy process`
            );
        }
    }, 5000).unref();
}

// ─── HTTP Request Parser ───
//
// Three body-handling modes, chosen at header-parse time:
//
//   BODY      — content-length ≤ MAX_INSPECTION_BYTES (or non-multipart):
//               full body buffered, onRequest(method,path,hdrs,body) called once.
//
//   STREAMING — multipart body with content-length > MAX_INSPECTION_BYTES:
//               onLargeBody(method,path,hdrs,contentLength) called immediately;
//               must return a {write(buf), end()} sink. Body bytes piped to sink.
//
//   DRAINING  — content-length > MAX_BODY_BYTES:
//               onOversizedBody fires once (caller sends 413); body discarded.

class HTTPRequestParser {
    constructor(onRequest, onLargeBody = null, onOversizedBody = null) {
        this.onRequest = onRequest;
        this.onLargeBody = onLargeBody;
        this.onOversizedBody = onOversizedBody || (() => { });
        this.buffer = Buffer.alloc(0);
        this.state = 'HEADERS';
        this.headers = {};
        this.bodyBuffer = Buffer.alloc(0);
        this.method = '';
        this.path = '';
        this.contentLength = 0;
        this.streamSink = null;
        this.bytesStreamed = 0;
        this.drainRemaining = 0;
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
                    this.headers[lines[i].substring(0, colonIdx).trim().toLowerCase()] =
                        lines[i].substring(colonIdx + 1).trim();
                }
            }
            this.contentLength = parseInt(this.headers['content-length'] || '0');
            this.buffer = this.buffer.slice(idx + 4);

            // ── Size guards (evaluated once, at header-parse time) ───────────

            if (this.contentLength > MAX_BODY_BYTES) {
                this.state = 'DRAINING';
                this.drainRemaining = this.contentLength;
                this.onOversizedBody(this.method, this.path, this.headers, this.contentLength);
                this._advanceDrain();
                return;
            }

            const ct = (this.headers['content-type'] || '').toLowerCase();
            const isMultipart = ct.includes('multipart/form-data');

            if (this.contentLength > MAX_INSPECTION_BYTES && isMultipart && this.onLargeBody) {
                this.state = 'STREAMING';
                this.bytesStreamed = 0;
                this.streamSink = this.onLargeBody(
                    this.method, this.path, this.headers, this.contentLength
                );
                this._advanceStream();
                return;
            }

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
        if (this.state === 'STREAMING') { this._advanceStream(); }
        if (this.state === 'DRAINING') { this._advanceDrain(); }
    }
    _advanceStream() {
        if (!this.buffer.length) return;
        const needed = this.contentLength - this.bytesStreamed;
        if (this.buffer.length >= needed) {
            const bodyEnd = this.buffer.slice(0, needed);
            const overflow = this.buffer.slice(needed);
            this.bytesStreamed += bodyEnd.length;
            if (this.streamSink) { this.streamSink.write(bodyEnd); this.streamSink.end(); }
            this.streamSink = null;
            this._reset();
            this.buffer = overflow;
            if (overflow.length > 0) this._parse();
        } else {
            this.bytesStreamed += this.buffer.length;
            if (this.streamSink) this.streamSink.write(this.buffer);
            this.buffer = Buffer.alloc(0);
        }
    }
    _advanceDrain() {
        if (!this.buffer.length) return;
        if (this.buffer.length >= this.drainRemaining) {
            const overflow = this.buffer.slice(this.drainRemaining);
            this._reset();
            this.buffer = overflow;
            if (overflow.length > 0) this._parse();
        } else {
            this.drainRemaining -= this.buffer.length;
            this.buffer = Buffer.alloc(0);
        }
    }
    _reset() {
        this.state = 'HEADERS';
        this.headers = {};
        this.bodyBuffer = Buffer.alloc(0);
        this.method = '';
        this.path = '';
        this.contentLength = 0;
        this.streamSink = null;
        this.bytesStreamed = 0;
        this.drainRemaining = 0;
    }
}

// ─── Main Proxy ───

function startProxy() {
    const ca = ensureCA();
    const server = http.createServer((req, res) => {
        if (req.url === '/proxy/metrics') {
            const metrics = telemetry.getMetricsSnapshot(MONITOR_MODE);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(metrics, null, 2));
            return;
        }
        res.writeHead(200);
        res.end('Complyze AI Proxy is active.');
    });

    // Internal MITM Server for handling decrypted traffic
    const mitmServer = http.createServer(async (req, res) => {
        // Strip port from Host header (e.g. "chatgpt.com:443" → "chatgpt.com")
        const rawHost = req.headers.host || '';
        const hostname = rawHost.replace(/:\d+$/, '');
        const reqPath = req.url;
        const method = req.method;
        const { processOutgoingPrompt } = require('./dlp/textInterceptor');

        // Helper to forward to upstream — this MUST always succeed.
        // The proxy is an observer; it should never block traffic.
        const pipeToUpstream = (initialBody = null) => {
            const fwdHeaders = { ...req.headers };
            // Only strip proxy-specific hop-by-hop headers.
            // IMPORTANT: preserve accept-encoding, user-agent, cookie, and all
            // other headers so upstream servers (and Cloudflare) see a genuine
            // browser request.  The old code stripped accept-encoding which caused
            // Cloudflare to trigger JS challenges.
            delete fwdHeaders['proxy-connection'];

            // If we buffered a body, fix content-length to match what we're sending
            if (initialBody) {
                fwdHeaders['content-length'] = Buffer.byteLength(initialBody).toString();
                delete fwdHeaders['transfer-encoding'];
            }

            const proxyReq = https.request({
                hostname,
                port: 443,
                path: reqPath,
                method,
                headers: fwdHeaders,
                rejectUnauthorized: true,
                // No timeout — SSE streams from ChatGPT can last minutes
                timeout: 0,
            }, (proxyRes) => {
                const isSSE = (proxyRes.headers['content-type'] || '').includes('text/event-stream');

                // Pass the upstream response back exactly as-is (including any
                // content-encoding like gzip/br). The browser already advertised
                // those encodings so it knows how to decode them.
                res.writeHead(proxyRes.statusCode, proxyRes.headers);

                if (isSSE) {
                    // For SSE: flush headers immediately, forward each chunk without buffering
                    res.flushHeaders();
                    proxyRes.on('data', (chunk) => {
                        res.write(chunk);
                    });
                    proxyRes.on('end', () => {
                        res.end();
                    });
                    proxyRes.on('error', () => {
                        res.end();
                    });
                } else {
                    proxyRes.pipe(res);
                }
            });

            // Never let a forwarding error kill the proxy — just close the client
            proxyReq.on('error', (err) => {
                if (TRACE_MODE) console.error(`[PROXY_FWD] Upstream error to ${hostname}:`, err.message);
                if (!res.headersSent) {
                    res.writeHead(502);
                    res.end('Bad Gateway');
                } else {
                    res.end();
                }
            });

            if (initialBody) {
                proxyReq.end(initialBody);
            } else if (!req.readableEnded) {
                req.pipe(proxyReq);
            } else {
                proxyReq.end();
            }
        };

        try {
            // Check for large uploads (attachments)
            const contentLength = parseInt(req.headers['content-length'] || '0');
            const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');

            if (contentLength > MAX_INSPECTION_BYTES && isMultipart) {
                const request_id = crypto.randomUUID();
                console.log(`   📎 LARGE ATTACHMENT [${request_id}]: ${(contentLength / 1024 / 1024).toFixed(1)}MB > ${MAX_INSPECTION_SIZE_MB}MB — skipping inspection`);
                logToComplyze(`https://${hostname}${reqPath}`, method, req.headers, `[attachment: ${contentLength} bytes — skipped]`, null).catch(() => { });
                pipeToUpstream();
                return;
            }

            // For GET/HEAD/OPTIONS — no body to inspect, just pipe through and log
            if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
                logToComplyze(`https://${hostname}${reqPath}`, method, req.headers, '', null).catch(() => { });
                pipeToUpstream();
                return;
            }

            // For POST/PUT/PATCH with body — buffer, inspect, then forward.
            // IMPORTANT: Always forward the request, even if logging/inspection fails.
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
                const bodyBuffer = Buffer.concat(chunks);
                const bodyStr = bodyBuffer.toString();

                // ── 1. DETECTION: Run DLP inspection ──
                let dlpResult = null;
                try {
                    if (bodyBuffer.length > 0 && bodyBuffer.length < MAX_INSPECTION_BYTES) {
                        dlpResult = await withInspectionTimeout(processOutgoingPrompt(bodyStr, { appName: 'Web', destinationType: 'public_ai' }));
                    }
                } catch (e) {
                    // Fail-open: inspection failed, still forward the request
                    if (TRACE_MODE) console.warn(`[DLP] Inspection error (fail-open): ${e.message}`);
                }

                // ── 2. POLICY EVALUATION: Read active enforcement mode ──
                const activeMode = enforcementMode;
                const isSensitive = dlpResult && (dlpResult.action !== 'ALLOW');

                // ── 3. Structured enforcement log ──
                const enforcementLog = {
                    event: 'enforcement_decision',
                    timestamp: new Date().toISOString(),
                    hostname,
                    path: reqPath,
                    detection_result: dlpResult ? dlpResult.action : 'NO_INSPECTION',
                    detection_reason: dlpResult ? dlpResult.reason : null,
                    reu_score: dlpResult ? dlpResult.finalReu : null,
                    enforcement_mode: activeMode,
                    enforcement_action: null,
                };

                // Log event to intercept API (always, regardless of mode)
                logToComplyze(`https://${hostname}${reqPath}`, method, req.headers, bodyStr.substring(0, 2000), dlpResult);

                // ── 4. ENFORCEMENT: Apply action based on mode ──

                if (!isSensitive) {
                    enforcementLog.enforcement_action = 'allow';
                    console.log(`[ENFORCEMENT] ${JSON.stringify(enforcementLog)}`);
                    pipeToUpstream(bodyBuffer);
                    return;
                }

                switch (activeMode) {
                    case 'block': {
                        enforcementLog.enforcement_action = 'block';
                        console.log(`[ENFORCEMENT] ${JSON.stringify(enforcementLog)}`);
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            blocked: true,
                            reason: 'Request blocked by policy: sensitive content detected',
                            enforcement_mode: 'block',
                            detection: dlpResult ? dlpResult.reason : undefined,
                        }));
                        return;
                    }

                    case 'warn': {
                        enforcementLog.enforcement_action = 'warn';
                        console.log(`[ENFORCEMENT] ${JSON.stringify(enforcementLog)}`);
                        res.writeHead(299, {
                            'Content-Type': 'application/json',
                            'X-Complyze-Warning': 'true',
                            'X-Complyze-Enforcement': 'warn',
                        });
                        res.end(JSON.stringify({
                            warning: true,
                            reason: 'Sensitive content detected — review before proceeding',
                            enforcement_mode: 'warn',
                            override_allowed: true,
                        }));
                        return;
                    }

                    case 'redact': {
                        enforcementLog.enforcement_action = 'redact';
                        console.log(`[ENFORCEMENT] ${JSON.stringify(enforcementLog)}`);
                        let redactedBody = bodyStr;
                        try {
                            redactedBody = redactedBody.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[REDACTED_EMAIL]');
                            redactedBody = redactedBody.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[REDACTED_SSN]');
                            redactedBody = redactedBody.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED_CC]');
                            redactedBody = redactedBody.replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]');
                            redactedBody = redactedBody.replace(/\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g, '[REDACTED_IP]');
                        } catch { /* redaction failure falls through to original */ }
                        pipeToUpstream(Buffer.from(redactedBody, 'utf8'));
                        return;
                    }

                    case 'monitor':
                    default: {
                        enforcementLog.enforcement_action = 'monitor';
                        console.log(`[ENFORCEMENT] ${JSON.stringify(enforcementLog)}`);
                        pipeToUpstream(bodyBuffer);
                        return;
                    }
                }
            });

            req.on('error', (err) => {
                if (TRACE_MODE) console.error('[MITM] Request read error:', err.message);
                pipeToUpstream();
            });

        } catch (err) {
            console.error('[MITM] Error:', err);
            // Even on error, try to forward
            try { pipeToUpstream(); } catch { }
            if (!res.headersSent) {
                res.writeHead(500);
                res.end();
            }
        }
    });

    server.on('connect', (req, clientSocket, head) => {
        let hostname;
        let port;
        try {
            const target = parseConnectTarget(req.url);
            if (!target) {
                if (TRACE_MODE) console.warn(`[CONNECT] Failed to parse '${req.url}', defaulting to passthrough.`);
                const fallbackHost = (req.url || '').trim();
                if (fallbackHost) {
                    handleTunnel(fallbackHost, 443, clientSocket, head);
                } else {
                    clientSocket.destroy();
                }
                return;
            }

            hostname = target.hostname;
            port = target.port;

            if (shouldDeepInspect(hostname, req)) {
                console.log(JSON.stringify({ hostname, mode: "inspection", timestamp: new Date().toISOString() }));
                clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                const domainCert = getCertForDomain(hostname, ca);
                const tlsSocket = new tls.TLSSocket(clientSocket, { isServer: true, key: domainCert.key, cert: domainCert.cert });
                // No hard timeout — SSE streams from ChatGPT can last minutes
                tlsSocket.setTimeout(0);

                // Use internal MITM server to handle the decrypted traffic
                mitmServer.emit('connection', tlsSocket);

                tlsSocket.on('error', (err) => {
                    if (TRACE_MODE) console.error(`[TLS] Error: ${err.message}`);
                    handleTunnel(hostname, port, clientSocket, head);
                });
            } else if (shouldLogMetadata(hostname, req)) {
                // Web UI / Desktop bypass: transparent tunnel + metadata-only logging
                console.log(`[METADATA] Transparent tunnel for ${hostname}:${port}`);
                // Log the connection as metadata so it still appears in the dashboard
                logToComplyze(`https://${hostname}/`, 'CONNECT', {}, `[metadata-only: transparent tunnel to ${hostname}]`, null).catch(() => { });
                handleTunnel(hostname, port, clientSocket, head);
            } else {
                handleTunnel(hostname, port, clientSocket, head);
            }
        } catch (err) {
            console.error(`[CONNECT] Proxy error for ${hostname || req.url}:`, err.message);
            const fallback = parseConnectTarget(req.url);
            handleTunnel(fallback?.hostname || hostname, fallback?.port || port || 443, clientSocket, head);
        }
    });

    startMemoryWatchdog();

    syncSettings();
    registerHeartbeat();
    setInterval(syncSettings, 10000);
    setInterval(registerHeartbeat, 15000);
    server.listen(PROXY_PORT, '127.0.0.1', () => {
        telemetry.logStartup(PROXY_PORT, MONITOR_MODE);
        telemetry.startMetricsFlush(PROXY_PORT, () => MONITOR_MODE);
        console.log(`🚀 Proxy active on ${PROXY_PORT} | Mode: ${MONITOR_MODE}`);
        // Non-blocking startup diagnostics
        try {
            const { runAllChecks, writeReport } = require('./diagnose');
            runAllChecks().then(report => {
                writeReport(report);
                const failed = report.checks.filter(c => c.result.status === 'fail');
                if (failed.length > 0) {
                    console.warn(`[DIAGNOSE] ⚠️  ${failed.length} check(s) failed: ${failed.map(c => c.name).join(', ')} — see ${report.ca_cert_path.replace('ca-cert.pem', 'diagnostics-report.json')}`);
                } else {
                    console.log('[DIAGNOSE] ✅ All compatibility checks passed.');
                }
            }).catch(() => { });
        } catch { }
    });
}

process.on('uncaughtException', (err) => {
    if (TRACE_MODE) console.error('❌ Uncaught Exception:', err.stack);
});
process.on('unhandledRejection', (reason) => {
    if (TRACE_MODE) console.error('❌ Unhandled Rejection:', reason);
});

startProxy();
