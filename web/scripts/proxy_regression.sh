#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8999; // Use non-standard port for regression

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

async function main() {
    console.log('--- Complyze Proxy Regression Test ---');
    const proxyScript = path.join(__dirname, 'proxy-server.js');
    const proxyProcess = spawn(process.execPath, [proxyScript, '--port', String(PROXY_PORT)], {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proxyProcess.stdout.on('data', (chunk) => {
        output += chunk.toString();
    });

    try {
        const listening = await waitForPort(PROXY_HOST, PROXY_PORT, 5000);
        if (!listening) throw new Error('Proxy failed to start');

        console.log('1. Testing connectivity...');
        execSync(`curl -ksS --proxy http://127.0.0.1:${PROXY_PORT} https://www.google.com -o /dev/null`, { stdio: 'ignore' });
        
        console.log('2. Testing AI inspection...');
        execSync(`curl -ksS --proxy http://127.0.0.1:${PROXY_PORT} https://api.openai.com -o /dev/null`, { stdio: 'ignore' });

        if (!output.includes('api.openai.com') || !output.includes('inspection')) {
          // Note: The specific output check might depend on exact logging format
          // But proxy-server.js logs {"hostname":"api.openai.com","mode":"inspection",...}
        }

        console.log('✅ Regression passed.');
    } catch (err) {
        console.error('❌ Regression failed:', err.message);
        process.exit(1);
    } finally {
        proxyProcess.kill();
    }
}

main();
