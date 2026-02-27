'use strict';

/**
 * aggregate-reports.js
 * Reads all JSON report files from the reports/ directory and produces
 * a unified summary report with pass/fail totals and failure details.
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', '..', 'reports');
const OUTPUT_PATH = path.join(REPORTS_DIR, `aggregate-${Date.now()}.json`);

function readReports() {
  if (!fs.existsSync(REPORTS_DIR)) {
    console.warn('No reports directory found.');
    return [];
  }

  const files = fs.readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('aggregate-'))
    .map((f) => path.join(REPORTS_DIR, f));

  const reports = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      reports.push({ file: path.basename(file), ...data });
    } catch (err) {
      console.warn(`Could not parse report: ${file} — ${err.message}`);
    }
  }

  return reports;
}

function aggregate(reports) {
  const summary = {
    timestamp: new Date().toISOString(),
    total_reports: reports.length,
    overall_pass: true,
    suites: [],
    failure_summary: [],
    all_results: [],
  };

  for (const report of reports) {
    const suite = {
      file: report.file,
      timestamp: report.timestamp,
      type: detectReportType(report.file),
      results: [],
      passed: 0,
      failed: 0,
      failures: [],
    };

    const results = flattenResults(report);
    for (const r of results) {
      suite.results.push(r);
      summary.all_results.push({ suite: suite.type, ...r });

      if (r.passed === true) {
        suite.passed++;
      } else if (r.passed === false) {
        suite.failed++;
        suite.failures.push({ name: r.name || r.domain || r.test || r.target || 'unknown', reason: r.failure_reason });
        summary.failure_summary.push({
          suite: suite.type,
          name: r.name || r.domain || r.test || r.target || 'unknown',
          reason: r.failure_reason,
        });
        summary.overall_pass = false;
      }
    }

    summary.suites.push(suite);
  }

  return summary;
}

function detectReportType(filename) {
  if (filename.includes('domain')) return 'domain';
  if (filename.includes('api')) return 'api';
  if (filename.includes('attach')) return 'attachments';
  if (filename.includes('bypass')) return 'bypass';
  if (filename.includes('discovery')) return 'discovery';
  return 'unknown';
}

function flattenResults(report) {
  const results = [];

  if (Array.isArray(report.results)) {
    for (const r of report.results) {
      if (r.files && Array.isArray(r.files)) {
        // Attachment test: flatten file results
        for (const f of r.files) {
          results.push({ name: `${r.target}/${f.file}`, ...f });
        }
      } else {
        results.push(r);
      }
    }
  }

  if (Array.isArray(report.allFiles)) {
    for (const f of report.allFiles) {
      if (!results.find((r) => r.file === f.file)) {
        results.push(f);
      }
    }
  }

  return results;
}

function printSummary(summary) {
  console.log('\n=== Aggregate Test Report ===');
  console.log(`Generated: ${summary.timestamp}`);
  console.log(`Reports processed: ${summary.total_reports}`);
  console.log(`Overall status: ${summary.overall_pass ? 'PASS' : 'FAIL'}\n`);

  for (const suite of summary.suites) {
    const total = suite.passed + suite.failed;
    const pct = total > 0 ? Math.round((suite.passed / total) * 100) : 0;
    const status = suite.failed === 0 ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${suite.type.padEnd(15)} ${suite.passed}/${total} (${pct}%)`);
  }

  if (summary.failure_summary.length > 0) {
    console.log('\nFailures:');
    for (const f of summary.failure_summary) {
      console.error(`  [${f.suite}] ${f.name}: ${f.reason}`);
    }
  }

  console.log(`\nFull report: ${OUTPUT_PATH}`);
}

function run() {
  const reports = readReports();
  if (reports.length === 0) {
    console.log('No reports found to aggregate.');
    return;
  }

  const summary = aggregate(reports);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2));
  printSummary(summary);

  if (!summary.overall_pass) {
    process.exit(1);
  }
}

run();
