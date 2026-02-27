'use strict';

/**
 * conditional_merge.js
 *
 * Evaluates a GitHub PR for auto-merge eligibility.
 *
 * Requirements for auto-merge:
 *   1. PR is open and not labeled "manual-review-required"
 *   2. All changed files are within the safe path allowlist
 *   3. All CI status checks and check-runs have passed
 *
 * If all conditions are met → merge via squash
 * Otherwise              → exit without merging, log reason
 *
 * Usage:
 *   PR_NUMBER=<number> node scripts/conditional_merge.js
 *
 * Required environment variables:
 *   GITHUB_TOKEN       GitHub token with repo + pull_requests scopes
 *   GITHUB_REPOSITORY  "owner/repo"
 *   PR_NUMBER          PR number to evaluate
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SAFE_PATH_ALLOWLIST = [
  'tests/',
  'utils/testFileGenerator.js',
  'utils/payloadMutator.js',
  'utils/proxyLogValidator.js',
];

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const PR_NUMBER = process.env.PR_NUMBER;

if (!GITHUB_TOKEN) {
  console.error('[conditional_merge] FATAL: GITHUB_TOKEN is not set.');
  process.exit(1);
}
if (!GITHUB_REPOSITORY) {
  console.error('[conditional_merge] FATAL: GITHUB_REPOSITORY is not set.');
  process.exit(1);
}
if (!PR_NUMBER) {
  console.error('[conditional_merge] FATAL: PR_NUMBER is not set.');
  process.exit(1);
}

const [OWNER, REPO] = GITHUB_REPOSITORY.split('/');

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

const STATE_DIR = path.resolve(process.cwd(), '_remediation_state');
const LOG_FILE = path.join(STATE_DIR, 'conditional_merge.log');

function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    prNumber: PR_NUMBER,
    ...meta,
  };
  const line = JSON.stringify(entry);
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${level.toUpperCase()}] ${message}${metaStr}`);
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ---------------------------------------------------------------------------
// GitHub REST API helpers
// ---------------------------------------------------------------------------

function githubAPI(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}${endpoint}`,
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'conditional-merge-bot/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(bodyStr
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
            }
          : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(
            new Error(`GitHub API ${method} ${endpoint} → ${res.statusCode}: ${data}`),
          );
        }
        try { resolve(data ? JSON.parse(data) : {}); }
        catch { resolve({}); }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Paginate all pages of a GitHub list endpoint.
 * @param {string} endpoint - path including query params (without page/per_page)
 * @returns {Promise<Array>}
 */
async function githubAPIAll(endpoint) {
  const results = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const data = await githubAPI('GET', `${endpoint}${sep}per_page=${perPage}&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < perPage) break;
    page++;
  }
  return results;
}

// ---------------------------------------------------------------------------
// PR metadata
// ---------------------------------------------------------------------------

async function getPRDetails(prNumber) {
  return githubAPI('GET', `/pulls/${prNumber}`);
}

async function getPRLabels(prNumber) {
  const issue = await githubAPI('GET', `/issues/${prNumber}`);
  return (issue.labels || []).map((l) => l.name);
}

async function getPRChangedFiles(prNumber) {
  const files = await githubAPIAll(`/pulls/${prNumber}/files`);
  return files.map((f) => f.filename);
}

// ---------------------------------------------------------------------------
// CI check evaluation
// ---------------------------------------------------------------------------

async function evaluateChecks(sha) {
  log('info', 'Fetching CI checks', { sha });

  const [combinedStatus, checkRuns] = await Promise.all([
    githubAPI('GET', `/commits/${sha}/status`),
    githubAPIAll(`/commits/${sha}/check-runs`),
  ]);

  const pending = [];
  const failed = [];

  // Legacy commit statuses
  for (const status of (combinedStatus.statuses || [])) {
    if (status.state === 'pending') {
      pending.push(`[status] ${status.context}`);
    } else if (status.state === 'failure' || status.state === 'error') {
      failed.push(`[status] ${status.context}`);
    }
  }

  // GitHub Actions check runs
  for (const run of checkRuns) {
    if (run.status !== 'completed') {
      pending.push(`[check-run] ${run.name}`);
    } else if (
      run.conclusion === 'failure' ||
      run.conclusion === 'cancelled' ||
      run.conclusion === 'timed_out' ||
      run.conclusion === 'action_required'
    ) {
      failed.push(`[check-run] ${run.name}`);
    }
    // 'success', 'neutral', 'skipped' → acceptable
  }

  // No checks found → conservative block
  if ((combinedStatus.statuses || []).length === 0 && checkRuns.length === 0) {
    log('warn', 'No CI checks found for commit; treating as not passed.', { sha });
    return { allPassed: false, pending: ['no-checks-found'], failed: [] };
  }

  return {
    allPassed: pending.length === 0 && failed.length === 0,
    pending,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function isPathAllowed(filePath) {
  const normalized = filePath.replace(/^\//, '');
  return SAFE_PATH_ALLOWLIST.some((allowed) => {
    if (allowed.endsWith('/')) {
      return normalized.startsWith(allowed) || normalized === allowed.slice(0, -1);
    }
    return normalized === allowed;
  });
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

async function mergePR(prNumber, sha) {
  log('info', 'Merging PR', { prNumber, sha });
  return githubAPI('PUT', `/pulls/${prNumber}/merge`, {
    commit_title: `chore: auto-merge auto-remediation PR #${prNumber}`,
    commit_message: [
      'Automatically merged by conditional_merge.js.',
      'All CI checks passed and path validation confirmed.',
      'Only allowlisted safe paths were modified.',
    ].join(' '),
    sha,
    merge_method: 'squash',
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('info', `Evaluating PR #${PR_NUMBER} for conditional auto-merge`);

  // ── Fetch PR details ───────────────────────────────────────────────────────
  let pr;
  try {
    pr = await getPRDetails(PR_NUMBER);
  } catch (err) {
    log('error', `Failed to fetch PR details: ${err.message}`);
    process.exit(1);
  }

  const { head, state, mergeable, mergeable_state } = pr;

  if (state !== 'open') {
    log('info', `PR #${PR_NUMBER} is not open (state=${state}). Nothing to do.`);
    process.exit(0);
  }

  if (mergeable === false) {
    log('warn', `PR #${PR_NUMBER} is not mergeable.`, {
      mergeable_state,
      action: 'skip_merge',
      reason: 'pr_not_mergeable',
    });
    process.exit(0);
  }

  const headSHA = head.sha;
  log('info', 'PR head SHA', { sha: headSHA });

  // ── Manual-review label check ──────────────────────────────────────────────
  let labels;
  try {
    labels = await getPRLabels(PR_NUMBER);
  } catch (err) {
    log('error', `Failed to fetch PR labels: ${err.message}`);
    process.exit(1);
  }

  if (labels.includes('manual-review-required')) {
    log('warn', `PR #${PR_NUMBER} is labeled "manual-review-required". Auto-merge blocked.`, {
      labels,
      action: 'skip_merge',
      reason: 'manual_review_required_label',
    });
    process.exit(0);
  }

  // ── Changed-file allowlist check ───────────────────────────────────────────
  log('info', 'Fetching PR changed files');
  let changedFiles;
  try {
    changedFiles = await getPRChangedFiles(PR_NUMBER);
  } catch (err) {
    log('error', `Failed to fetch PR changed files: ${err.message}`);
    process.exit(1);
  }

  log('info', 'PR changed files', { count: changedFiles.length, files: changedFiles });

  const violations = changedFiles.filter((f) => !isPathAllowed(f));
  if (violations.length > 0) {
    log('warn', `PR #${PR_NUMBER} modifies non-allowlisted paths. Auto-merge blocked.`, {
      violations,
      allowlist: SAFE_PATH_ALLOWLIST,
      action: 'skip_merge',
      reason: 'non_allowlisted_paths',
    });
    process.exit(0);
  }

  log('info', 'All changed files are within the safe allowlist.');

  // ── CI check evaluation ────────────────────────────────────────────────────
  let checks;
  try {
    checks = await evaluateChecks(headSHA);
  } catch (err) {
    log('error', `Failed to evaluate CI checks: ${err.message}`);
    process.exit(1);
  }

  log('info', 'CI check evaluation result', {
    allPassed: checks.allPassed,
    pending: checks.pending,
    failed: checks.failed,
  });

  if (!checks.allPassed) {
    log('warn', `PR #${PR_NUMBER} has pending or failed CI checks. Auto-merge blocked.`, {
      pending: checks.pending,
      failed: checks.failed,
      action: 'skip_merge',
      reason: 'ci_checks_not_passed',
    });
    process.exit(0);
  }

  log('info', 'All CI checks passed. Proceeding with merge.');

  // ── Merge ──────────────────────────────────────────────────────────────────
  try {
    const result = await mergePR(PR_NUMBER, headSHA);
    log('info', `PR #${PR_NUMBER} merged successfully.`, {
      sha: result.sha,
      merged: result.merged,
      message: result.message,
    });
  } catch (err) {
    log('error', `Failed to merge PR #${PR_NUMBER}: ${err.message}`);
    process.exit(1);
  }

  log('info', 'Conditional merge complete.');
}

main().catch((err) => {
  console.error('[conditional_merge] Unhandled error:', err);
  process.exit(1);
});
