'use strict';

/**
 * auto_remediate.js
 *
 * Reads failure artifacts from ./_failed_run_artifacts
 * Reads the remediation prompt template from /.ai/remediation_prompt.md
 * Calls the Anthropic API to generate a unified diff patch
 * Validates the patch against the safe-file allowlist
 *
 * If safe:
 *   - Creates branch autofix/<timestamp>
 *   - Applies patch
 *   - Commits and pushes
 *   - Opens PR
 *
 * If unsafe:
 *   - Creates branch autofix/manual-review-<timestamp>
 *   - Opens PR labeled "manual-review-required"
 *   - Logs the reason clearly
 *
 * MAX_ATTEMPTS = 3 per failing branch
 *
 * Safe file allowlist:
 *   - tests/
 *   - utils/testFileGenerator.js
 *   - utils/payloadMutator.js
 *   - utils/proxyLogValidator.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;

const SAFE_PATH_ALLOWLIST = [
  'tests/',
  'utils/testFileGenerator.js',
  'utils/payloadMutator.js',
  'utils/proxyLogValidator.js',
];

const RESTRICTED_PATHS = [
  'src/proxy/',
  'policy/',
  'auth/',
  'server/',
  '.github/workflows/',
];

const ARTIFACTS_DIR = path.resolve(process.cwd(), '_failed_run_artifacts');
const REMEDIATION_PROMPT_PATH = path.resolve(process.cwd(), '.ai', 'remediation_prompt.md');
const STATE_DIR = path.resolve(process.cwd(), '_remediation_state');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID || 'unknown';
const FAILING_BRANCH = process.env.FAILING_BRANCH || process.env.GITHUB_REF_NAME || 'main';

// ---------------------------------------------------------------------------
// Guard: required environment variables
// ---------------------------------------------------------------------------

if (!ANTHROPIC_API_KEY) {
  console.error('[auto_remediate] FATAL: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}
if (!GITHUB_TOKEN) {
  console.error('[auto_remediate] FATAL: GITHUB_TOKEN is not set.');
  process.exit(1);
}
if (!GITHUB_REPOSITORY) {
  console.error('[auto_remediate] FATAL: GITHUB_REPOSITORY is not set.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Attempt counter
// ---------------------------------------------------------------------------

const ATTEMPT_FILE = path.join(
  STATE_DIR,
  `attempts-${FAILING_BRANCH.replace(/[^a-zA-Z0-9-]/g, '_')}.json`,
);

function loadAttempts() {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    if (!fs.existsSync(ATTEMPT_FILE)) return 0;
    const state = JSON.parse(fs.readFileSync(ATTEMPT_FILE, 'utf8'));
    return typeof state.count === 'number' ? state.count : 0;
  } catch {
    return 0;
  }
}

function saveAttempts(count) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    ATTEMPT_FILE,
    JSON.stringify({ count, updatedAt: new Date().toISOString() }),
  );
}

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

const LOG_FILE = path.join(STATE_DIR, 'remediation.log');

function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    failingBranch: FAILING_BRANCH,
    runId: GITHUB_RUN_ID,
    ...meta,
  };
  const line = JSON.stringify(entry);
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${level.toUpperCase()}] ${message}${metaStr}`);
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ---------------------------------------------------------------------------
// Artifact reading
// ---------------------------------------------------------------------------

function readArtifacts() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    throw new Error(`Artifacts directory not found: ${ARTIFACTS_DIR}`);
  }
  const files = fs.readdirSync(ARTIFACTS_DIR);
  if (files.length === 0) {
    throw new Error(`No artifact files found in ${ARTIFACTS_DIR}`);
  }
  const artifacts = {};
  for (const file of files) {
    const filePath = path.join(ARTIFACTS_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      artifacts[file] = fs.readFileSync(filePath, 'utf8');
    }
  }
  return artifacts;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(templateContent, artifacts) {
  let failingTestName = 'Unknown Test';
  let errorLogs = '';
  let stackTrace = '';

  for (const [filename, content] of Object.entries(artifacts)) {
    const lower = filename.toLowerCase();
    if (lower.includes('test-name') || lower.includes('failing-test')) {
      failingTestName = content.trim();
    } else if (lower.includes('stack') || lower.includes('trace')) {
      stackTrace += `\n--- ${filename} ---\n${content}`;
    } else {
      errorLogs += `\n--- ${filename} ---\n${content}`;
    }
  }

  // Try to extract test name from JSON report artifacts
  if (failingTestName === 'Unknown Test') {
    for (const content of Object.values(artifacts)) {
      try {
        const parsed = JSON.parse(content);
        const name = parsed.failing_suite || parsed.test_name || parsed.suite;
        if (name) { failingTestName = name; break; }
      } catch { /* not JSON */ }
    }
  }

  return templateContent
    .replace('{{FAILING_TEST_NAME}}', failingTestName)
    .replace('{{ERROR_LOGS}}', errorLogs.trim() || 'No error logs available.')
    .replace('{{STACK_TRACE}}', stackTrace.trim() || 'No stack trace available.')
    .replace('{{FAILING_BRANCH}}', FAILING_BRANCH)
    .replace('{{GITHUB_RUN_ID}}', GITHUB_RUN_ID);
}

// ---------------------------------------------------------------------------
// Anthropic API
// ---------------------------------------------------------------------------

function callAnthropicAPI(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Anthropic API returned ${res.statusCode}: ${data}`));
        }
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text;
          if (!text) return reject(new Error('Empty response from Anthropic API'));
          resolve(text);
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Diff extraction
// ---------------------------------------------------------------------------

function extractUnifiedDiff(responseText) {
  const fencedDiff = responseText.match(/```diff\n([\s\S]*?)```/);
  if (fencedDiff) return fencedDiff[1].trim();

  const fencedPatch = responseText.match(/```patch\n([\s\S]*?)```/);
  if (fencedPatch) return fencedPatch[1].trim();

  // Raw unified diff detection
  const lines = responseText.split('\n');
  const diffStart = lines.findIndex(
    (l) => l.startsWith('--- ') || l.startsWith('diff --git '),
  );
  if (diffStart !== -1) return lines.slice(diffStart).join('\n').trim();

  return null;
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function normalizeDiffPath(p) {
  return p.replace(/^[ab]\//, '').replace(/^\//, '');
}

function extractDiffPaths(diff) {
  const paths = new Set();
  for (const line of diff.split('\n')) {
    const minusMatch = line.match(/^--- ([^\s]+)/);
    const plusMatch = line.match(/^\+\+\+ ([^\s]+)/);
    const gitMatch = line.match(/^diff --git ([^\s]+) ([^\s]+)/);

    if (minusMatch && minusMatch[1] !== '/dev/null') paths.add(normalizeDiffPath(minusMatch[1]));
    if (plusMatch && plusMatch[1] !== '/dev/null') paths.add(normalizeDiffPath(plusMatch[1]));
    if (gitMatch) {
      paths.add(normalizeDiffPath(gitMatch[1]));
      paths.add(normalizeDiffPath(gitMatch[2]));
    }
  }
  return [...paths].filter((p) => p !== 'dev/null');
}

function isPathAllowed(filePath) {
  const normalized = filePath.replace(/^\//, '');
  return SAFE_PATH_ALLOWLIST.some((allowed) => {
    if (allowed.endsWith('/')) {
      return normalized.startsWith(allowed) || normalized === allowed.slice(0, -1);
    }
    return normalized === allowed;
  });
}

function isPathRestricted(filePath) {
  const normalized = filePath.replace(/^\//, '');
  return RESTRICTED_PATHS.some((restricted) => {
    if (restricted.endsWith('/')) {
      return normalized.startsWith(restricted) || normalized === restricted.slice(0, -1);
    }
    return normalized === restricted;
  });
}

function validatePatch(diff) {
  const paths = extractDiffPaths(diff);
  const restrictedViolations = [];
  const nonAllowlistedViolations = [];

  for (const p of paths) {
    if (isPathRestricted(p)) {
      restrictedViolations.push(p);
    } else if (!isPathAllowed(p)) {
      nonAllowlistedViolations.push(p);
    }
  }

  const violations = [...restrictedViolations, ...nonAllowlistedViolations];
  return {
    safe: violations.length === 0,
    paths,
    violations,
    restrictedViolations,
    nonAllowlistedViolations,
  };
}

// ---------------------------------------------------------------------------
// Patch application
// ---------------------------------------------------------------------------

function applyPatch(diff) {
  const tmpPatch = path.join('/tmp', `autofix-${Date.now()}.patch`);
  fs.writeFileSync(tmpPatch, diff, 'utf8');
  try {
    execSync(`git apply --check "${tmpPatch}"`, { encoding: 'utf8', stdio: 'pipe' });
    execSync(`git apply "${tmpPatch}"`, { encoding: 'utf8', stdio: 'inherit' });
    return true;
  } catch (err) {
    log('error', `Patch apply failed: ${err.message}`);
    return false;
  } finally {
    try { fs.unlinkSync(tmpPatch); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args) {
  console.log(`[git] git ${args}`);
  return execSync(`git ${args}`, { encoding: 'utf8', stdio: 'inherit' });
}

function gitCapture(args) {
  return execSync(`git ${args}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
}

// ---------------------------------------------------------------------------
// GitHub REST API
// ---------------------------------------------------------------------------

function githubAPI(method, endpoint, body = null) {
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}${endpoint}`,
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'auto-remediate-bot/1.0',
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

async function createPullRequest({ title, body, head, base, labels }) {
  log('info', `Creating PR: ${head} → ${base}`);
  const pr = await githubAPI('POST', '/pulls', { title, body, head, base, draft: false });
  if (labels && labels.length > 0) {
    await githubAPI('POST', `/issues/${pr.number}/labels`, { labels });
  }
  log('info', `PR created: ${pr.html_url}`, { prNumber: pr.number, url: pr.html_url });
  return pr;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('info', 'Auto-remediation started');

  // ── Attempt guard ──────────────────────────────────────────────────────────
  const attempts = loadAttempts();
  log('info', `Remediation attempt ${attempts + 1} / ${MAX_ATTEMPTS}`, {
    attempts,
    maxAttempts: MAX_ATTEMPTS,
  });

  if (attempts >= MAX_ATTEMPTS) {
    log('error', `MAX_ATTEMPTS (${MAX_ATTEMPTS}) reached for branch "${FAILING_BRANCH}". Aborting.`, {
      action: 'abort',
      reason: 'max_attempts_exceeded',
    });
    process.exit(1);
  }

  saveAttempts(attempts + 1);

  // ── Read artifacts ─────────────────────────────────────────────────────────
  log('info', 'Reading failure artifacts', { dir: ARTIFACTS_DIR });
  let artifacts;
  try {
    artifacts = readArtifacts();
    log('info', `Loaded ${Object.keys(artifacts).length} artifact file(s)`, {
      files: Object.keys(artifacts),
    });
  } catch (err) {
    log('error', `Failed to read artifacts: ${err.message}`);
    process.exit(1);
  }

  // ── Read prompt template ───────────────────────────────────────────────────
  log('info', 'Reading remediation prompt template', { path: REMEDIATION_PROMPT_PATH });
  let templateContent;
  try {
    templateContent = fs.readFileSync(REMEDIATION_PROMPT_PATH, 'utf8');
  } catch (err) {
    log('error', `Failed to read remediation prompt template: ${err.message}`);
    process.exit(1);
  }

  const prompt = buildPrompt(templateContent, artifacts);

  // ── Call Anthropic API ─────────────────────────────────────────────────────
  log('info', 'Calling Anthropic API for remediation patch');
  let rawResponse;
  try {
    rawResponse = await callAnthropicAPI(prompt);
  } catch (err) {
    log('error', `Anthropic API call failed: ${err.message}`);
    process.exit(1);
  }

  // ── Extract diff ───────────────────────────────────────────────────────────
  const diff = extractUnifiedDiff(rawResponse);
  if (!diff) {
    log('error', 'No unified diff found in Anthropic response', {
      responseSample: rawResponse.slice(0, 500),
    });
    process.exit(1);
  }

  // Check if Claude signalled no safe fix is available
  if (diff.includes('NO_SAFE_FIX_AVAILABLE')) {
    log('warn', 'Claude indicated no safe fix is available for the failing tests.', {
      action: 'abort',
      reason: 'no_safe_fix_available',
      diff,
    });
    process.exit(0);
  }

  log('info', 'Unified diff extracted', { diffLines: diff.split('\n').length });

  // ── Validate patch ─────────────────────────────────────────────────────────
  log('info', 'Validating patch against safe allowlist');
  const validation = validatePatch(diff);
  log('info', 'Patch validation result', {
    safe: validation.safe,
    paths: validation.paths,
    violations: validation.violations,
    restrictedViolations: validation.restrictedViolations,
  });

  const timestamp = Date.now();
  const baseBranch = 'main';

  if (validation.safe) {
    // ── SAFE PATH ────────────────────────────────────────────────────────────
    const autofixBranch = `autofix/${timestamp}`;
    log('info', `Patch is safe. Creating branch ${autofixBranch}`);

    try {
      git(`checkout -b ${autofixBranch}`);
    } catch (err) {
      log('error', `Failed to create branch: ${err.message}`);
      process.exit(1);
    }

    const applied = applyPatch(diff);
    if (!applied) {
      log('error', 'Patch could not be applied cleanly.', {
        action: 'abort',
        reason: 'patch_apply_failed',
      });
      try { git(`checkout ${FAILING_BRANCH}`); } catch { /* best-effort rollback */ }
      process.exit(1);
    }

    git('add -A');

    const commitMsg = [
      `fix: auto-remediation patch for failing tests [run ${GITHUB_RUN_ID}]`,
      '',
      `Generated by auto_remediate.js from failure artifacts on branch ${FAILING_BRANCH}.`,
      `Modified paths: ${validation.paths.join(', ')}`,
    ].join('\n');

    try {
      execSync(`git commit -m ${JSON.stringify(commitMsg)}`, { stdio: 'inherit', encoding: 'utf8' });
    } catch (err) {
      log('error', `git commit failed: ${err.message}`);
      process.exit(1);
    }

    try {
      git(`push -u origin ${autofixBranch}`);
    } catch (err) {
      log('error', `git push failed: ${err.message}`);
      process.exit(1);
    }

    const prTitle = `fix: auto-remediation for "${FAILING_BRANCH}" [run ${GITHUB_RUN_ID}]`;
    const prBody = [
      '## Auto-Remediation PR',
      '',
      `**Triggering branch:** \`${FAILING_BRANCH}\``,
      `**GitHub Run ID:** ${GITHUB_RUN_ID}`,
      `**Attempt:** ${attempts + 1} / ${MAX_ATTEMPTS}`,
      '',
      '### Changed Files',
      validation.paths.map((p) => `- \`${p}\``).join('\n'),
      '',
      '### Validation',
      '- All changed paths are within the safe allowlist.',
      '- No restricted paths were modified.',
      '- Patch generated by Claude AI from failure artifacts.',
      '',
      '### Auto-Merge Eligibility',
      'This PR is eligible for auto-merge once all CI checks pass.',
      '',
      '> Generated by `scripts/auto_remediate.js`',
    ].join('\n');

    try {
      await createPullRequest({
        title: prTitle,
        body: prBody,
        head: autofixBranch,
        base: baseBranch,
        labels: ['auto-remediation'],
      });
    } catch (err) {
      log('error', `Failed to create PR: ${err.message}`);
      process.exit(1);
    }

    log('info', 'Auto-remediation complete — safe PR opened', { branch: autofixBranch });

  } else {
    // ── UNSAFE PATH ──────────────────────────────────────────────────────────
    const reviewBranch = `autofix/manual-review-${timestamp}`;

    log('warn', 'Patch touches restricted or non-allowlisted paths. Opening PR for manual review.', {
      violations: validation.violations,
      restrictedViolations: validation.restrictedViolations,
      nonAllowlistedViolations: validation.nonAllowlistedViolations,
      action: 'manual_review_required',
      reason: 'patch_touches_restricted_or_non_allowlisted_paths',
    });

    try {
      git(`checkout -b ${reviewBranch}`);
      applyPatch(diff);
      git('add -A');
      const commitMsg = [
        `fix(manual-review): auto-remediation patch requires human review [run ${GITHUB_RUN_ID}]`,
        '',
        'WARNING: Patch touches restricted or non-allowlisted paths.',
        'Auto-merge is BLOCKED. Manual security review required before merge.',
        `Restricted violations: ${validation.restrictedViolations.join(', ') || 'none'}`,
        `Non-allowlisted violations: ${validation.nonAllowlistedViolations.join(', ') || 'none'}`,
      ].join('\n');
      execSync(`git commit -m ${JSON.stringify(commitMsg)}`, { stdio: 'inherit', encoding: 'utf8' });
      git(`push -u origin ${reviewBranch}`);
    } catch (err) {
      log('error', `Failed to create manual-review branch/push: ${err.message}`);
      process.exit(1);
    }

    const prTitle = `fix(manual-review): auto-remediation requires human review [run ${GITHUB_RUN_ID}]`;
    const prBody = [
      '## Auto-Remediation PR — Manual Review Required',
      '',
      '> **This PR has been blocked from auto-merge because the generated patch',
      '> touches restricted or non-allowlisted paths.**',
      '> **A human must review and approve before this PR can be merged.**',
      '',
      `**Triggering branch:** \`${FAILING_BRANCH}\``,
      `**GitHub Run ID:** ${GITHUB_RUN_ID}`,
      `**Attempt:** ${attempts + 1} / ${MAX_ATTEMPTS}`,
      '',
      '### Violation Details',
      '',
      '#### Restricted Paths Touched (never auto-modify)',
      validation.restrictedViolations.length > 0
        ? validation.restrictedViolations.map((p) => `- \`${p}\``).join('\n')
        : '_None_',
      '',
      '#### Non-Allowlisted Paths',
      validation.nonAllowlistedViolations.length > 0
        ? validation.nonAllowlistedViolations.map((p) => `- \`${p}\``).join('\n')
        : '_None_',
      '',
      '### Safe Allowlist (auto-merge eligible)',
      SAFE_PATH_ALLOWLIST.map((p) => `- \`${p}\``).join('\n'),
      '',
      '### Restricted Paths (auto-merge always blocked)',
      RESTRICTED_PATHS.map((p) => `- \`${p}\``).join('\n'),
      '',
      '### Auto-Merge Status',
      '**BLOCKED** — Do not merge without manual security review.',
      '',
      '> Generated by `scripts/auto_remediate.js`',
    ].join('\n');

    try {
      await createPullRequest({
        title: prTitle,
        body: prBody,
        head: reviewBranch,
        base: baseBranch,
        labels: ['auto-remediation', 'manual-review-required'],
      });
    } catch (err) {
      log('error', `Failed to create manual-review PR: ${err.message}`);
      process.exit(1);
    }

    log('warn', 'Manual review PR opened. Auto-merge is blocked.', {
      branch: reviewBranch,
      violations: validation.violations,
    });

    // Exit 0 — the PR being open for review is the intended outcome.
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[auto_remediate] Unhandled error:', err);
  process.exit(1);
});
