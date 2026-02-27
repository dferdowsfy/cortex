# Complyze Proxy Validation Test Harness

Automated security test harness that continuously validates the Complyze local proxy system's ability to intercept, inspect, and redact PII from LLM platform traffic.

---

## Architecture

```
/tests
  domain.test.js          — Playwright browser tests against LLM web UIs
  api.test.js             — Axios HTTP + WebSocket API interception tests
  attachments.test.js     — File upload deep inspection (PDF/DOCX/PNG/ZIP)
  bypass.test.js          — Proxy bypass attempt detection
  endpoint-discovery.js   — Live endpoint registry management

/utils
  proxyLogValidator.js    — Queries proxy log API, validates interception
  testFileGenerator.js    — Generates PII-laden test files (PDF/DOCX/PNG/CSV/ZIP)
  payloadMutator.js       — Encodes/obfuscates payloads for bypass testing

/proxy-test-harness
  package.json            — Harness dependencies
  scripts/
    preflight.js          — Environment validation before test run
    aggregate-reports.js  — Combines all JSON reports into unified summary

.github/workflows/
  daily-security-tests.yml — CI pipeline (runs daily at 06:00 UTC)
```

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | >= 18   |
| Complyze local proxy | Running on `PROXY_HOST:PROXY_PORT` |
| Proxy log API | Running on `PROXY_LOG_URL` (default: `http://localhost:3737/logs`) |
| Tesseract OCR (optional) | For PNG OCR tests |

---

## Quick Start

### 1. Install dependencies

```bash
cd proxy-test-harness
npm install
npx playwright install chromium
```

### 2. Configure environment

```bash
cp ../../.env.example ../../.env
```

Edit `.env`:

```env
# Proxy settings
PROXY_HOST=127.0.0.1
PROXY_PORT=8080
PROXY_LOG_URL=http://localhost:3737/logs
PROXY_LOG_API_KEY=

# API keys (used to send real traffic through the proxy)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Optional
VERBOSE=false
STRICT_PREFLIGHT=1
```

### 3. Run all tests

```bash
npm test
```

### 4. Run individual suites

```bash
npm run test:domains      # LLM web platform interception
npm run test:api          # Direct API traffic interception
npm run test:attachments  # File upload deep inspection
npm run test:bypass       # Bypass attempt detection
npm run test:discovery    # Endpoint registry update
npm run test:report       # Aggregate all reports
```

---

## Test Suites

### `domain.test.js` — LLM Web Platform Interception

Launches Playwright headless Chromium through the proxy and visits each LLM platform. Submits a synthetic prompt containing SSN, credit card number, and API key. Validates via proxy log API that the request was intercepted, the payload was inspected, and PII was redacted.

**Tested platforms:**
- chat.openai.com
- claude.ai
- gemini.google.com
- perplexity.ai
- grok.x.ai
- poe.com
- openrouter.ai

---

### `api.test.js` — Direct API Traffic Interception

Uses axios with an HTTPS proxy agent to POST synthetic PII to LLM API endpoints. Also tests WebSocket connections and mutated payload variants (base64, homoglyphs, unicode, zero-width).

**Tested endpoints:**
- api.openai.com/v1/chat/completions
- api.openai.com/v1/embeddings
- api.anthropic.com/v1/messages
- generativelanguage.googleapis.com

---

### `attachments.test.js` — File Upload Deep Inspection

Uses `testFileGenerator.js` to create test files containing PII, uploads them to ChatGPT and Claude via Playwright, and validates:
- Magic byte verification (PDF `%PDF`, DOCX/ZIP `PK\x03\x04`, PNG `\x89PNG`)
- MIME type correctness
- Recursive ZIP extraction (nested ZIP-in-ZIP)
- OCR detection on PNG images

**Generated file types:**
- PDF (via pdf-lib)
- DOCX (via jszip + OOXML)
- PNG (via canvas or raw tEXt chunk)
- CSV
- ZIP containing PDF
- Nested ZIP (ZIP-in-ZIP)

---

### `bypass.test.js` — Bypass Attempt Detection

Validates the proxy intercepts all bypass techniques. A **PASS** means the proxy blocked/logged the attempt.

| # | Technique | Method |
|---|-----------|--------|
| 1 | Direct IP access | Resolve domain to IP, connect with `Host:` header |
| 2 | Alternate DNS | Resolve via Cloudflare/Google DoH, use returned IP |
| 3 | Custom User-Agent | curl, python-requests, Googlebot, empty string |
| 4 | Base64 encoding | Entire payload base64-encoded before sending |
| 5 | Unicode homoglyphs | Cyrillic/Greek lookalikes replace Latin chars |
| 6 | HTTP/2 | TLS 1.3 connection preferring HTTP/2 |
| 7 | Zero-width chars | U+200B/U+200C injected between payload characters |
| 8 | Chunked transfer | Raw TCP socket, PK-chunked body via proxy CONNECT |

---

### `endpoint-discovery.js` — Endpoint Registry

Maintains `artifacts/endpoint-registry.json`. On each run:
1. Seeds registry with all known LLM provider domains (if first run)
2. Fetches proxy logs from the last 24 hours
3. Classifies observed domains (exact match → pattern match → heuristic)
4. Flags new LLM-related domains not previously seen
5. Saves updated registry and JSON report

**Known providers tracked:** OpenAI, Anthropic, Google, Perplexity, Grok/xAI, Poe, OpenRouter, HuggingFace, Cohere, Mistral, Together, Groq, Replicate, ElevenLabs, Stability AI, Azure OpenAI, AWS Bedrock

---

## Utility Modules

### `proxyLogValidator.js`

Queries `PROXY_LOG_URL` and returns:

```json
{
  "intercepted": true,
  "payload_inspected": true,
  "redacted": true,
  "recursive_extraction": false,
  "ocr_detected": false,
  "failure_reason": null,
  "matched_log": { ... }
}
```

Supports flexible log entry shapes — normalizes `domain`, `host`, `request_host`, `inspected`/`payload_inspected`/`content_inspected`, etc.

---

### `testFileGenerator.js`

```js
const { generateTestFiles } = require('./utils/testFileGenerator');

const files = await generateTestFiles('./artifacts/test-files', {
  ssn: '123-45-6789',
  apiKey: 'sk-test-xyz',
  creditCard: '4111-1111-1111-1111',
});
// returns array of file paths
```

Also exports: `generatePDF`, `generateDOCX`, `generatePNG`, `generateCSV`, `generateZIP`, `generateNestedZIP`, `extractFileContent`

---

### `payloadMutator.js`

```js
const { mutatePayload, generateAllMutations } = require('./utils/payloadMutator');

// Single mutation
const b64 = mutatePayload('SSN 123-45-6789', { base64Wrap: true });

// All mutations at once
const variants = generateAllMutations('SSN 123-45-6789', '123-45-6789');
// returns [{ label: 'base64', payload: '...' }, ...]
```

**Available options:** `base64Wrap`, `zeroWidthChars`, `homoglyphs`, `randomCase`, `unicodeObfuscate`, `urlEncode`, `hexEncode`, `rot13`, `chunkSplit`, `linguisticWrap`, `obfuscateSSN`

---

## CI/CD Pipeline

The GitHub Actions workflow at `.github/workflows/daily-security-tests.yml` runs all five suites in parallel daily at 06:00 UTC.

### Required Secrets

| Secret | Description |
|--------|-------------|
| `PROXY_HOST` | Complyze proxy hostname/IP |
| `PROXY_PORT` | Complyze proxy port |
| `PROXY_LOG_URL` | Proxy log API endpoint |
| `PROXY_LOG_API_KEY` | Auth key for proxy log API (if required) |
| `OPENAI_API_KEY` | OpenAI API key for API tests |
| `ANTHROPIC_API_KEY` | Anthropic API key for API tests |
| `GOOGLE_API_KEY` | Google API key for Gemini tests |
| `SLACK_WEBHOOK_URL` | (Optional) Slack webhook for failure alerts |

### Artifacts

All test runs upload JSON reports as GitHub Actions artifacts (retained 30 days):

- `domain-test-reports-{run_id}` — domain test results
- `api-test-reports-{run_id}` — API test results
- `attachment-test-reports-{run_id}` — attachment test results + generated files
- `bypass-test-reports-{run_id}` — bypass test results
- `endpoint-discovery-{run_id}` — discovery report + updated registry (retained 90 days)
- `aggregate-report-{run_id}` — unified summary (retained 90 days)

### Manual Trigger

```bash
gh workflow run daily-security-tests.yml \
  -f test_suite=bypass \
  -f proxy_host=10.0.0.1 \
  -f proxy_port=8080
```

---

## Proxy Log API Contract

The harness expects the proxy log endpoint (`PROXY_LOG_URL`) to return:

```json
{
  "logs": [
    {
      "domain": "api.openai.com",
      "timestamp": "2025-01-01T06:00:01.000Z",
      "payload_hash": "sha256hex...",
      "payload_inspected": true,
      "redacted": true,
      "policy_applied": "pii-redaction-v2",
      "raw_payload": "...",
      "decoded_payload": "...",
      "protocol": "https",
      "ocr_detected": false,
      "recursive_extraction": false
    }
  ]
}
```

Query parameters accepted: `?since=ISO8601&limit=N`

The validator normalizes multiple field name conventions (e.g. `inspected` / `payload_inspected` / `content_inspected`) so it works with varied proxy implementations.

---

## Report Format

Each test produces a timestamped JSON report in `reports/`:

```json
{
  "timestamp": "2025-01-01T06:00:00.000Z",
  "results": [
    {
      "domain": "chat.openai.com",
      "passed": true,
      "intercepted": true,
      "payload_inspected": true,
      "redacted": true,
      "failure_reason": null
    }
  ]
}
```

The aggregate report (`reports/aggregate-*.json`) merges all suites into a single pass/fail summary with per-test failure details.

---

## Troubleshooting

**Proxy not reachable:** Ensure the Complyze proxy is running and `PROXY_HOST`/`PROXY_PORT` are correct. The preflight script (`node proxy-test-harness/scripts/preflight.js`) checks connectivity before tests run.

**Log endpoint returns empty:** The proxy log API may require authentication (`PROXY_LOG_API_KEY`) or may not have logged recent traffic. Check the proxy is routing traffic through itself.

**Canvas / OCR not available in CI:** The workflow installs `libcairo2-dev` and `tesseract-ocr` system packages. The file generator falls back to a raw PNG with tEXt metadata chunks if canvas is unavailable.

**Playwright navigation timeout:** LLM platforms have bot detection. Tests use `domcontentloaded` (not `networkidle`) to reduce timeouts. If a specific platform consistently fails navigation, add it to the skip list via the `SKIP_DOMAINS` environment variable.
