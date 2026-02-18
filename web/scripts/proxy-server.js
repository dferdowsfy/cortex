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

async function syncSettings() {
    try {
        const res = await fetch('http://localhost:3737/api/proxy/settings');
        if (res.ok) {
            const data = await res.json();
            desktopBypassEnabled = !!data.desktop_bypass;
            MONITOR_MODE = data.block_high_risk ? 'enforce' : 'observe';
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
                workspace_id: 'local-dev',
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
            body: JSON.stringify(payload),
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

// ─── HTTP Request Parser ───

class HTTPRequestParser {
    constructor(onRequest) {
        this.onRequest = onRequest;
        this.buffer = Buffer.alloc(0);
        this.state = 'HEADERS';
        this.headers = {};
        this.bodyBuffer = Buffer.alloc(0);
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
            const { processOutgoingPrompt } = require('./dlp/textInterceptor');
            const parser = new HTTPRequestParser(async (method, reqPath, headers, body) => {
                let dlpResult = null;
                if (method === 'POST' && body.length > 0) {
                    dlpResult = await processOutgoingPrompt(body, { appName: 'Desktop/Web', destinationType: 'public_ai' });
                }
                logToComplyze(`https://${hostname}${reqPath}`, method, headers, body, dlpResult);
                if (MONITOR_MODE === 'enforce' && dlpResult?.action === 'BLOCK') {
                    tlsSocket.write('HTTP/1.1 403 Forbidden\r\n\r\nBlocked by Policy');
                    tlsSocket.end();
                    return;
                }
                const proxyReq = https.request({ hostname, port, path: reqPath, method, headers: { ...headers, host: hostname } }, (proxyRes) => {
                    tlsSocket.write(`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage || ''}\r\n`);
                    proxyRes.rawHeaders.forEach((v, i) => { if (i % 2 === 0) tlsSocket.write(`${v}: ${proxyRes.rawHeaders[i + 1]}\r\n`); });
                    tlsSocket.write('\r\n');
                    proxyRes.pipe(tlsSocket);
                });
                proxyReq.write(body);
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
