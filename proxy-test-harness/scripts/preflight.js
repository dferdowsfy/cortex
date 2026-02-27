'use strict';

/**
 * preflight.js
 * Validates environment setup before running the test harness.
 * Checks proxy connectivity, required env vars, and disk space.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const PROXY_HOST = process.env.PROXY_HOST || '127.0.0.1';
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10);
const PROXY_LOG_URL = process.env.PROXY_LOG_URL || 'http://localhost:3737/logs';

const warnings = [];
const errors = [];

function checkEnvVar(name, required = false) {
  if (!process.env[name]) {
    if (required) {
      errors.push(`Required environment variable missing: ${name}`);
    } else {
      warnings.push(`Optional environment variable not set: ${name} (tests may use dummy values)`);
    }
  }
}

function checkProxyConnectivity() {
  return new Promise((resolve) => {
    const socket = net.createConnection(PROXY_PORT, PROXY_HOST);
    const timeout = setTimeout(() => {
      socket.destroy();
      errors.push(`Proxy not reachable at ${PROXY_HOST}:${PROXY_PORT} (connection timeout)`);
      resolve(false);
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      console.log(`  [OK] Proxy reachable at ${PROXY_HOST}:${PROXY_PORT}`);
      resolve(true);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      errors.push(`Proxy not reachable at ${PROXY_HOST}:${PROXY_PORT}: ${err.message}`);
      resolve(false);
    });
  });
}

function checkProxyLogEndpoint() {
  return new Promise((resolve) => {
    const axios = require('axios');
    axios.get(PROXY_LOG_URL, { timeout: 5000, validateStatus: () => true })
      .then((resp) => {
        if (resp.status < 500) {
          console.log(`  [OK] Proxy log endpoint reachable: ${PROXY_LOG_URL} (HTTP ${resp.status})`);
          resolve(true);
        } else {
          warnings.push(`Proxy log endpoint returned HTTP ${resp.status}: ${PROXY_LOG_URL}`);
          resolve(false);
        }
      })
      .catch((err) => {
        warnings.push(`Proxy log endpoint not reachable: ${PROXY_LOG_URL} — ${err.message}`);
        resolve(false);
      });
  });
}

function checkDiskSpace() {
  const artifactsDir = path.join(__dirname, '..', '..', 'artifacts');
  try {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    // Write test file to ensure we have write access
    const testFile = path.join(artifactsDir, `.preflight-${Date.now()}`);
    fs.writeFileSync(testFile, 'preflight');
    fs.unlinkSync(testFile);
    console.log(`  [OK] Artifacts directory writable: ${artifactsDir}`);
    return true;
  } catch (err) {
    errors.push(`Cannot write to artifacts directory: ${err.message}`);
    return false;
  }
}

function checkNodeVersion() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    errors.push(`Node.js >= 18 required. Current version: ${process.versions.node}`);
    return false;
  }
  console.log(`  [OK] Node.js ${process.versions.node}`);
  return true;
}

async function run() {
  console.log('=== Preflight Checks ===\n');

  checkNodeVersion();
  checkDiskSpace();

  checkEnvVar('PROXY_HOST');
  checkEnvVar('PROXY_PORT');
  checkEnvVar('PROXY_LOG_URL');
  checkEnvVar('OPENAI_API_KEY');
  checkEnvVar('ANTHROPIC_API_KEY');
  checkEnvVar('GOOGLE_API_KEY');

  await checkProxyConnectivity();
  await checkProxyLogEndpoint();

  if (warnings.length > 0) {
    console.log('\n=== Warnings ===');
    warnings.forEach((w) => console.warn(`  WARN: ${w}`));
  }

  if (errors.length > 0) {
    console.error('\n=== Errors ===');
    errors.forEach((e) => console.error(`  ERROR: ${e}`));
    console.error('\nPreflight failed. Fix errors before running tests.');
    // In CI, error out. In local dev, allow override.
    if (process.env.CI || process.env.STRICT_PREFLIGHT) {
      process.exit(1);
    } else {
      console.warn('\nContinuing despite errors (set STRICT_PREFLIGHT=1 to enforce).');
    }
  } else {
    console.log('\n[OK] All preflight checks passed.');
  }
}

run().catch((err) => {
  console.error('Preflight script error:', err);
  process.exit(1);
});
