#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');

// ─── Test Configuration ───
const PROXY_PORT = 8089;
const MOCK_API_PORT = 8082; // Pretend to be api.openai.com
const MOCK_BACKEND_PORT = 3738; // Pretend to be complyze.co

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
        // 1. Establish TCP to proxy
        const proxySocket = require('net').connect(PROXY_PORT, '127.0.0.1', () => {
            // 2. Send HTTP CONNECT
            proxySocket.write('CONNECT api.openai.com:443 HTTP/1.1\r\nHost: api.openai.com:443\r\n\r\n');
        });

        proxySocket.on('data', (chunk) => {
            const str = chunk.toString();
            if (str.includes('200 Connection Established')) {
                // 3. Upgrade to TLS
                const tlsSocket = require('tls').connect({
                    socket: proxySocket,
                    rejectUnauthorized: false,
                    servername: 'api.openai.com'
                }, () => {
                    // 4. Send HTTPS payload
                    const reqStr = `POST /v1/chat/completions HTTP/1.1\r\nHost: api.openai.com\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(JSON.stringify({ prompt }))}\r\nConnection: close\r\n\r\n${JSON.stringify({ prompt })}`;
                    tlsSocket.write(reqStr);
                });

                let responseData = '';
                tlsSocket.on('data', (tlsChunk) => {
                    responseData += tlsChunk.toString();
                });
                tlsSocket.on('end', () => {
                    const [headersStr, bodyStr] = responseData.split('\r\n\r\n');
                    const statusLine = headersStr ? headersStr.split('\r\n')[0] : '';
                    const statusCode = statusLine ? parseInt(statusLine.split(' ')[1]) : -1;
                    resolve({ status: statusCode, body: bodyStr });
                });
                tlsSocket.on('error', (e) => resolve({ error: e.message }));
            } else if (str.startsWith('HTTP/1.1 5') || str.startsWith('HTTP/1.1 4')) {
                const statusCode = parseInt(str.split(' ')[1]);
                resolve({ status: statusCode, error: 'Proxy rejected connect' });
            }
        });

        proxySocket.on('error', (e) => resolve({ error: e.message }));
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
        stdio: 'inherit',
        env: {
            ...process.env,
            ENFORCEMENT_MODE: 'monitor',
            BLOCK_HIGH_RISK: 'false',
            COMPLYZE_API: `http://localhost:${MOCK_BACKEND_PORT}/api/proxy/intercept`,
            TEST_MOCK_API_PORT: MOCK_API_PORT.toString()
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
        stdio: 'inherit',
        env: {
            ...process.env,
            ENFORCEMENT_MODE: 'block',
            // Purposely leaving legacy BLOCK_HIGH_RISK undefined to prove ENFORCEMENT_MODE works
            COMPLYZE_API: `http://localhost:${MOCK_BACKEND_PORT}/api/proxy/intercept`,
            TEST_MOCK_API_PORT: MOCK_API_PORT.toString()
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
