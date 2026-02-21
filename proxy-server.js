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
const _COMPLYZE_API_BASE =
    process.env.COMPLYZE_API || 'http://localhost:3737/api/proxy/intercept';
// WORKSPACE_ID and USER_ID for per-user data isolation.
// The desktop app injects FIREBASE_UID on launch.
// COMPLYZE_WORKSPACE can be set manually for shared/team workspaces.
// Falls back to 'default' so all unscoped data lands in one bucket.
const FIREBASE_UID = process.env.FIREBASE_UID || '';
const WORKSPACE_ID = process.env.COMPLYZE_WORKSPACE || FIREBASE_UID || 'default';
const PROXY_USER_ID = process.env.COMPLYZE_USER_ID || FIREBASE_UID || null;
// Append workspaceId so intercept endpoint stores events in the right user bucket
const COMPLYZE_API = _COMPLYZE_API_BASE + "?workspaceId=" + encodeURIComponent(WORKSPACE_ID);
const CERTS_DIR = path.join(__dirname, '..', 'certs');

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
    'claude.ai',
    'perplexity.ai',
    'www.perplexity.ai',
];

// Domains that cert-pinned desktop apps use
const DESKTOP_APP_DOMAINS = [
    'chatgpt.com',
    'chat.openai.com',
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

const MONITOR_MODE = 'observe'; // tracking-only, never enforce
const TRACE_MODE = process.env.TRACE_MODE === 'true';

// ─── Memory & Size Guards ─────────────────────────────────────────────────────
// MAX_INSPECTION_SIZE_MB : attachments larger than this skip deep scanning.
//   Metadata is still logged and the request is always forwarded unchanged.
// INSPECTION_TIMEOUT_MS  : hard wall-clock limit for one inspection call.
//   Timeout never blocks forwarding — the request is always sent upstream.
// MAX_MEMORY_MB          : heap threshold that triggers a warning log.
const MAX_INSPECTION_SIZE_MB = parseFloat(process.env.MAX_INSPECTION_SIZE_MB || '15');
const MAX_INSPECTION_BYTES = MAX_INSPECTION_SIZE_MB * 1024 * 1024;
const INSPECTION_TIMEOUT_MS = parseInt(process.env.INSPECTION_TIMEOUT_MS || '3000');
const MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB || '512');

// loadSettings — fetches settings fresh on every request call.
// Returns a plain object; never mutates module-level state.
// Falls back to safe defaults on any network or parse error.
async function loadSettings() {
    try {
        const res = await fetch(`http://localhost:3737/api/proxy/settings?workspaceId=${WORKSPACE_ID}`);
        if (res.ok) {
            const data = await res.json();
            return {
                desktopBypass: !!data.desktop_bypass,
                inspectAttachments: !!data.inspect_attachments,
            };
        }
    } catch { /* network unavailable — return safe defaults */ }
    return { desktopBypass: false, inspectAttachments: false };
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

// desktopBypass is passed in from fresh settings — no global is read.
function shouldDeepInspect(hostname, desktopBypass) {
    if (!hostname) return false;
    // Safety: never inspect loopback or local dashboard
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return false;
    if (isPassthroughDomain(hostname)) return false;
    if (!isAIDomain(hostname)) return false;
    if (desktopBypass && isDesktopAppDomain(hostname)) return false;
    return true;
}

function shouldLogMetadata(hostname, desktopBypass) {
    if (!hostname) return false;
    if (desktopBypass && isDesktopAppDomain(hostname)) return true;
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

// logToComplyze — ships the structured observability event to the Complyze API.
// eventData shape: { userId, timestamp, model_endpoint, riskScore, flags, requestSize, isSensitive }
async function logToComplyze(targetUrl, method, headers, body, eventData = null) {
    eventCount++;
    try {
        const userId = (eventData && eventData.userId) || PROXY_USER_ID || require('os').hostname();
        const payload = {
            target_url: targetUrl,
            method,
            headers: sanitizeHeaders(headers),
            body: typeof body === 'string' ? body : JSON.stringify(body),
            user_id: userId,
            log_only: true,
            // Structured observability fields
            risk_score: eventData ? eventData.riskScore : null,
            flags: eventData ? eventData.flags : [],
            is_sensitive: eventData ? eventData.isSensitive : false,
            request_size: eventData ? eventData.requestSize : null,
            model_endpoint: eventData ? eventData.model_endpoint : targetUrl,
        };
        await fetch(COMPLYZE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, workspace_id: WORKSPACE_ID }),
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

// ─── Observability Pipeline Helpers ──────────────────────────────────────────

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
 * proxyLog — emits a single ordered [PROXY] lifecycle line.
 * Every field is always present so log aggregators can index without schema gaps.
 */
function proxyLog(event, requestId, data = {}) {
    console.log(`[PROXY] ${event} ${JSON.stringify({ request_id: requestId, timestamp: new Date().toISOString(), ...data })}`);
}

/**
 * extractFlags — derives a deduped string[] of flag labels from the raw DLP result.
 * Maps the reason string and any detectedCategories array into a flat list.
 */
function extractFlags(raw) {
    if (!raw) return [];
    const seen = new Set();
    const flags = [];
    for (const val of [raw.reason, ...(raw.detectedCategories || [])]) {
        if (val && !seen.has(val)) { seen.add(val); flags.push(String(val)); }
    }
    return flags;
}

/**
 * computeRiskScore — maps a raw DLP result to a deterministic integer 0–100.
 * Uses finalReu (capped at 200 → score 100) when present.
 * Falls back to action-string buckets for scanners that don't emit REU.
 */
const ACTION_SCORES = { ALLOW: 0, WARN: 25, REDACT: 50, BLOCK: 100 };
function computeRiskScore(raw) {
    if (!raw) return 0;
    if (typeof raw.finalReu === 'number' && raw.finalReu >= 0) {
        return Math.min(100, Math.round((raw.finalReu / 200) * 100));
    }
    return ACTION_SCORES[raw.action] ?? 0;
}

/**
 * runDetection — runs DLP inspection and normalises the output to the pipeline schema:
 *   { isSensitive: boolean, flags: string[], riskScore: number }
 * Never throws; returns a zero-risk neutral result on any failure or timeout.
 */
async function runDetection(bodyStr) {
    const neutral = { isSensitive: false, flags: [], riskScore: 0 };
    try {
        const { processOutgoingPrompt } = require('./dlp/textInterceptor');
        const raw = await withInspectionTimeout(
            processOutgoingPrompt(bodyStr, { appName: 'Web', destinationType: 'public_ai' })
        );
        if (!raw) return neutral;
        return {
            isSensitive: raw.action !== 'ALLOW',
            flags: extractFlags(raw),
            riskScore: computeRiskScore(raw),
        };
    } catch {
        return neutral; // inspection errors never affect forwarding
    }
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
// Two body-handling modes, chosen at header-parse time:
//
//   BODY      — content-length ≤ MAX_INSPECTION_BYTES (or non-multipart):
//               full body buffered, onRequest(method,path,hdrs,body) called once.
//
//   STREAMING — multipart body with content-length > MAX_INSPECTION_BYTES:
//               onLargeBody(method,path,hdrs,contentLength) called immediately;
//               must return a {write(buf), end()} sink. Body bytes piped to sink.
//               Inspection is skipped; request is always forwarded unchanged.

class HTTPRequestParser {
    constructor(onRequest, onLargeBody = null) {
        this.onRequest = onRequest;
        this.onLargeBody = onLargeBody;
        this.buffer = Buffer.alloc(0);
        this.state = 'HEADERS';
        this.headers = {};
        this.bodyBuffer = Buffer.alloc(0);
        this.method = '';
        this.path = '';
        this.contentLength = 0;
        this.streamSink = null;
        this.bytesStreamed = 0;
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

            // ── Size guard (evaluated once, at header-parse time) ────────────
            // Bodies larger than MAX_INSPECTION_BYTES skip deep scanning but are
            // always forwarded; inspection is never a gate on forwarding.

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
    _reset() {
        this.state = 'HEADERS';
        this.headers = {};
        this.bodyBuffer = Buffer.alloc(0);
        this.method = '';
        this.path = '';
        this.contentLength = 0;
        this.streamSink = null;
        this.bytesStreamed = 0;
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

    // ─── Internal MITM Server ────────────────────────────────────────────────
    //
    // Every intercepted request follows this exact linear lifecycle:
    //
    //   1. [PROXY] request received   — log identity fields
    //   2. [PROXY] settings loaded    — fresh per-request settings fetch
    //   3. [PROXY] detection result   — DLP scan output (informational only)
    //   4. [PROXY] risk score computed — deterministic 0-100 score
    //   5. [PROXY] request forwarded  — original body sent to upstream
    //   6. [PROXY] response received  — upstream status code logged
    //
    // No branching between steps 1-6 affects whether the request is forwarded.
    // Detection may be skipped (large attachments, non-POST) but the pipeline
    // always completes and always forwards.

    const mitmServer = http.createServer(async (req, res) => {
        const requestId = crypto.randomUUID();
        const hostname = req.headers.host;
        const reqPath = req.url;
        const method = req.method;
        const userId = PROXY_USER_ID || require('os').hostname();

        // Helper: send body (or stream req directly) to upstream, invoke
        // onResponse(statusCode) the moment upstream response headers arrive.
        const forwardToUpstream = (bodyBuffer, onResponse) => {
            const fwdHeaders = { ...req.headers };
            delete fwdHeaders['proxy-connection'];
            delete fwdHeaders['connection'];
            delete fwdHeaders['keep-alive'];
            delete fwdHeaders['transfer-encoding'];

            const proxyReq = https.request(
                { hostname, port: 443, path: reqPath, method, headers: fwdHeaders, rejectUnauthorized: true, timeout: 30000 },
                (proxyRes) => {
                    onResponse(proxyRes.statusCode);
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res);
                }
            );

            proxyReq.on('error', (err) => {
                console.error(`[PROXY_FWD] Upstream error to ${hostname}:`, err.message);
                if (!res.headersSent) { res.writeHead(502); res.end('Bad Gateway'); }
            });
            proxyReq.on('timeout', () => {
                console.warn(`[PROXY_FWD] Upstream timeout to ${hostname}`);
                proxyReq.destroy();
                if (!res.headersSent) { res.writeHead(504); res.end('Gateway Timeout'); }
            });

            if (bodyBuffer) {
                proxyReq.write(bodyBuffer);
                proxyReq.end();
            } else if (!req.readableEnded) {
                req.pipe(proxyReq);
            } else {
                proxyReq.end();
            }
        };

        try {
            // ── STEP 1: request received ──────────────────────────────────────
            proxyLog('request received', requestId, { method, hostname, path: reqPath });

            // ── STEP 2: load settings fresh — no in-memory cache consulted ──
            const settings = await loadSettings();
            proxyLog('active settings', requestId, {
                desktop_bypass: settings.desktopBypass,
                inspect_attachments: settings.inspectAttachments,
            });

            // ── Buffer body ───────────────────────────────────────────────────
            // Large multipart uploads skip deep scanning but still go through
            // every remaining pipeline step and are always forwarded.
            const contentLength = parseInt(req.headers['content-length'] || '0');
            const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
            const oversized = contentLength > MAX_INSPECTION_BYTES && isMultipart;

            let bodyBuffer = null;
            if (!oversized) {
                const chunks = [];
                await new Promise(resolve => { req.on('data', c => chunks.push(c)); req.on('end', resolve); });
                bodyBuffer = Buffer.concat(chunks);
            }
            const requestSize = bodyBuffer ? bodyBuffer.length : contentLength;
            const bodyStr = bodyBuffer ? bodyBuffer.toString() : '';

            // ── STEP 3: detection result ──────────────────────────────────────
            // runDetection() always returns { isSensitive, flags, riskScore }.
            // It never throws and never gates forwarding.
            const canScan = method === 'POST' && bodyBuffer && bodyBuffer.length > 0;
            const detection = canScan
                ? await runDetection(bodyStr)
                : { isSensitive: false, flags: [], riskScore: 0 };

            proxyLog('detection result', requestId, {
                isSensitive: detection.isSensitive,
                flags: detection.flags,
                skipped: !canScan,
            });

            // ── STEP 4: risk score computed ───────────────────────────────────
            proxyLog('risk score computed', requestId, { riskScore: detection.riskScore });

            // Log structured event to Complyze API (fire-and-forget, never awaited
            // to keep the forward path synchronous).
            logToComplyze(
                `https://${hostname}${reqPath}`, method, req.headers,
                bodyStr.substring(0, 2000),
                {
                    userId,
                    timestamp: new Date().toISOString(),
                    model_endpoint: `https://${hostname}${reqPath}`,
                    riskScore: detection.riskScore,
                    flags: detection.flags,
                    requestSize,
                    isSensitive: detection.isSensitive,
                }
            );

            // ── STEP 5: request forwarded ─────────────────────────────────────
            proxyLog('request forwarded', requestId, { hostname, path: reqPath, requestSize });

            forwardToUpstream(bodyBuffer, (statusCode) => {
                // ── STEP 6: response received ─────────────────────────────────
                proxyLog('response received', requestId, { statusCode, hostname });
            });

        } catch (err) {
            console.error('[MITM] Error:', err);
            if (!res.headersSent) { res.writeHead(500); res.end(); }
        }
    });

    // CONNECT is made async so loadSettings() can be awaited per connection.
    // This eliminates the last global mutable variable (desktopBypassEnabled).
    server.on('connect', async (req, clientSocket, head) => {
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

            // Load settings fresh — no cached global is consulted.
            // On failure loadSettings() returns safe defaults (desktopBypass: false).
            const connectSettings = await loadSettings();

            if (shouldDeepInspect(hostname, connectSettings.desktopBypass)) {
                console.log(JSON.stringify({ hostname, mode: "inspection", timestamp: new Date().toISOString() }));
                clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                const domainCert = getCertForDomain(hostname, ca);
                const tlsSocket = new tls.TLSSocket(clientSocket, { isServer: true, key: domainCert.key, cert: domainCert.cert });
                tlsSocket.setTimeout(30000, () => tlsSocket.destroy());

                // Use internal MITM server to handle the decrypted traffic
                mitmServer.emit('connection', tlsSocket);

                tlsSocket.on('error', (err) => {
                    if (TRACE_MODE) console.error(`[TLS] Error: ${err.message}`);
                    handleTunnel(hostname, port, clientSocket, head);
                });
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

    registerHeartbeat();
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
