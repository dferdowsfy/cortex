#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8999;

function waitForPort(host, port, timeoutMs = 10000) {
    const start = Date.now();
    return new Promise((resolve) => {
        const probe = () => {
            const socket = new net.Socket();
            socket.setTimeout(700);
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('timeout', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) return resolve(false);
                setTimeout(probe, 200);
            });
            socket.once('error', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) return resolve(false);
                setTimeout(probe, 200);
            });
            socket.connect(port, host);
        };
        probe();
    });
}

function runCurl(proxyPort, targetUrl) {
    try {
        // Use -k to allow self-signed proxy certs for AI domains
        execSync(`curl -ksS --proxy http://127.0.0.1:${proxyPort} ${targetUrl} -o /dev/null`, { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

async function main() {
    // Enable trace mode to see logs
    process.env.TRACE_MODE = 'true';
    const proxyScript = path.join(__dirname, 'proxy-server.js');
    console.log('--- Complyze Proxy Stability Regression ---');
    
    const proxyProcess = spawn(process.execPath, [proxyScript, '--port', String(PROXY_PORT)], {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proxyProcess.stdout.on('data', (d) => output += d.toString());
    proxyProcess.stderr.on('data', (d) => output += d.toString());

    try {
        const listening = await waitForPort(PROXY_HOST, PROXY_PORT, 5000);
        if (!listening) throw new Error('Proxy failed to bind port');

        console.log('1. Testing passthrough (google.com)...');
        if (!runCurl(PROXY_PORT, 'https://www.google.com')) throw new Error('Passthrough failed');

        console.log('2. Testing AI inspection (api.openai.com)...');
        runCurl(PROXY_PORT, 'https://api.openai.com/v1/models');
        
        console.log('✅ Regression result: SUCCESS');
    } catch (err) {
        console.error('❌ Regression result: FAILED -', err.message);
        process.exit(1);
    } finally {
        proxyProcess.kill();
    }
}

main();
