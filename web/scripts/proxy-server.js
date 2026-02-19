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
const WORKSPACE_ID = process.env.COMPLYZE_WORKSPACE || 'local-dev';
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

let MONITOR_MODE = process.env.MONITOR_MODE || 'observe'; // observe (default) or enforce
let desktopBypassEnabled = false;
let inspectAttachmentsEnabled = false; // NEW: Attachment Toggle
const TRACE_MODE = process.env.TRACE_MODE === 'true';

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
            desktopBypassEnabled = !!data.desktop_bypass;
            inspectAttachmentsEnabled = !!data.inspect_attachments;
            MONITOR_MODE = data.block_high_risk ? 'enforce' : 'observe';
        } else {
            console.warn(`[SETTINGS_SYNC] ⚠️ Fetch failed (${res.status}). Attachment inspection defaults to ${inspectAttachmentsEnabled}.`);
        }
    } catch (err) {
        console.warn(`[SETTINGS_SYNC] ⚠️ Connection error: ${err.message}. Attachment inspection disabled.`);
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

function shouldDeepInspect(hostname) {
    if (!hostname) return false;
    // Safety: never inspect loopback or local dashboard
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return false;
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
        const hostname = req.headers.host; // Host header from the intercepted request
        const reqPath = req.url;
        const method = req.method;
        const { processOutgoingPrompt } = require('./dlp/textInterceptor');

        // Helper to forward stream without inspection
        const pipeToUpstream = (initialBody = null) => {
            const fwdHeaders = { ...req.headers };
            delete fwdHeaders['proxy-connection'];
            delete fwdHeaders['connection'];
            delete fwdHeaders['keep-alive'];
            delete fwdHeaders['transfer-encoding'];

            const proxyReq = https.request({
                hostname,
                port: 443,
                path: reqPath,
                method,
                headers: fwdHeaders,
                rejectUnauthorized: true
            }, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                if (!res.headersSent) {
                    res.writeHead(502);
                    res.end('Bad Gateway');
                }
            });

            if (initialBody) {
                proxyReq.write(initialBody);
            }
            // If we haven't consumed the req stream yet, or have partial, we might need piping
            // But if we already buffered, we don't pipe req.
            // If we are here from "Large Body" check, we might want to pipe req.
            if (!initialBody && !req.readableEnded) {
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
                logToComplyze(`https://${hostname}${reqPath}`, method, req.headers, `[attachment: ${contentLength} bytes — skipped]`, null);
                pipeToUpstream();
                return;
            }

            // For small requests, buffer and inspect
            const chunks = [];
            let totalBytes = 0;

            req.on('data', chunk => {
                totalBytes += chunk.length;
                if (totalBytes > MAX_BODY_BYTES) {
                    // Safety break
                    req.destroy(new Error('Payload too large'));
                    return;
                }
                chunks.push(chunk);
            });

            req.on('end', async () => {
                try {
                    const bodyBuffer = Buffer.concat(chunks);
                    const bodyStr = bodyBuffer.toString('utf8'); 

                    // DLP Inspection
                    let dlpResult = null;
                    if (method === 'POST' && bodyBuffer.length > 0) {
                        try {
                            dlpResult = await withInspectionTimeout(processOutgoingPrompt(bodyStr, { appName: 'Web', destinationType: 'public_ai' }));
                        } catch (e) {
                            console.error(`[PROXY] Inspection failed (${e.code || 'ERROR'}): ${e.message}`);
                            if (!FAIL_OPEN) {
                                res.writeHead(503);
                                res.end('Inspection Failed - Blocking traffic for security');
                                return;
                            }
                            // Continue fail-open...
                        }
                    }

                    logToComplyze(`https://${hostname}${reqPath}`, method, req.headers, bodyStr.substring(0, 2000), dlpResult);

                    if (MONITOR_MODE === 'enforce' && dlpResult?.action === 'BLOCK') {
                        res.writeHead(403);
                        res.end('Blocked by Complyze Policy');
                        return;
                    }

                    // Forward after inspection
                    pipeToUpstream(bodyBuffer);
                } catch (err) {
                    console.error('[PROXY] Request processing error:', err.message);
                    if (!res.headersSent) {
                        res.writeHead(500);
                        res.end('Internal Proxy Error');
                    }
                }
            });

        } catch (err) {
            console.error('[MITM] Error:', err);
            res.writeHead(500);
            res.end();
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

            if (shouldDeepInspect(hostname)) {
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
