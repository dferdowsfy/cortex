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
let desktopBypassEnabled = false;
let inspectAttachmentsEnabled = true; // inspect multipart/form-data uploads by default

async function syncSettings() {
    try {
        const res = await fetch(`http://localhost:3737/api/proxy/settings?workspaceId=${WORKSPACE_ID}`);
        if (res.ok) {
            const data = await res.json();
            desktopBypassEnabled = !!data.desktop_bypass;
            MONITOR_MODE = data.block_high_risk ? 'enforce' : 'observe';
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
    const server = http.createServer((req, res) => {
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
        res.writeHead(200);
        res.end('Complyze AI Proxy is active.');
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
                const contentType = headers['content-type'] || '';
                const isMultipart = contentType.includes('multipart/form-data');
                let dlpResult = null;
                let attachmentResults = [];

                if (method === 'POST' && bodyBuffer.length > 0) {
                    if (isMultipart && inspectAttachmentsEnabled) {
                        // ── Attachment Upload Path ──────────────────────────────
                        try {
                            attachmentResults = await parseAndInspectMultipart(bodyBuffer, contentType);
                        } catch (err) {
                            console.error('[DLP] Multipart parse error:', err.message);
                        }
                        if (attachmentResults.length > 0) {
                            dlpResult = await processAttachmentUpload(attachmentResults, {
                                appName: hostname,
                                destinationType: 'public_ai'
                            });
                        }
                    } else if (!isMultipart) {
                        // ── Text / JSON Prompt Path ─────────────────────────────
                        const bodyStr = bodyBuffer.toString('utf8');
                        dlpResult = await processOutgoingPrompt(bodyStr, {
                            appName: 'Desktop/Web',
                            destinationType: 'public_ai'
                        });
                    }
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

                if (MONITOR_MODE === 'enforce' && dlpResult?.action === 'BLOCK') {
                    const blockMsg = isMultipart
                        ? 'Blocked by Complyze Policy: Sensitive attachment detected'
                        : 'Blocked by Complyze Policy: Critical risk content detected';
                    tlsSocket.write(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: ${blockMsg.length}\r\n\r\n${blockMsg}`);
                    tlsSocket.end();
                    return;
                }

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
            tlsSocket.on('data', (chunk) => parser.feed(chunk));
        } else {
            const serverSocket = net.connect(port, hostname, () => {
                clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                serverSocket.write(head);
                serverSocket.pipe(clientSocket);
                clientSocket.pipe(serverSocket);
            });
            serverSocket.on('error', () => clientSocket.destroy());
        }
    });

    syncSettings();
    registerHeartbeat();
    setInterval(syncSettings, 10000);
    setInterval(registerHeartbeat, 15000);
    server.listen(PROXY_PORT, '127.0.0.1', () => console.log(`🚀 Proxy active on ${PROXY_PORT} | Mode: ${MONITOR_MODE}`));
}

startProxy();
