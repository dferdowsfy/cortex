#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8080;

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

function run(cmd) {
    execSync(cmd, { stdio: 'inherit' });
}

function runQuiet(cmd) {
    execSync(cmd, { stdio: 'ignore' });
}

async function main() {
    if (process.platform !== 'darwin') {
        console.log('⚠️ proxy:test requires macOS for networksetup validation. Skipping.');
        process.exit(0);
    }

    const proxyScript = path.join(__dirname, 'proxy-server.js');
    const proxyProcess = spawn(process.execPath, [proxyScript, '--port', String(PROXY_PORT)], {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proxyProcess.stdout.on('data', (chunk) => {
        const line = chunk.toString();
        output += line;
        process.stdout.write(`[proxy] ${line}`);
    });
    proxyProcess.stderr.on('data', (chunk) => process.stderr.write(`[proxy:error] ${chunk}`));

    try {
        const listening = await waitForPort(PROXY_HOST, PROXY_PORT, 10000);
        if (!listening) throw new Error('Proxy did not start listening on 127.0.0.1:8080');

        run('networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8080');
        run('networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8080');
        run('networksetup -setwebproxystate "Wi-Fi" on');
        run('networksetup -setsecurewebproxystate "Wi-Fi" on');

        runQuiet('curl -ksS --proxy http://127.0.0.1:8080 https://www.google.com -o /dev/null');
        runQuiet('curl -ksS --proxy http://127.0.0.1:8080 https://identitytoolkit.googleapis.com -o /dev/null');
        runQuiet('curl -ksS --proxy http://127.0.0.1:8080 https://chat.openai.com -o /dev/null');

        if (!output.includes('"hostname":"chat.openai.com","mode":"inspection"')) {
            throw new Error('chat.openai.com was not observed as inspected traffic');
        }

        console.log('✅ Proxy test passed: passthrough + inspection validated.');
    } finally {
        try { run('networksetup -setwebproxystate "Wi-Fi" off'); } catch { }
        try { run('networksetup -setsecurewebproxystate "Wi-Fi" off'); } catch { }
        proxyProcess.kill('SIGTERM');
    }
}

main().catch((err) => {
    console.error('❌ proxy:test failed:', err.message);
    process.exit(1);
});

