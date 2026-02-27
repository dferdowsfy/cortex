'use strict';

/**
 * api.test.js
 * Validates proxy interception of direct LLM API traffic via axios + WebSocket.
 */

const axios = require('axios');
const WebSocket = require('ws');
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
const SENTINEL_CREDIT = '4111-1111-1111-1111';
const SENTINEL_KEY = 'sk-test-xyz-APITEST';

const API_ENDPOINTS = [
  {
    name: 'OpenAI Chat',
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy-key'}`,
    },
    body: {
      model: 'gpt-4',
      messages: [{ role: 'user', content: `SSN: ${SENTINEL_SSN} CC: ${SENTINEL_CREDIT} KEY: ${SENTINEL_KEY}` }],
      max_tokens: 5,
    },
  },
  {
    name: 'OpenAI Embeddings',
    url: 'https://api.openai.com/v1/embeddings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy-key'}`,
    },
    body: {
      model: 'text-embedding-3-small',
      input: `My SSN is ${SENTINEL_SSN} and credit card is ${SENTINEL_CREDIT}`,
    },
  },
  {
    name: 'Anthropic Messages',
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || 'sk-ant-test-dummy',
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: 'claude-3-haiku-20240307',
      max_tokens: 5,
      messages: [{ role: 'user', content: `SSN: ${SENTINEL_SSN} KEY: ${SENTINEL_KEY}` }],
    },
  },
  {
    name: 'Google Generative Language',
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GOOGLE_API_KEY || 'dummy-key'}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      contents: [{ parts: [{ text: `SSN: ${SENTINEL_SSN} CC: ${SENTINEL_CREDIT}` }] }],
    },
  },
];

const results = [];

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function testApiEndpoint(endpoint) {
  const result = {
    name: endpoint.name,
    url: endpoint.url,
    passed: false,
    intercepted: false,
    payload_inspected: false,
    redacted: false,
    failure_reason: null,
    payload_hash: hashPayload(endpoint.body),
  };

  console.log(`  Testing: ${endpoint.name}`);

  try {
    let response;
    try {
      response = await axios({
        method: endpoint.method,
        url: endpoint.url,
        headers: endpoint.headers,
        data: endpoint.body,
        httpsAgent,
        httpAgent,
        timeout: 15000,
        validateStatus: () => true, // Accept any HTTP status; we just need the request to transit proxy
      });
      console.log(`    HTTP ${response.status} from ${endpoint.name}`);
    } catch (reqErr) {
      // Even a connection refusal means the proxy potentially saw the traffic
      console.log(`    Request error (expected if proxy blocks): ${reqErr.message}`);
    }

    const domainHost = new URL(endpoint.url).hostname;
    const validation = await validateProxyLog({
      domain: domainHost,
      payloadSubstring: SENTINEL_SSN,
      withinSeconds: 30,
      payloadHash: result.payload_hash,
    });

    result.intercepted = validation.intercepted;
    result.payload_inspected = validation.payload_inspected;
    result.redacted = validation.redacted;

    if (!validation.intercepted) {
      result.failure_reason = validation.failure_reason || 'Proxy did not intercept API traffic';
    } else if (!validation.payload_inspected) {
      result.failure_reason = 'Request intercepted but payload not inspected';
    } else if (!validation.redacted) {
      result.failure_reason = 'Payload inspected but PII not redacted';
    } else {
      result.passed = true;
    }
  } catch (err) {
    result.failure_reason = `Unexpected error: ${err.message}`;
  }

  return result;
}

async function testWebSocket() {
  const result = {
    name: 'WebSocket API Test',
    url: `wss://${PROXY_HOST}:${PROXY_PORT}`,
    passed: false,
    intercepted: false,
    failure_reason: null,
  };

  console.log('  Testing WebSocket interception...');

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      result.failure_reason = 'WebSocket test timed out after 10s';
      resolve(result);
    }, 10000);

    try {
      // Attempt a WS connection through the proxy targeting a known LLM domain
      const ws = new WebSocket('wss://api.openai.com/v1/realtime', {
        agent: httpsAgent,
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy'}`,
          'OpenAI-Beta': 'realtime=v1',
        },
        rejectUnauthorized: false,
      });

      ws.on('open', async () => {
        const payload = JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: `SSN: ${SENTINEL_SSN} KEY: ${SENTINEL_KEY}` }],
          },
        });
        ws.send(payload);

        // Allow proxy to log
        await new Promise((r) => setTimeout(r, 2000));

        const validation = await validateProxyLog({
          domain: 'api.openai.com',
          payloadSubstring: SENTINEL_SSN,
          withinSeconds: 15,
          protocol: 'websocket',
        });

        result.intercepted = validation.intercepted;
        result.passed = validation.intercepted && validation.payload_inspected;
        if (!result.passed) {
          result.failure_reason = validation.failure_reason || 'WebSocket not intercepted or not inspected';
        }

        clearTimeout(timeout);
        ws.close();
        resolve(result);
      });

      ws.on('error', async (err) => {
        // Connection refused or blocked by proxy is still a valid intercept test
        console.log(`    WS error (may be proxy block): ${err.message}`);

        const validation = await validateProxyLog({
          domain: 'api.openai.com',
          payloadSubstring: 'CONNECT',
          withinSeconds: 10,
          protocol: 'websocket',
        });

        result.intercepted = validation.intercepted;
        result.passed = validation.intercepted;
        if (!result.passed) {
          result.failure_reason = `WebSocket connection error and no proxy log found: ${err.message}`;
        }

        clearTimeout(timeout);
        resolve(result);
      });
    } catch (err) {
      result.failure_reason = `WebSocket setup error: ${err.message}`;
      clearTimeout(timeout);
      resolve(result);
    }
  });
}

async function testMutatedPayloads() {
  const mutationResults = [];
  const basePayload = `SSN ${SENTINEL_SSN} CC ${SENTINEL_CREDIT} KEY ${SENTINEL_KEY}`;

  const mutations = [
    { label: 'base64', payload: mutatePayload(basePayload, { base64Wrap: true }) },
    { label: 'unicode', payload: mutatePayload(basePayload, { unicodeObfuscate: true }) },
    { label: 'homoglyphs', payload: mutatePayload(basePayload, { homoglyphs: true }) },
    { label: 'randomCase', payload: mutatePayload(basePayload, { randomCase: true }) },
    { label: 'zeroWidth', payload: mutatePayload(basePayload, { zeroWidthChars: true }) },
  ];

  console.log('\n  Testing mutated payload variants via API...');

  for (const mutation of mutations) {
    const mutResult = { label: mutation.label, passed: false, failure_reason: null };

    try {
      await axios({
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'sk-test-dummy-key'}`,
        },
        data: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: mutation.payload }],
          max_tokens: 5,
        },
        httpsAgent,
        httpAgent,
        timeout: 10000,
        validateStatus: () => true,
      });
    } catch (_) { /* proxy may block */ }

    const validation = await validateProxyLog({
      domain: 'api.openai.com',
      withinSeconds: 15,
      mutationType: mutation.label,
    });

    mutResult.intercepted = validation.intercepted;
    mutResult.passed = validation.intercepted && validation.payload_inspected;
    mutResult.failure_reason = mutResult.passed ? null : (validation.failure_reason || `Mutation '${mutation.label}' evaded detection`);
    mutationResults.push(mutResult);
    console.log(`    [${mutation.label}]: ${mutResult.passed ? 'PASS' : 'FAIL'}`);
  }

  return mutationResults;
}

async function run() {
  console.log('=== API Interception Test ===');
  console.log(`Proxy: ${proxyUrl}\n`);

  // Standard API tests
  for (const endpoint of API_ENDPOINTS) {
    const r = await testApiEndpoint(endpoint);
    results.push(r);
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}: ${r.name}${r.failure_reason ? ' — ' + r.failure_reason : ''}`);
  }

  // WebSocket test
  const wsResult = await testWebSocket();
  results.push(wsResult);
  console.log(`  ${wsResult.passed ? 'PASS' : 'FAIL'}: WebSocket${wsResult.failure_reason ? ' — ' + wsResult.failure_reason : ''}`);

  // Mutated payload tests
  const mutResults = await testMutatedPayloads();
  mutResults.forEach((r) => results.push({ ...r, name: `Mutated-${r.label}`, url: 'https://api.openai.com/v1/chat/completions' }));

  console.log('\n=== Summary ===');
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);
  console.log(`Passed: ${passed.length}/${results.length}`);

  if (failed.length > 0) {
    console.error('\nFailed:');
    failed.forEach((r) => console.error(`  - ${r.name}: ${r.failure_reason}`));
  }

  const fs = require('fs');
  const path = require('path');
  const reportDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `api-test-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  if (failed.length > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
