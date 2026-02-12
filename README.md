# Complyze — AI Governance Assessment Pipeline

Complete TypeScript implementation of the Complyze AI risk-assessment pipeline. Comprises five prompts that progressively refine AI tool risk analysis from initial intelligence gathering through actionable remediation plans and executive board-level reporting.

## Pipeline Position

```
[User adds tool] → PROMPT 1: Tool Intelligence Extraction  ✓ COMPLETE
                        ↓
              [User answers enrichment questions]
                        ↓
                   PROMPT 2: Risk Classification            ✓ COMPLETE
                        ↓
                   PROMPT 3: Flag Generation                ✓ COMPLETE
                        ↓
                   PROMPT 4: Recommendation Engine          ✓ COMPLETE
                        ↓
         [All locked assessments aggregated]
                        ↓
                   PROMPT 5: Board Summary Narrative        ✓ COMPLETE
```

## Quick Start

```bash
# Install dependencies
npm install

# Copy and fill in your Anthropic API key
cp .env.example .env

# Run tests
npm test

# Type-check
npm run typecheck

# Build
npm run build
```

## Usage

```ts
import { analyzeAITool } from "complyze";

const result = await analyzeAITool({
  tool_name: "ChatGPT",
  vendor: "OpenAI",
  tier: "Free",
});

if (result.ok) {
  console.log(result.profile); // ToolIntelligenceProfile
} else {
  console.error(result.errors);
}
```

### Advanced: Inject a Custom LLM Caller

For testing or using a different model provider:

```ts
import { extractToolIntelligence, type LLMCaller } from "complyze";

const myCaller: LLMCaller = async (system, user) => {
  // Call any LLM API and return the raw text response
  return myCustomLLMCall(system, user);
};

const result = await extractToolIntelligence(
  { tool_name: "Notion AI", vendor: "Notion Labs", tier: "Team" },
  myCaller,
  { maxRetries: 2 },
);
```

## Architecture

| Module | Responsibility |
|---|---|
| **Prompt 1: Tool Intelligence Extraction** | |
| `schema.ts` | Zod schemas & TypeScript types for the Prompt 1 output JSON |
| `prompts.ts` | System prompt (with scoring rubric) and user prompt builder for Prompt 1 |
| `validation.ts` | Zod parsing + business-rule checks for Prompt 1 (tier override, unique IDs) |
| `extraction.ts` | LLM call orchestration, JSON parsing, retry loop for Prompt 1 |
| **Prompt 2: Risk Classification** | |
| `classificationSchema.ts` | Zod schemas & types for Prompt 2 input (enrichment answers) and output (risk classification) |
| `classificationPrompts.ts` | System prompt (with full rubric) and user prompt builder for Prompt 2 |
| `classificationValidation.ts` | Business-rule validation for Prompt 2 (tier overrides including DS=5+HO≥4→Critical, Shadow AI→High, score math, coverage consistency) |
| `classification.ts` | LLM call orchestration and retry loop for Prompt 2 |
| **Prompt 3: Flag Generation** | |
| `flagSchema.ts` | Zod schemas & types for flag reports, flags, and summaries |
| `flagPrompts.ts` | System prompt with 23 trigger rules and user prompt builder for Prompt 3 |
| `flagValidation.ts` | Business-rule validation for Prompt 3 (flag count 2-8, severity sorting, unique IDs, trigger rule validity) |
| `flags.ts` | LLM call orchestration and retry loop for Prompt 3 |
| **Prompt 4: Recommendation Engine** | |
| `recommendationSchema.ts` | Zod schemas & types for remediation plans, strategies, and recommendations |
| `recommendationPrompts.ts` | System prompt with generation rules and user prompt builder for Prompt 4 |
| `recommendationValidation.ts` | Business-rule validation for Prompt 4 (12 validation rules including dependency checks, coverage, consistency) |
| `recommendation.ts` | LLM call orchestration and retry loop for Prompt 4 |
| **Prompt 5: Board Summary Narrative** | |
| `boardSummarySchema.ts` | Zod schemas & types for board summary, portfolio snapshot, narrative sections, appendix data |
| `boardSummaryPrompts.ts` | System prompt with 7 core principles, 7 narrative section rules, tone calibration; user prompt builder |
| `boardSummaryValidation.ts` | Business-rule validation for Prompt 5 (12 rules: count consistency, chart data, framework terms, action items) |
| `boardSummary.ts` | LLM call orchestration and retry loop for Prompt 5 |
| **Infrastructure** | |
| `index.ts` | Public API barrel export |

### Prompt 2: Risk Classification

```ts
import {
  classifyToolRisk,
  type ClassificationRequest,
} from "complyze";

// After getting the profile from Prompt 1 and collecting enrichment answers:
const enrichment: ClassificationRequest = {
  enrichment_answers: [
    { question_id: "eq_01", question: "How many users?", answer: "21-50" },
    { question_id: "eq_02", question: "Data types?", answer: ["Client data"] },
  ],
  unanswered_question_ids: ["eq_03"],
};

const result = await classifyToolRisk(
  profile,
  enrichment,
  async (system, user) => myLLMCall(system, user)
);

if (result.ok) {
  console.log(result.classification.classification.overall_risk.tier);
  // → "High" | "Critical" | "Moderate" | "Low"
}
```

### Prompt 3: Flag Generation

```ts
import { generateFlags } from "complyze";

// After getting classification from Prompt 2:
const result = await generateFlags(
  {
    tool_profile: profile,
    risk_classification: classification,
  },
  async (system, user) => myLLMCall(system, user)
);

if (result.ok) {
  console.log(result.data.flag_report.flag_summary);
  // → { critical: 1, high: 3, medium: 2, low: 0, total: 6 }
}
```

### Prompt 4: Recommendation Engine

```ts
import { generateRecommendations } from "complyze";

// After getting flags from Prompt 3:
const result = await generateRecommendations(
  {
    tool_profile: profile,
    risk_classification: classification,
    flag_report: flags,
  },
  async (system, user) => myLLMCall(system, user)
);

if (result.ok) {
  console.log(result.data.remediation_plan.plan_summary);
  // → { total_recommendations: 8, quick_wins_available: 3, ... }
}
```

### Prompt 5: Board Summary Narrative

```ts
import { generateBoardSummary } from "complyze";

// After all tools are assessed and locked:
const result = await generateBoardSummary(
  {
    organization: {
      company_name: "Meridian Financial Advisors",
      industry: "Financial Services",
      employee_count: 800,
      report_period: "Q1 2026",
      report_type: "Quarterly",
      previous_report_date: null,
    },
    tool_assessments: [
      { tool_profile, risk_classification, flag_report, remediation_plan },
      // ... all locked tool assessments
    ],
  },
  async (system, user) => myLLMCall(system, user)
);

if (result.ok) {
  console.log(result.data.board_summary.narrative.executive_overview);
  // → "The organization's AI risk posture is elevated..."
  console.log(result.data.board_summary.narrative.leadership_action_items.action_items);
  // → [{ action_type: "Budget Approval", urgency: "Immediate", ... }]
}
```

## Output Schemas

### Prompt 1 — Tool Intelligence Profile

The profile includes:

- **tool_profile** — name, vendor, tier, category, capabilities, description
- **data_handling** — training, retention, residency, encryption, sharing
- **security_posture** — SOC 2, HIPAA, SSO, audit logging, access controls
- **enterprise_readiness** — enterprise tier availability and improvements
- **default_risk_assessment** — scores (1–5) across four dimensions with overall tier
- **known_risk_flags** — prioritized risks with severity and confidence
- **enrichment_questions** — follow-up questions for the compliance officer
- **tier_upgrade_note** — what upgrading to enterprise would fix
- **metadata** — timestamp, schema version, overall confidence

### Prompt 2 — Risk Classification

The classification includes:

- **dimensions** — final scores (1–5) for data sensitivity, decision impact, affected parties, human oversight — each with base score, modifiers, input basis (enrichment vs default), key inputs, and justification
- **governance_status** — level (Managed / Partially Managed / Unmanaged / Shadow AI) with gaps and justification
- **overall_risk** — final tier, average, tier-from-average, overrides applied, calculation trace, executive summary
- **score_comparison_to_defaults** — how each dimension changed from Prompt 1 defaults with direction and reason
- **enrichment_coverage** — answered/unanswered counts, confidence level, confidence note
- **reassessment_comparison** — previous scores, changes, tier change, change summary (for reassessments)

### Prompt 3 — Flag Report

The flag report includes:

- **flags** — 2-8 specific risk flags, each with flag_id, title, severity (Critical/High/Medium/Low), category (6 categories), trigger_rule (23 defined rules), description, and risk_summary
- **flag_summary** — counts by severity (critical, high, medium, low, total)
- **executive_summary** — plain-language summary of top risks and their implications

**23 Trigger Rules across 6 categories:**
- **Data Exposure (DE):** Training, retention, encryption, residency
- **Access Control (AC):** SSO, audit logging
- **Output Risk (OR):** Client-facing, no review, code generation
- **Governance Gap (GG):** Shadow AI, no approval, no policy
- **Regulatory Exposure (RE):** Contract violations, industry obligations, automated decisions
- **Vendor Risk (VR):** Tier mismatch, no security docs

### Prompt 4 — Remediation Plan

The remediation plan includes:

- **plan_summary** — counts (recommendations, strategies, flags addressed), projected risk tiers after quick wins and full remediation, executive summary
- **strategies** — 1-4 coherent strategy groups (e.g., "Immediate Risk Reduction", "Enterprise Tier Migration", "Governance Foundation") prioritized by impact-to-effort ratio
- **recommendations** — 2-15 specific, actionable recommendations with effort levels (Quick Win to Strategic Initiative), timeframes (Immediate to Long-term), types (Restrict/Upgrade/Policy/Process/Communicate/Monitor), detailed steps, owner suggestions, dependencies, and success criteria
- **implementation_sequence** — phased execution plan with milestones
- **risk_reduction_projection** — current state, projected state after quick wins, projected state after full remediation, residual risk note

### Prompt 5 — Board Summary

The board summary includes:

- **report_metadata** — company name, industry, report period, report type, timestamps, first-report flag
- **portfolio_snapshot** — total tools, estimated users, tools by risk tier, tools by governance status, tools by category, active flag counts, remediation completion counts and percentage
- **changes_since_last_report** — tools added/removed, tier changes, flags resolved/new, recommendations completed, posture trend (Improving/Stable/Deteriorating)
- **narrative** — 7 structured sections:
  - **executive_overview** — 3-5 sentence board briefing
  - **portfolio_overview** — AI footprint description with coverage gaps
  - **risk_posture_analysis** — risk concentration, systemic patterns, governance maturity
  - **critical_and_high_findings** — narrative + detailed finding list with plain-language descriptions
  - **remediation_progress** — completion status, milestones, delays
  - **leadership_action_items** — structured actions with type, cost, urgency, related tools
  - **outlook_and_next_steps** — expectations for next reporting period
- **appendix_data** — tool summary table, risk/governance/remediation chart data, risk trend data

## Risk Scoring Rubric

| Dimension | 1 (lowest) | 5 (highest) |
|---|---|---|
| Data Sensitivity | No user content processed | Sensitive/regulated data, no protections |
| Decision Impact | Informational only | Automated decisions with significant impact |
| Affected Parties | Individual user only | Public / vulnerable populations |
| Human Oversight | Always reviewed | Fully autonomous, no review |

**Overall tier:** avg 1–2 → Low, 2.1–3 → Moderate, 3.1–4 → High, 4.1–5 → Critical.  
**Override:** any dimension at 5 forces at least High.
**Override (Prompt 2):** data sensitivity = 5 AND human oversight ≥ 4 → Critical.
**Override (Prompt 2):** governance = Shadow AI → at least High.

## Validation

### Prompt 1 Validation

The validation layer checks:

1. **Structural** — all required fields present, correct types, valid enums
2. **Score range** — risk scores are integers 1–5
3. **Tier consistency** — `overall_default_tier` matches rubric calculation
4. **Minimum counts** — ≥ 1 risk flag, ≥ 3 enrichment questions
5. **Unique IDs** — enrichment question IDs must be unique

### Prompt 2 Validation

Additional business-rule checks:

1. **Score math** — `score = min(5, max(1, base_score + sum(modifiers)))`
2. **Dimension average** — stated average matches computed average
3. **Tier consistency** — final tier respects all three override rules
4. **tier_from_average** — matches rubric mapping from average alone
5. **Score comparison directions** — `increased`/`decreased`/`unchanged` matches actual delta
6. **Final score alignment** — comparison `final_score` matches dimension score
7. **Enrichment coverage math** — `answered + unanswered = total`
8. **Confidence consistency** — all answered → High; < half answered → not High
9. **Reassessment consistency** — `assessment_type` and `is_reassessment` must agree

On validation failure, the service retries the LLM call once (configurable).

## Testing

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

Tests across schema validation, business rules, prompt construction, and all five prompt pipelines (with mocked LLM calls).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for live calls) | Anthropic API key |

## API Configuration

| Parameter | Default (Prompt 1) | Default (Prompt 2) | Default (Prompt 3) | Default (Prompt 4) | Default (Prompt 5) | Notes |
|---|---|---|---|---|---|---|
| `model` | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-20250514` | `claude-sonnet-4-5-20250929` | Any Anthropic model |
| `temperature` | `0.1` | `0.0` | `0.1` | `0.2` | `0.3` | P2 deterministic, P5 highest for narrative quality |
| `maxTokens` | `4096` | `3000` | `3500` | `5000` | `8000` | P5 largest output in pipeline |
| `maxRetries` | `1` | `1` | `3` | `3` | `3` | Retry on validation failure |

## License

Proprietary — Complyze
