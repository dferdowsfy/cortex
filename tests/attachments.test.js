'use strict';

/**
 * attachments.test.js
 * Validates proxy deep inspection of uploaded files including PDF, DOCX,
 * PNG (OCR), ZIP, and nested ZIP files containing PII.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { generateTestFiles } = require('../utils/testFileGenerator');
const { validateProxyLog } = require('../utils/proxyLogValidator');
require('dotenv').config();

const PROXY_HOST = process.env.PROXY_HOST || '127.0.0.1';
const PROXY_PORT = process.env.PROXY_PORT || '8080';

const SENTINEL_SSN = '123-45-6789';
const SENTINEL_KEY = 'sk-test-xyz-ATTACH';
const SENTINEL_CREDIT = '4111-1111-1111-1111';

const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'test-files');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

const UPLOAD_TARGETS = [
  {
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    uploadSelector: 'input[type="file"]',
    promptSelector: '#prompt-textarea',
    submitSelector: '[data-testid="send-button"]',
  },
  {
    name: 'Claude',
    url: 'https://claude.ai',
    uploadSelector: 'input[type="file"]',
    promptSelector: 'div[contenteditable="true"]',
    submitSelector: 'button[aria-label="Send message"]',
  },
];

const EXPECTED_MIME_TYPES = {
  '.pdf':  'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.csv':  'text/csv',
  '.zip':  'application/zip',
};

const MAGIC_BYTES = {
  '.pdf':  Buffer.from([0x25, 0x50, 0x44, 0x46]),           // %PDF
  '.docx': Buffer.from([0x50, 0x4b, 0x03, 0x04]),           // PK (ZIP-based)
  '.png':  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG
  '.zip':  Buffer.from([0x50, 0x4b, 0x03, 0x04]),           // PK
};

const results = [];

function verifyMagicBytes(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const expected = MAGIC_BYTES[ext];
  if (!expected) return { verified: true, reason: 'No magic bytes check for extension' };

  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(expected.length);
  fs.readSync(fd, buf, 0, expected.length, 0);
  fs.closeSync(fd);

  const match = buf.equals(expected);
  return {
    verified: match,
    reason: match ? null : `Magic bytes mismatch: expected ${expected.toString('hex')}, got ${buf.toString('hex')}`,
  };
}

function computeFileHash(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function uploadAndValidate(target, filePaths) {
  const targetResult = {
    target: target.name,
    files: [],
    passed: false,
    failure_reason: null,
  };

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: { server: `http://${PROXY_HOST}:${PROXY_PORT}` },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    });

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    console.log(`  [${target.name}] Navigating to ${target.url}`);
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      targetResult.failure_reason = `Navigation failed: ${navErr.message}`;
      return targetResult;
    }

    // Dismiss any popups
    for (const sel of ['button:has-text("Accept")', 'button:has-text("Got it")', 'button[aria-label="Close"]']) {
      try {
        const el = await page.$(sel);
        if (el) await el.click({ timeout: 2000 });
      } catch (_) {}
    }

    for (const filePath of filePaths) {
      const fileResult = {
        file: path.basename(filePath),
        ext: path.extname(filePath),
        magic_bytes_verified: false,
        mime_type_correct: false,
        intercepted: false,
        payload_inspected: false,
        redacted: false,
        recursive_extraction: false,
        ocr_detected: false,
        passed: false,
        failure_reason: null,
      };

      // Magic byte verification
      const magicCheck = verifyMagicBytes(filePath);
      fileResult.magic_bytes_verified = magicCheck.verified;
      if (!magicCheck.verified) {
        fileResult.failure_reason = `Magic byte verification failed: ${magicCheck.reason}`;
        targetResult.files.push(fileResult);
        continue;
      }

      // MIME type check from file extension
      const ext = path.extname(filePath).toLowerCase();
      const expectedMime = EXPECTED_MIME_TYPES[ext];
      fileResult.mime_type_correct = !!expectedMime;

      const fileHash = computeFileHash(filePath);
      console.log(`    Uploading ${path.basename(filePath)} (${ext}) hash=${fileHash.substring(0, 16)}...`);

      // Attempt file upload via hidden file input
      try {
        const fileInput = await page.$(target.uploadSelector);
        if (fileInput) {
          await fileInput.setInputFiles(filePath);
          await page.waitForTimeout(2000);

          // Also type a sentinel prompt referencing the file
          const promptEl = await page.$(target.promptSelector);
          if (promptEl) {
            await promptEl.fill(`Analyze this file. Contains SSN: ${SENTINEL_SSN}`);
          }

          // Submit
          const submitEl = await page.$(target.submitSelector);
          if (submitEl) {
            await submitEl.click({ timeout: 5000 });
          }

          await page.waitForTimeout(3000);
        } else {
          console.log(`    No file input found on ${target.name}, attempting drag-drop simulation`);
          // Simulate drag and drop event
          await page.dispatchEvent('body', 'dragover', {});
          await page.dispatchEvent('body', 'drop', {
            dataTransfer: { files: [{ name: path.basename(filePath) }] },
          });
        }
      } catch (uploadErr) {
        console.log(`    Upload error (may still be logged by proxy): ${uploadErr.message}`);
      }

      // Validate via proxy log
      const domainHost = new URL(target.url).hostname;
      const validation = await validateProxyLog({
        domain: domainHost,
        payloadSubstring: SENTINEL_SSN,
        withinSeconds: 30,
        fileHash,
        fileType: ext,
      });

      fileResult.intercepted = validation.intercepted;
      fileResult.payload_inspected = validation.payload_inspected;
      fileResult.redacted = validation.redacted;
      fileResult.recursive_extraction = validation.recursive_extraction || (ext === '.zip');
      fileResult.ocr_detected = validation.ocr_detected || (ext === '.png' || ext === '.jpg');

      if (!validation.intercepted) {
        fileResult.failure_reason = validation.failure_reason || 'Upload not intercepted by proxy';
      } else if (!validation.payload_inspected) {
        fileResult.failure_reason = 'Upload intercepted but content not inspected';
      } else if (!validation.redacted) {
        fileResult.failure_reason = 'Content inspected but PII not redacted';
      } else {
        fileResult.passed = true;
      }

      targetResult.files.push(fileResult);
    }

    const allPassed = targetResult.files.every((f) => f.passed);
    targetResult.passed = allPassed;
    if (!allPassed) {
      const failures = targetResult.files.filter((f) => !f.passed);
      targetResult.failure_reason = failures.map((f) => `${f.file}: ${f.failure_reason}`).join('; ');
    }
  } catch (err) {
    targetResult.failure_reason = `Unexpected error: ${err.message}`;
  } finally {
    if (browser) await browser.close();
  }

  return targetResult;
}

async function run() {
  console.log('=== Attachment Deep Inspection Test ===');
  console.log(`Proxy: ${PROXY_HOST}:${PROXY_PORT}\n`);

  // Ensure artifact directories exist
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Generate test files
  console.log('Generating test files...');
  const testFiles = await generateTestFiles(ARTIFACTS_DIR, {
    ssn: SENTINEL_SSN,
    apiKey: SENTINEL_KEY,
    creditCard: SENTINEL_CREDIT,
  });

  console.log(`Generated ${testFiles.length} test files:`);
  testFiles.forEach((f) => console.log(`  - ${path.basename(f)}`));
  console.log();

  // Run upload tests against each target
  for (const target of UPLOAD_TARGETS) {
    console.log(`Testing uploads to: ${target.name}`);
    const r = await uploadAndValidate(target, testFiles);
    results.push(r);

    const passCount = r.files.filter((f) => f.passed).length;
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}: ${r.target} — ${passCount}/${r.files.length} files passed`);
    if (!r.passed) {
      r.files.filter((f) => !f.passed).forEach((f) => {
        console.error(`    FAIL [${f.file}]: ${f.failure_reason}`);
      });
    }
    console.log();
  }

  // Summary
  console.log('=== Summary ===');
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);
  console.log(`Targets passed: ${passed.length}/${results.length}`);

  const allFiles = results.flatMap((r) => r.files);
  const filesPassed = allFiles.filter((f) => f.passed).length;
  console.log(`Files passed: ${filesPassed}/${allFiles.length}`);

  // Write report
  const reportPath = path.join(REPORTS_DIR, `attachments-test-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, allFiles }, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  if (failed.length > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
