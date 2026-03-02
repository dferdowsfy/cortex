#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');

// ─── Test Configuration ───
const PROXY_PORT = 8080;
const MOCK_API_PORT = 8081; // Pretend to be api.openai.com
const MOCK_BACKEND_PORT = 3737; // Pretend to be complyze.co

let proxyProc;
const interceptedTelemetry = [];
const interceptedHeartbeats = [];
let upstreamHits = 0;

// ─── 1. Mock Upstream Provider (api.openai.com) ───
const mockApiServer = http.createServer((req, res) => {
    upstreamHits++;
    res.writeHead(200);
    res.end(JSON.stringify({ status: "success", mock_response: "I am an AI" }));
});

// ─── 2. Mock Complyze Backend (complyze.co) ───
const mockBackendServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            if (req.url.includes('/api/proxy/intercept')) {
                interceptedTelemetry.push(data);
            } else if (req.url.includes('/api/proxy/status')) {
                interceptedHeartbeats.push(data);
            }
        } catch (e) { }
        res.writeHead(200);
        res.end(JSON.stringify({ status: "ok" }));
    });
});

// ─── 3. Utility: Fire Traffic Through Proxy ───
async function curlThroughProxy(prompt) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1', // The upstream domain we are hitting via proxy
            port: MOCK_API_PORT,
            method: 'POST',
            path: '/v1/chat/completions',
            headers: {
                'Host': 'api.openai.com', // Spoof host so proxy thinks it's AI
                'Content-Type': 'application/json',
            },
            agent: new http.Agent({
                host: '127.0.0.1',
                port: PROXY_PORT
            })
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });

        req.on('error', (e) => resolve({ error: e.message }));
        req.write(JSON.stringify({ prompt }));
        req.end();
    });
}

// ─── 4. Run Tests ───
async function runTests() {
    console.log("🚀 Starting E2E Proxy Deterministic Tests...");

    // Start mocks
    mockApiServer.listen(MOCK_API_PORT);
    mockBackendServer.listen(MOCK_BACKEND_PORT);

    // Provide some time for servers to bind
    await new Promise(r => setTimeout(r, 500));

    // Boot the Proxy in MONITOR mode explicitly
    console.log("⚙️  Booting Proxy Server (Monitor Mode)...");
    proxyProc = spawn('node', ['scripts/proxy-server.js', '--port', PROXY_PORT.toString()], {
        env: {
            ...process.env,
            ENFORCEMENT_MODE: 'monitor',
            BLOCK_HIGH_RISK: 'false',
            COMPLYZE_API: `http://localhost:${MOCK_BACKEND_PORT}/api/proxy/intercept`
        }
    });

    await new Promise(r => setTimeout(r, 1500)); // Wait for proxy to bind

    // --- TEST 1: Monitor Logic ---
    console.log("🧪 TEST 1: Monitor mode tracking (High Risk Prompt)");
    const initialHits = upstreamHits;
    const res1 = await curlThroughProxy("My Social Security Number is 000-00-0000"); // High risk

    // Assert downstream got the traffic unharmed
    assert.strictEqual(res1.status, 200, "Monitor mode should never terminate the connection.");
    assert.strictEqual(upstreamHits, initialHits + 1, "Upstream API should have received the query.");

    // Allow a beat for async telemetry
    await new Promise(r => setTimeout(r, 500));

    // --- TEST 2: Telemetry Schema Validation ---
    console.log("🧪 TEST 2: Telemetry Pipeline Schema Validation");
    const lastLog = interceptedTelemetry[interceptedTelemetry.length - 1];
    assert.ok(lastLog, "Telemetry was not received by the mock backend.");
    assert.ok(lastLog.device_id, "Telemetry missing device_id");
    assert.ok(lastLog.user_id, "Telemetry missing user_id");
    assert.ok(lastLog.action_taken !== undefined, "Telemetry missing action_taken");
    // Depending on your actual code change payload:
    // assert.strictEqual(lastLog.action_taken, "MONITOR", "Action taken should explicitly state MONITOR");

    // --- TEST 3: Block Logic ---
    console.log("⚙️  Restarting Proxy Server (Block Mode)...");
    proxyProc.kill();
    proxyProc = spawn('node', ['scripts/proxy-server.js', '--port', PROXY_PORT.toString()], {
        env: {
            ...process.env,
            ENFORCEMENT_MODE: 'block',
            // Purposely leaving legacy BLOCK_HIGH_RISK undefined to prove ENFORCEMENT_MODE works
            COMPLYZE_API: `http://localhost:${MOCK_BACKEND_PORT}/api/proxy/intercept`
        }
    });

    await new Promise(r => setTimeout(r, 2000));

    console.log("🧪 TEST 3: Block mode tracking (High Risk Prompt)");
    const preBlockHits = upstreamHits;
    const res2 = await curlThroughProxy("My Social Security Number is 000-00-0000");

    // Assuming blocking drops the connection or returns an error block page
    assert.ok(res2.status !== 200 || res2.error, "Block mode must terminate or reject the connection.");
    assert.strictEqual(upstreamHits, preBlockHits, "Upstream API must NOT receive the blocked query.");

    console.log("✅ ALL TESTS PASSED.");
    process.exit(0);
}

runTests().catch(err => {
    console.error("❌ TEST FAILED:", err);
    if (proxyProc) proxyProc.kill();
    process.exit(1);
});
