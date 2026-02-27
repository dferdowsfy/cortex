'use strict';

/**
 * proxyLogValidator.js
 * Queries the local Complyze proxy log endpoint and validates that traffic
 * was correctly intercepted, inspected, and redacted.
 */

const axios = require('axios');
require('dotenv').config();

// PROXY_URL is the base URL of the proxy log API (e.g. http://localhost:3737).
// PROXY_LOG_URL overrides the full endpoint path when set explicitly.
const _PROXY_BASE   = process.env.PROXY_URL || 'http://localhost:3737';
const PROXY_LOG_URL = process.env.PROXY_LOG_URL || `${_PROXY_BASE}/logs`;
const PROXY_LOG_API_KEY = process.env.PROXY_LOG_API_KEY || '';

/**
 * @typedef {Object} ValidationRequest
 * @property {string}  domain                 - Hostname to look up in logs
 * @property {string}  [payloadSubstring]      - Raw substring expected in payload
 * @property {string}  [decodedPayloadSubstring] - Substring after decoding (base64, etc.)
 * @property {number}  [withinSeconds=60]      - Only consider logs within last N seconds
 * @property {string}  [payloadHash]           - SHA-256 hash of the original payload body
 * @property {string}  [fileHash]              - SHA-256 hash of an uploaded file
 * @property {string}  [fileType]              - Extension of uploaded file
 * @property {string}  [protocol]              - 'http', 'https', 'websocket'
 * @property {string}  [bypassAttempt]         - Label of the bypass technique attempted
 * @property {string}  [mutationType]          - Label of mutation applied
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} intercepted          - Proxy saw the request
 * @property {boolean} payload_inspected    - Proxy read the payload content
 * @property {boolean} redacted             - Proxy removed PII from the payload
 * @property {boolean} [recursive_extraction] - ZIP/archive was recursively unpacked
 * @property {boolean} [ocr_detected]       - OCR was applied to image content
 * @property {string|null} failure_reason   - Human-readable reason for failure
 * @property {Object|null} matched_log      - The matching log entry, if found
 */

/**
 * Fetch recent log entries from the proxy.
 * @param {number} withinSeconds
 * @returns {Promise<Array>}
 */
async function fetchLogs(withinSeconds = 60) {
  const since = new Date(Date.now() - withinSeconds * 1000).toISOString();
  const headers = PROXY_LOG_API_KEY ? { Authorization: `Bearer ${PROXY_LOG_API_KEY}` } : {};

  try {
    const resp = await axios.get(PROXY_LOG_URL, {
      params: { since, limit: 500 },
      headers,
      timeout: 10000,
    });

    const data = resp.data;

    // Support multiple response shapes
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.logs)) return data.logs;
    if (Array.isArray(data.entries)) return data.entries;
    if (Array.isArray(data.data)) return data.data;

    return [];
  } catch (err) {
    // Return sentinel structure so callers can distinguish connection failure
    // from actual absence of log entries
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      throw new Error(`Proxy log endpoint unreachable at ${PROXY_LOG_URL}: ${err.message}`);
    }
    console.error(`[proxyLogValidator] Log fetch error: ${err.message}`);
    return [];
  }
}

/**
 * Normalize a log entry so downstream comparisons can use consistent field names.
 * @param {Object} entry
 * @returns {Object}
 */
function normalizeEntry(entry) {
  return {
    domain:            entry.domain || entry.host || entry.request_host || '',
    timestamp:         entry.timestamp || entry.time || entry.created_at || '',
    payload_hash:      entry.payload_hash || entry.hash || entry.request_hash || '',
    inspected:         !!(entry.inspected || entry.payload_inspected || entry.content_inspected),
    redacted:          !!(entry.redacted || entry.pii_redacted || entry.sanitized),
    policy_applied:    entry.policy_applied || entry.policy || null,
    bypass_type:       entry.bypass_type || entry.bypass_attempt || null,
    file_hash:         entry.file_hash || entry.attachment_hash || null,
    file_type:         entry.file_type || entry.attachment_type || null,
    protocol:          entry.protocol || 'https',
    ocr_detected:      !!(entry.ocr_detected || entry.ocr_applied),
    recursive_extraction: !!(entry.recursive_extraction || entry.archive_extracted),
    raw_payload:       entry.raw_payload || entry.body || entry.content || '',
    decoded_payload:   entry.decoded_payload || entry.decoded_content || '',
    mutation_type:     entry.mutation_type || entry.encoding || null,
    url:               entry.url || entry.request_url || '',
    _raw:              entry,
  };
}

/**
 * Check whether a log entry matches the validation request.
 * @param {Object} norm   - Normalized log entry
 * @param {ValidationRequest} req
 * @returns {boolean}
 */
function entryMatches(norm, req) {
  // Domain check (support wildcard prefix matching)
  if (req.domain) {
    const entryDomain = norm.domain.toLowerCase();
    const reqDomain   = req.domain.toLowerCase();
    if (!entryDomain.includes(reqDomain) && !reqDomain.includes(entryDomain)) {
      return false;
    }
  }

  // Payload hash
  if (req.payloadHash && norm.payload_hash && norm.payload_hash !== req.payloadHash) {
    return false;
  }

  // File hash
  if (req.fileHash && norm.file_hash && norm.file_hash !== req.fileHash) {
    return false;
  }

  // File type
  if (req.fileType) {
    const ext = req.fileType.startsWith('.') ? req.fileType : `.${req.fileType}`;
    if (norm.file_type && !norm.file_type.includes(ext)) return false;
  }

  // Protocol
  if (req.protocol && norm.protocol && !norm.protocol.includes(req.protocol)) {
    return false;
  }

  // Payload substring in raw or decoded payload
  if (req.payloadSubstring) {
    const sub = req.payloadSubstring.toLowerCase();
    const inRaw     = norm.raw_payload.toLowerCase().includes(sub);
    const inDecoded = norm.decoded_payload.toLowerCase().includes(sub);
    const inUrl     = norm.url.toLowerCase().includes(sub);
    if (!inRaw && !inDecoded && !inUrl) return false;
  }

  // Decoded-only substring (used for base64 tests)
  if (req.decodedPayloadSubstring) {
    const sub = req.decodedPayloadSubstring.toLowerCase();
    if (!norm.decoded_payload.toLowerCase().includes(sub)) return false;
  }

  return true;
}

/**
 * Main validation function.
 * @param {ValidationRequest} req
 * @returns {Promise<ValidationResult>}
 */
async function validateProxyLog(req) {
  const withinSeconds = req.withinSeconds || 60;

  /** @type {ValidationResult} */
  const result = {
    intercepted: false,
    payload_inspected: false,
    redacted: false,
    recursive_extraction: false,
    ocr_detected: false,
    failure_reason: null,
    matched_log: null,
  };

  let logs;
  try {
    logs = await fetchLogs(withinSeconds);
  } catch (fetchErr) {
    result.failure_reason = fetchErr.message;
    return result;
  }

  if (logs.length === 0) {
    result.failure_reason = `No log entries found within the last ${withinSeconds}s`;
    return result;
  }

  // Normalize all entries
  const normalized = logs.map(normalizeEntry);

  // Find matching entry
  const match = normalized.find((n) => entryMatches(n, req));

  if (!match) {
    const debugInfo = [
      req.domain && `domain=${req.domain}`,
      req.payloadSubstring && `payloadSubstring="${req.payloadSubstring}"`,
      req.bypassAttempt && `bypassAttempt=${req.bypassAttempt}`,
    ].filter(Boolean).join(', ');

    result.failure_reason = `No matching log entry found (${debugInfo}) in ${logs.length} entries`;
    return result;
  }

  result.intercepted = true;
  result.matched_log = match._raw;
  result.payload_inspected = match.inspected;
  result.redacted = match.redacted;
  result.recursive_extraction = match.recursive_extraction;
  result.ocr_detected = match.ocr_detected;

  // Additional validation: timestamp freshness
  if (match.timestamp) {
    const logTime = new Date(match.timestamp).getTime();
    const now = Date.now();
    const ageSeconds = (now - logTime) / 1000;
    if (ageSeconds > withinSeconds) {
      result.intercepted = false;
      result.failure_reason = `Log entry found but timestamp is too old: ${ageSeconds.toFixed(1)}s ago (limit: ${withinSeconds}s)`;
      return result;
    }
  }

  // Additional validation: policy enforcement
  if (!match.policy_applied) {
    // Non-fatal: log a warning but don't fail
    console.warn(`[proxyLogValidator] Warning: No policy_applied field in log for ${req.domain}`);
  }

  // Build failure reason if inspected/redacted checks fail
  if (!match.inspected) {
    result.failure_reason = 'Request was intercepted but payload was not inspected';
  } else if (!match.redacted) {
    result.failure_reason = 'Payload inspected but PII was not redacted';
  }

  return result;
}

/**
 * Query a specific log entry by its payload hash.
 * @param {string} hash
 * @param {number} [withinSeconds=120]
 * @returns {Promise<Object|null>}
 */
async function getLogByHash(hash, withinSeconds = 120) {
  const logs = await fetchLogs(withinSeconds);
  const normalized = logs.map(normalizeEntry);
  return normalized.find((n) => n.payload_hash === hash) || null;
}

/**
 * Retrieve full structured log dump for reporting.
 * @param {number} [withinSeconds=3600]
 * @returns {Promise<Object>}
 */
async function getDiagnosticReport(withinSeconds = 3600) {
  const logs = await fetchLogs(withinSeconds);
  const normalized = logs.map(normalizeEntry);

  const intercepted    = normalized.filter((n) => n.domain);
  const inspected      = normalized.filter((n) => n.inspected);
  const redacted       = normalized.filter((n) => n.redacted);
  const ocr            = normalized.filter((n) => n.ocr_detected);
  const archived       = normalized.filter((n) => n.recursive_extraction);

  return {
    timestamp: new Date().toISOString(),
    total_entries: logs.length,
    intercepted_count: intercepted.length,
    inspected_count: inspected.length,
    redacted_count: redacted.length,
    ocr_applied_count: ocr.length,
    archive_extraction_count: archived.length,
    entries: normalized,
  };
}

module.exports = {
  validateProxyLog,
  getLogByHash,
  getDiagnosticReport,
  fetchLogs,
};
