#!/usr/bin/env node
/**
 * Complyze AI Traffic Interceptor
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
    // Web/app UI domains
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
const FAIL_OPEN = true;
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
