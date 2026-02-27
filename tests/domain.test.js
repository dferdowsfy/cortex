'use strict';

/**
 * domain.test.js
 * Validates proxy interception of major LLM web platforms via Playwright.
 */

const { chromium } = require('playwright');
const { validateProxyLog } = require('../utils/proxyLogValidator');
const { mutatePayload } = require('../utils/payloadMutator');
require('dotenv').config();

const LLM_DOMAINS = [
  { name: 'ChatGPT',      url: 'https://chat.openai.com',                inputSelector: '#prompt-textarea',      submitSelector: '[data-testid="send-button"]' },
  { name: 'Claude',       url: 'https://claude.ai',                      inputSelector: 'div[contenteditable="true"]', submitSelector: 'button[aria-label="Send message"]' },
  { name: 'Gemini',       url: 'https://gemini.google.com',              inputSelector: 'rich-textarea .ql-editor', submitSelector: 'button[aria-label="Send message"]' },
  { name: 'Perplexity',   url: 'https://perplexity.ai',                  inputSelector: 'textarea[placeholder]', submitSelector: 'button[aria-label="Submit"]' },
  { name: 'Grok',         url: 'https://grok.x.ai',                      inputSelector: 'textarea',              submitSelector: 'button[type="submit"]' },
  { name: 'Poe',          url: 'https://poe.com',                        inputSelector: 'textarea[class*="GrowingTextArea"]', submitSelector: 'button[class*="SendButton"]' },
  { name: 'OpenRouter',   url: 'https://openrouter.ai',                  inputSelector: 'textarea',              submitSelector: 'button[type="submit"]' },
];

const SENTINEL_PROMPT = 'SSN 123-45-6789 CREDIT 4111-1111-1111-1111 API_KEY sk-test-xyz';

const PROXY_HOST = process.env.PROXY_HOST || '127.0.0.1';
const PROXY_PORT = process.env.PROXY_PORT || '8080';

const results = [];

async function testDomain(domainConfig) {
  const { name, url, inputSelector, submitSelector } = domainConfig;
  const result = { domain: name, url, passed: false, failure_reason: null };

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: {
        server: `http://${PROXY_HOST}:${PROXY_PORT}`,
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
      ],
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    page.on('console', (msg) => {
      if (process.env.VERBOSE) console.log(`[${name}] console:`, msg.text());
    });

    page.on('response', (response) => {
      if (process.env.VERBOSE) {
        console.log(`[${name}] response: ${response.status()} ${response.url()}`);
      }
    });

    console.log(`[domain.test] Navigating to ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      result.failure_reason = `Navigation failed: ${navErr.message}`;
      return result;
    }

    // Wait for potential cookie banners / popups and dismiss
    try {
      const dismissSelectors = [
        'button[aria-label="Close"]',
        'button:has-text("Accept")',
        'button:has-text("Got it")',
        'button:has-text("I agree")',
        '[data-testid="cookie-policy-dialog-accept"]',
      ];
      for (const sel of dismissSelectors) {
        const el = await page.$(sel);
        if (el) {
          await el.click({ timeout: 3000 }).catch(() => {});
          break;
        }
      }
    } catch (_) { /* ignore */ }

    // Attempt to locate and fill the input
    let inputEl = null;
    try {
      inputEl = await page.waitForSelector(inputSelector, { timeout: 15000 });
    } catch (_) {
      result.failure_reason = `Input selector not found: ${inputSelector}`;
      return result;
    }

    const mutatedPayload = mutatePayload(SENTINEL_PROMPT, { base64Wrap: false, homoglyphs: false });
    await inputEl.fill(mutatedPayload);

    // Attempt submit
    try {
      const submitEl = await page.$(submitSelector);
      if (submitEl) {
        await submitEl.click({ timeout: 5000 });
      } else {
        await inputEl.press('Enter');
      }
    } catch (_) {
      await inputEl.press('Enter');
    }

    // Allow the network request to propagate
    await page.waitForTimeout(3000);

    // Validate proxy log
    const domainHost = new URL(url).hostname;
    const validation = await validateProxyLog({
      domain: domainHost,
      payloadSubstring: SENTINEL_PROMPT.substring(0, 20),
      withinSeconds: 30,
    });

    result.intercepted = validation.intercepted;
    result.payload_inspected = validation.payload_inspected;
    result.redacted = validation.redacted;

    if (!validation.intercepted) {
      result.failure_reason = validation.failure_reason || 'Proxy did not intercept traffic';
    } else if (!validation.payload_inspected) {
      result.failure_reason = 'Payload was intercepted but not inspected';
    } else if (!validation.redacted) {
      result.failure_reason = 'Payload inspected but PII not redacted';
    } else {
      result.passed = true;
    }
  } catch (err) {
    result.failure_reason = `Unexpected error: ${err.message}`;
  } finally {
    if (browser) await browser.close();
  }

  return result;
}

async function run() {
  console.log('=== Domain Interception Test ===');
  console.log(`Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`Testing ${LLM_DOMAINS.length} domains...\n`);

  for (const domainConfig of LLM_DOMAINS) {
    console.log(`Testing: ${domainConfig.name} (${domainConfig.url})`);
    const r = await testDomain(domainConfig);
    results.push(r);

    if (r.passed) {
      console.log(`  PASS: ${r.domain}`);
    } else {
      console.error(`  FAIL: ${r.domain} — ${r.failure_reason}`);
    }
  }

  console.log('\n=== Summary ===');
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);

  console.log(`Passed: ${passed.length}/${results.length}`);
  if (failed.length > 0) {
    console.error(`\nFailed domains:`);
    failed.forEach((r) => console.error(`  - ${r.domain}: ${r.failure_reason}`));
  }

  // Write JSON report
  const fs = require('fs');
  const path = require('path');
  const reportDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `domain-test-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
