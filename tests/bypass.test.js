'use strict';

/**
 * bypass.test.js
 * Attempts various proxy bypass techniques and validates that the proxy
 * still intercepts all traffic.
 */

const axios = require('axios');
const dns = require('dns').promises;
const crypto = require('crypto');
const { validateProxyLog } = require('../utils/proxyLogValidator');
const { mutatePayload } = require('../utils/payloadMutator');
require('dotenv').config();

const PROXY_HOST = process.env.PROXY_HOST || '127.0.0.1';
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10);

const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

const proxyUrl = `http://${PROXY_HOST}:${PROXY_PORT}`;
const httpsAgent = new HttpsProxyAgent(proxyUrl);
const httpAgent = new HttpProxyAgent(proxyUrl);

const SENTINEL_SSN = '123-45-6789';
const SENTINEL_KEY = 'sk-test-bypass-xyz';
const SENTINEL_CREDIT = '4111-1111-1111-1111';

const TARGET_DOMAIN = 'api.openai.com';

const results = [];

// -----------------------------------------------------------------------
// Bypass Attempt 1: Direct IP access (bypassing DNS-based domain filter)
// -----------------------------------------------------------------------
async function testDirectIPAccess() {
  const result = { test: 'Direct IP Access', passed: false, intercepted: false, failure_reason: null };

  try {
    console.log('  [1] Resolving IP for api.openai.com...');
    let resolvedIPs = [];
    try {
      const addresses = await dns.resolve4(TARGET_DOMAIN);
      resolvedIPs = addresses;
    } catch (_) {
      // Try Google DNS over HTTPS as fallback
      try {
        const dohResp = await axios.get(`https://dns.google/resolve?name=${TARGET_DOMAIN}&type=A`, {
          httpsAgent,
          httpAgent,
          timeout: 8000,
          validateStatus: () => true,
        });
        if (dohResp.data && dohResp.data.Answer) {
          resolvedIPs = dohResp.data.Answer.filter((a) => a.type === 1).map((a) => a.data);
        }
      } catch (_) {}
    }

    if (resolvedIPs.length === 0) {
      result.failure_reason = 'Could not resolve IP for test target';
      return result;
    }

    const targetIP = resolvedIPs[0];
    console.log(`    Using IP: ${targetIP}`);

    // Attempt direct IP connection through proxy with Host header set
    try {
      await axios.post(`https://${targetIP}/v1/chat/completions`, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: `SSN: ${SENTINEL_SSN} KEY: ${SENTINEL_KEY}` }],
        max_tokens: 5,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
          'Host': TARGET_DOMAIN,
        },
        httpsAgent,
        httpAgent,
        timeout: 10000,
        validateStatus: () => true,
      });
    } catch (_) { /* blocked is acceptable */ }

    const validation = await validateProxyLog({
      domain: targetIP,
      payloadSubstring: SENTINEL_SSN,
      withinSeconds: 20,
      bypassAttempt: 'direct-ip',
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted;
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || `Direct IP access to ${targetIP} was NOT intercepted`;
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

// -----------------------------------------------------------------------
// Bypass Attempt 2: Alternate DNS (Cloudflare 1.1.1.1, Google 8.8.8.8)
// -----------------------------------------------------------------------
async function testAlternateDNS() {
  const result = { test: 'Alternate DNS Resolution', passed: false, intercepted: false, failure_reason: null };

  try {
    console.log('  [2] Testing alternate DNS resolver...');

    // Use Cloudflare DNS over HTTPS
    let ipFromCF = null;
    try {
      const cfResp = await axios.get(`https://1.1.1.1/dns-query?name=${TARGET_DOMAIN}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        httpsAgent,
        httpAgent,
        timeout: 8000,
        validateStatus: () => true,
      });
      if (cfResp.data && cfResp.data.Answer) {
        const aRec = cfResp.data.Answer.find((a) => a.type === 1);
        if (aRec) ipFromCF = aRec.data;
      }
    } catch (_) {}

    if (!ipFromCF) {
      // Try Google DNS over HTTPS
      try {
        const googleResp = await axios.get(`https://8.8.8.8/resolve?name=${TARGET_DOMAIN}&type=A`, {
          httpsAgent,
          httpAgent,
          timeout: 8000,
          validateStatus: () => true,
        });
        if (googleResp.data && googleResp.data.Answer) {
          const aRec = googleResp.data.Answer.find((a) => a.type === 1);
          if (aRec) ipFromCF = aRec.data;
        }
      } catch (_) {}
    }

    console.log(`    Resolved via alternate DNS: ${ipFromCF || '(failed)'}`);

    // Make request using alternate-DNS-resolved IP
    if (ipFromCF) {
      try {
        await axios.post(`https://${ipFromCF}/v1/chat/completions`, {
          model: 'gpt-4',
          messages: [{ role: 'user', content: `SSN: ${SENTINEL_SSN} via alternate DNS` }],
          max_tokens: 5,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
            'Host': TARGET_DOMAIN,
          },
          httpsAgent,
          httpAgent,
          timeout: 10000,
          validateStatus: () => true,
        });
      } catch (_) {}
    }

    const validation = await validateProxyLog({
      domain: TARGET_DOMAIN,
      withinSeconds: 20,
      bypassAttempt: 'alternate-dns',
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted;
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || 'Alternate DNS bypass was NOT intercepted';
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

// -----------------------------------------------------------------------
// Bypass Attempt 3: Custom User-Agent strings
// -----------------------------------------------------------------------
async function testCustomUserAgent() {
  const result = { test: 'Custom User-Agent Bypass', passed: false, intercepted: false, failure_reason: null };

  const evasiveAgents = [
    'curl/7.88.1',
    'python-requests/2.31.0',
    'Go-http-client/2.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    '',  // empty user agent
    'internal-tool/1.0 (compliance-bypass)',
  ];

  try {
    console.log('  [3] Testing custom User-Agent bypass...');

    for (const ua of evasiveAgents) {
      try {
        await axios.post(`https://${TARGET_DOMAIN}/v1/chat/completions`, {
          model: 'gpt-4',
          messages: [{ role: 'user', content: `SSN: ${SENTINEL_SSN} UA test` }],
          max_tokens: 5,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
            'User-Agent': ua,
          },
          httpsAgent,
          httpAgent,
          timeout: 8000,
          validateStatus: () => true,
        });
      } catch (_) {}
    }

    const validation = await validateProxyLog({
      domain: TARGET_DOMAIN,
      payloadSubstring: SENTINEL_SSN,
      withinSeconds: 30,
      bypassAttempt: 'custom-user-agent',
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted;
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || 'Custom User-Agent request NOT intercepted';
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

// -----------------------------------------------------------------------
// Bypass Attempt 4: Base64-encoded payload
// -----------------------------------------------------------------------
async function testBase64Payload() {
  const result = { test: 'Base64 Encoded Payload', passed: false, intercepted: false, failure_reason: null };

  try {
    console.log('  [4] Testing base64-encoded payload...');
    const raw = `SSN: ${SENTINEL_SSN} CREDIT: ${SENTINEL_CREDIT} KEY: ${SENTINEL_KEY}`;
    const encoded = mutatePayload(raw, { base64Wrap: true });

    try {
      await axios.post(`https://${TARGET_DOMAIN}/v1/chat/completions`, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: encoded }],
        max_tokens: 5,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
        },
        httpsAgent,
        httpAgent,
        timeout: 8000,
        validateStatus: () => true,
      });
    } catch (_) {}

    const validation = await validateProxyLog({
      domain: TARGET_DOMAIN,
      withinSeconds: 20,
      bypassAttempt: 'base64',
      decodedPayloadSubstring: SENTINEL_SSN,
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted && (validation.payload_inspected || validation.redacted);
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || 'Base64-encoded PII was NOT detected after decoding';
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

// -----------------------------------------------------------------------
// Bypass Attempt 5: Unicode homoglyph substitution
// -----------------------------------------------------------------------
async function testUnicodeHomoglyphs() {
  const result = { test: 'Unicode Homoglyph Substitution', passed: false, intercepted: false, failure_reason: null };

  try {
    console.log('  [5] Testing Unicode homoglyph obfuscation...');
    const raw = `SSN: ${SENTINEL_SSN} CREDIT: ${SENTINEL_CREDIT}`;
    const obfuscated = mutatePayload(raw, { homoglyphs: true, unicodeObfuscate: true });

    console.log(`    Original:   ${raw}`);
    console.log(`    Obfuscated: ${obfuscated}`);

    try {
      await axios.post(`https://${TARGET_DOMAIN}/v1/chat/completions`, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: obfuscated }],
        max_tokens: 5,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
        },
        httpsAgent,
        httpAgent,
        timeout: 8000,
        validateStatus: () => true,
      });
    } catch (_) {}

    const validation = await validateProxyLog({
      domain: TARGET_DOMAIN,
      withinSeconds: 20,
      bypassAttempt: 'unicode-homoglyph',
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted;
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || 'Unicode homoglyph payload NOT intercepted';
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

// -----------------------------------------------------------------------
// Bypass Attempt 6: HTTP/2 direct request
// -----------------------------------------------------------------------
async function testHTTP2() {
  const result = { test: 'HTTP/2 Protocol', passed: false, intercepted: false, failure_reason: null };

  try {
    console.log('  [6] Testing HTTP/2 bypass...');

    // axios with http2 adapter
    try {
      const axiosHttp2 = require('axios');
      await axiosHttp2.post(`https://${TARGET_DOMAIN}/v1/chat/completions`, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: `SSN: ${SENTINEL_SSN} via HTTP2` }],
        max_tokens: 5,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
        },
        httpsAgent,
        httpAgent,
        timeout: 10000,
        validateStatus: () => true,
        // Force HTTP/2 by indicating preference
        maxVersion: 'TLSv1.3',
        minVersion: 'TLSv1.2',
      });
    } catch (_) {}

    const validation = await validateProxyLog({
      domain: TARGET_DOMAIN,
      payloadSubstring: SENTINEL_SSN,
      withinSeconds: 20,
      bypassAttempt: 'http2',
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted;
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || 'HTTP/2 traffic NOT intercepted by proxy';
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

// -----------------------------------------------------------------------
// Bypass Attempt 7: Zero-width character injection
// -----------------------------------------------------------------------
async function testZeroWidthChars() {
  const result = { test: 'Zero-Width Character Injection', passed: false, intercepted: false, failure_reason: null };

  try {
    console.log('  [7] Testing zero-width character injection...');
    const raw = `SSN: ${SENTINEL_SSN}`;
    const injected = mutatePayload(raw, { zeroWidthChars: true });

    try {
      await axios.post(`https://${TARGET_DOMAIN}/v1/chat/completions`, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: injected }],
        max_tokens: 5,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
        },
        httpsAgent,
        httpAgent,
        timeout: 8000,
        validateStatus: () => true,
      });
    } catch (_) {}

    const validation = await validateProxyLog({
      domain: TARGET_DOMAIN,
      withinSeconds: 20,
      bypassAttempt: 'zero-width',
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted && (validation.payload_inspected || validation.redacted);
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || 'Zero-width character obfuscation evaded detection';
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

// -----------------------------------------------------------------------
// Bypass Attempt 8: Chunked transfer encoding
// -----------------------------------------------------------------------
async function testChunkedTransfer() {
  const result = { test: 'Chunked Transfer Encoding', passed: false, intercepted: false, failure_reason: null };

  try {
    console.log('  [8] Testing chunked transfer encoding...');

    const http = require('http');
    const net = require('net');

    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: `SSN: ${SENTINEL_SSN}` }],
      max_tokens: 5,
    });

    // Send chunked HTTP request through the proxy
    await new Promise((resolve) => {
      const socket = net.createConnection(PROXY_PORT, PROXY_HOST, () => {
        // Send CONNECT tunnel request
        socket.write(
          `CONNECT ${TARGET_DOMAIN}:443 HTTP/1.1\r\n` +
          `Host: ${TARGET_DOMAIN}:443\r\n` +
          `\r\n`
        );
      });

      socket.once('data', () => {
        // After tunnel established, send chunked body
        const headers =
          `POST /v1/chat/completions HTTP/1.1\r\n` +
          `Host: ${TARGET_DOMAIN}\r\n` +
          `Content-Type: application/json\r\n` +
          `Authorization: Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}\r\n` +
          `Transfer-Encoding: chunked\r\n` +
          `\r\n`;

        socket.write(headers);

        // Send body in chunks
        const chunkSize = 16;
        for (let i = 0; i < body.length; i += chunkSize) {
          const chunk = body.substring(i, i + chunkSize);
          socket.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
        }
        socket.write('0\r\n\r\n');

        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 3000);
      });

      socket.on('error', () => resolve());
      setTimeout(() => { socket.destroy(); resolve(); }, 8000);
    });

    const validation = await validateProxyLog({
      domain: TARGET_DOMAIN,
      payloadSubstring: SENTINEL_SSN,
      withinSeconds: 20,
      bypassAttempt: 'chunked-transfer',
    });

    result.intercepted = validation.intercepted;
    result.passed = validation.intercepted;
    if (!result.passed) {
      result.failure_reason = validation.failure_reason || 'Chunked transfer encoding NOT detected by proxy';
    }
  } catch (err) {
    result.failure_reason = `Error: ${err.message}`;
  }

  return result;
}

async function run() {
  console.log('=== Bypass Attempt Tests ===');
  console.log(`Proxy: ${proxyUrl}\n`);
  console.log('Each bypass attempt SHOULD be intercepted. A PASS means the proxy blocked/logged it.\n');

  const bypasTests = [
    testDirectIPAccess,
    testAlternateDNS,
    testCustomUserAgent,
    testBase64Payload,
    testUnicodeHomoglyphs,
    testHTTP2,
    testZeroWidthChars,
    testChunkedTransfer,
  ];

  for (const test of bypasTests) {
    const r = await test();
    results.push(r);
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}: ${r.test}${r.failure_reason ? ' — ' + r.failure_reason : ''}\n`);
  }

  console.log('=== Summary ===');
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);
  console.log(`Bypass attempts intercepted: ${passed.length}/${results.length}`);

  if (failed.length > 0) {
    console.error('\nBypass techniques that evaded proxy:');
    failed.forEach((r) => console.error(`  - ${r.test}: ${r.failure_reason}`));
  }

  const fs = require('fs');
  const path = require('path');
  const reportDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `bypass-test-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  if (failed.length > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
