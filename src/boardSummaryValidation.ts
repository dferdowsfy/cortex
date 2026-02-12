/**
 * Complyze Prompt 5: Board Summary Narrative
 * Business rule validation for board summary reports
 */

import type {
  BoardSummaryResponse,
  BoardSummaryRequest,
  BoardSummaryValidationResult,
} from "./boardSummarySchema.js";

/**
 * Regulatory framework terms that must not appear in narrative sections
 */
const FRAMEWORK_TERMS = [
  "NIST",
  "ISO 27001",
  "ISO 42001",
  "EU AI Act",
  "SOC 2",
  "SOC2",
  "HIPAA",
  "GDPR",
  "CCPA",
  "PCI DSS",
  "PCI-DSS",
  "FedRAMP",
  "AI RMF",
  "RMF",
];

/**
 * Validate a board summary response against business rules
 * Implements 12 validation requirements from spec
 */
export function validateBoardSummary(
  response: BoardSummaryResponse,
  request: BoardSummaryRequest
): BoardSummaryValidationResult {
  const errors: string[] = [];
  const summary = response.board_summary;
  const snapshot = summary.portfolio_snapshot;

  // Rule 1: tools_by_risk_tier values sum to total_tools_registered
  const riskTierSum =
    snapshot.tools_by_risk_tier.critical +
    snapshot.tools_by_risk_tier.high +
    snapshot.tools_by_risk_tier.moderate +
    snapshot.tools_by_risk_tier.low;

  if (riskTierSum !== snapshot.total_tools_registered) {
    errors.push(
      `tools_by_risk_tier sum (${riskTierSum}) does not equal total_tools_registered (${snapshot.total_tools_registered})`
    );
  }

  // Rule 2: tools_by_governance_status values sum to total_tools_registered
  const govStatusSum =
    snapshot.tools_by_governance_status.managed +
    snapshot.tools_by_governance_status.partially_managed +
    snapshot.tools_by_governance_status.unmanaged +
    snapshot.tools_by_governance_status.shadow_ai;

  if (govStatusSum !== snapshot.total_tools_registered) {
    errors.push(
      `tools_by_governance_status sum (${govStatusSum}) does not equal total_tools_registered (${snapshot.total_tools_registered})`
    );
  }

  // Rule 3: remediation counts sum to total_recommendations
  const remediationSum =
    snapshot.recommendations_completed +
    snapshot.recommendations_in_progress +
    snapshot.recommendations_not_started +
    snapshot.recommendations_deferred;

  if (remediationSum !== snapshot.total_recommendations) {
    errors.push(
      `Remediation counts sum (${remediationSum}) does not equal total_recommendations (${snapshot.total_recommendations})`
    );
  }

  // Rule 4: remediation_completion_percentage is mathematically correct
  const expectedPercentage =
    snapshot.total_recommendations > 0
      ? (snapshot.recommendations_completed / snapshot.total_recommendations) *
        100
      : 0;

  if (Math.abs(snapshot.remediation_completion_percentage - expectedPercentage) > 0.5) {
    errors.push(
      `remediation_completion_percentage (${snapshot.remediation_completion_percentage}) does not match calculated value (${expectedPercentage.toFixed(1)})`
    );
  }

  // Rule 5: Every Critical and High flag from all tool assessments appears in findings_detail
  const allCriticalHighFlags = extractCriticalHighFlags(request);
  const findingsDetail =
    summary.narrative.critical_and_high_findings.findings_detail;
  const findingTitles = new Set(findingsDetail.map((f) => f.flag_title));

  for (const flag of allCriticalHighFlags) {
    if (!findingTitles.has(flag.title)) {
      errors.push(
        `Critical/High flag "${flag.title}" from ${flag.tool_name} is missing from findings_detail`
      );
    }
  }

  // Rule 6: Every tool in portfolio appears in appendix tool_summary_table
  const appendixToolNames = new Set(
    summary.appendix_data.tool_summary_table.map((t) => t.tool_name)
  );

  for (const assessment of request.tool_assessments) {
    const toolName = assessment.tool_profile?.tool_profile?.tool_name;
    if (toolName && !appendixToolNames.has(toolName)) {
      errors.push(
        `Tool "${toolName}" is missing from appendix tool_summary_table`
      );
    }
  }

  // Rule 7: Chart data values are consistent with portfolio_snapshot counts
  const riskDistValues = summary.appendix_data.risk_distribution_data.values;
  if (riskDistValues.length === 4) {
    if (
      riskDistValues[0] !== snapshot.tools_by_risk_tier.critical ||
      riskDistValues[1] !== snapshot.tools_by_risk_tier.high ||
      riskDistValues[2] !== snapshot.tools_by_risk_tier.moderate ||
      riskDistValues[3] !== snapshot.tools_by_risk_tier.low
    ) {
      errors.push(
        "risk_distribution_data values do not match tools_by_risk_tier"
      );
    }
  } else {
    errors.push(
      `risk_distribution_data should have 4 values, got ${riskDistValues.length}`
    );
  }

  const govDistValues =
    summary.appendix_data.governance_distribution_data.values;
  if (govDistValues.length === 4) {
    if (
      govDistValues[0] !== snapshot.tools_by_governance_status.managed ||
      govDistValues[1] !== snapshot.tools_by_governance_status.partially_managed ||
      govDistValues[2] !== snapshot.tools_by_governance_status.unmanaged ||
      govDistValues[3] !== snapshot.tools_by_governance_status.shadow_ai
    ) {
      errors.push(
        "governance_distribution_data values do not match tools_by_governance_status"
      );
    }
  } else {
    errors.push(
      `governance_distribution_data should have 4 values, got ${govDistValues.length}`
    );
  }

  const remProgressValues =
    summary.appendix_data.remediation_progress_data.values;
  if (remProgressValues.length === 4) {
    if (
      remProgressValues[0] !== snapshot.recommendations_completed ||
      remProgressValues[1] !== snapshot.recommendations_in_progress ||
      remProgressValues[2] !== snapshot.recommendations_not_started ||
      remProgressValues[3] !== snapshot.recommendations_deferred
    ) {
      errors.push(
        "remediation_progress_data values do not match portfolio_snapshot remediation counts"
      );
    }
  } else {
    errors.push(
      `remediation_progress_data should have 4 values, got ${remProgressValues.length}`
    );
  }

  // Rule 8: changes_since_last_report.included = false when is_first_report = true
  if (
    summary.report_metadata.is_first_report &&
    summary.changes_since_last_report.included
  ) {
    errors.push(
      "changes_since_last_report.included must be false when is_first_report is true"
    );
  }

  // Rule 9: No regulatory framework names in narrative sections
  const narrativeSections = collectNarrativeText(summary.narrative);
  for (const term of FRAMEWORK_TERMS) {
    for (const { section, text } of narrativeSections) {
      if (text.includes(term)) {
        errors.push(
          `Framework term "${term}" found in narrative section "${section}"`
        );
      }
    }
  }

  // Rule 10: action_items array is not empty when no_action_needed = false (and vice versa)
  const actionItems = summary.narrative.leadership_action_items;
  if (!actionItems.no_action_needed && actionItems.action_items.length === 0) {
    errors.push(
      "no_action_needed is false but action_items array is empty"
    );
  }
  if (actionItems.no_action_needed && actionItems.action_items.length > 0) {
    errors.push(
      "no_action_needed is true but action_items array is not empty"
    );
  }

  // Rule 11: risk_trend_data.included should be false when is_first_report = true
  if (
    summary.report_metadata.is_first_report &&
    summary.appendix_data.risk_trend_data.included
  ) {
    errors.push(
      "risk_trend_data.included must be false when is_first_report is true"
    );
  }

  // Rule 12: metadata.tools_included matches the number of tool assessments
  if (response.metadata.tools_included !== request.tool_assessments.length) {
    errors.push(
      `metadata.tools_included (${response.metadata.tools_included}) does not match tool_assessments count (${request.tool_assessments.length})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract all Critical and High severity flags from all tool assessments
 */
function extractCriticalHighFlags(
  request: BoardSummaryRequest
): Array<{ tool_name: string; title: string; severity: string }> {
  const flags: Array<{ tool_name: string; title: string; severity: string }> =
    [];

  for (const assessment of request.tool_assessments) {
    const toolName =
      assessment.tool_profile?.tool_profile?.tool_name ?? "Unknown";
    const flagList = assessment.flag_report?.flags ?? [];

    for (const flag of flagList) {
      if (flag.severity === "Critical" || flag.severity === "High") {
        flags.push({
          tool_name: toolName,
          title: flag.title,
          severity: flag.severity,
        });
      }
    }
  }

  return flags;
}

/**
 * Collect all narrative text fields with their section names for framework term checking
 */
function collectNarrativeText(
  narrative: BoardSummaryResponse["board_summary"]["narrative"]
): Array<{ section: string; text: string }> {
  return [
    { section: "executive_overview", text: narrative.executive_overview },
    { section: "portfolio_overview", text: narrative.portfolio_overview },
    {
      section: "risk_posture_analysis",
      text: narrative.risk_posture_analysis,
    },
    {
      section: "critical_and_high_findings.narrative",
      text: narrative.critical_and_high_findings.narrative,
    },
    {
      section: "remediation_progress",
      text: narrative.remediation_progress,
    },
    {
      section: "leadership_action_items.narrative",
      text: narrative.leadership_action_items.narrative,
    },
    {
      section: "outlook_and_next_steps",
      text: narrative.outlook_and_next_steps,
    },
  ];
}
