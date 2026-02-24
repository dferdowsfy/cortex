# Complyze Proxy Validation & Assurance Engine (PVAE)

Standalone governance harness for testing Complyze enforcement from an external boundary. 
Intended to run continuously in a CI environment and validate edge/network behaviors as a black box.

## Setup

1. Clone repo.
2. \`npm install\`
3. Copy \`.env.example\` to \`.env\` and add your secrets:
   - \`RESEND_API_KEY\`
   - \`VALIDATION_REPORT_EMAIL\`
   - \`VALIDATION_SCORE_ALERT_THRESHOLD\`

## Run

**Manual Governance Trigger**:
\`\`\`bash
npm run audit -- --apiBaseUrl=https://api.complyze.co --notify=true
\`\`\`

**Local Cron Strategy Example**:
To run this script automatically at 8:00 AM every day on a local server, add this to your \`crontab -e\`:
\`\`\`bash
0 8 * * * cd /path/to/complyze-pvae && npm install && npm run audit -- --apiBaseUrl=https://api.complyze.co --notify=true >> /var/log/pvae-audit.log 2>&1
\`\`\`

## GitHub Actions

The provided \`.github/workflows/daily-audit.yml\` schedules runs automatically.
Ensure you set the required Action Secrets:
- \`RESEND_API_KEY\`
- \`VALIDATION_REPORT_EMAIL\`

## Scoring

- Start at 100
- -30 for CRITICAL failures
- -15 for HIGH failures
- -5 for MEDIUM failures
- Known architectural limitations cap score status to \`DEGRADED\` (max healthy tier).
