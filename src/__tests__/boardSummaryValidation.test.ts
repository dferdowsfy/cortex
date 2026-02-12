/**
 * Complyze Prompt 5: Board Summary Validation Tests
 */

import { describe, it, expect } from "vitest";
import { validateBoardSummary } from "../boardSummaryValidation.js";
import {
  validBoardSummaryResponse,
  meridianBoardSummaryRequest,
  buildBoardSummaryResponse,
  validPortfolioSnapshot,
  validBoardSummary,
  validBoardSummaryMetadata,
  validNarrative,
  validAppendixData,
  validReportMetadata,
  validChangesSinceLastReport,
  validFindingsDetail,
  validActionItems,
  buildPortfolioSnapshot,
} from "./boardSummaryFixtures.js";
import type {
  BoardSummaryResponse,
  BoardSummaryRequest,
  PortfolioSnapshot,
  BoardSummary,
} from "../boardSummarySchema.js";

describe("validateBoardSummary", () => {
  const request = meridianBoardSummaryRequest();

  it("accepts a fully valid response", () => {
    const response = validBoardSummaryResponse();
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ── Rule 1: tools_by_risk_tier sums to total_tools_registered ──

  it("rejects when tools_by_risk_tier does not sum to total", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        portfolio_snapshot: buildPortfolioSnapshot({
          total_tools_registered: 5,
          tools_by_risk_tier: { critical: 1, high: 1, moderate: 1, low: 0 },
        }),
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("tools_by_risk_tier sum")
    );
  });

  // ── Rule 2: tools_by_governance_status sums to total_tools_registered ──

  it("rejects when tools_by_governance_status does not sum to total", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        portfolio_snapshot: buildPortfolioSnapshot({
          total_tools_registered: 5,
          tools_by_governance_status: {
            managed: 1,
            partially_managed: 1,
            unmanaged: 1,
            shadow_ai: 0,
          },
        }),
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("tools_by_governance_status sum")
    );
  });

  // ── Rule 3: remediation counts sum to total_recommendations ──

  it("rejects when remediation counts do not sum to total", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        portfolio_snapshot: buildPortfolioSnapshot({
          total_recommendations: 20,
          recommendations_completed: 7,
          recommendations_in_progress: 4,
          recommendations_not_started: 5,
          recommendations_deferred: 1,
        }),
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Remediation counts sum")
    );
  });

  // ── Rule 4: remediation_completion_percentage correct ──

  it("rejects incorrect remediation_completion_percentage", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        portfolio_snapshot: buildPortfolioSnapshot({
          total_recommendations: 17,
          recommendations_completed: 7,
          recommendations_in_progress: 4,
          recommendations_not_started: 5,
          recommendations_deferred: 1,
          remediation_completion_percentage: 90.0,
        }),
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("remediation_completion_percentage")
    );
  });

  it("accepts remediation_completion_percentage within 0.5 tolerance", () => {
    // 7/17 = 41.176...  fixture says 41.2 which is within 0.5
    const response = validBoardSummaryResponse();
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(true);
  });

  it("handles zero total_recommendations for percentage check", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        portfolio_snapshot: buildPortfolioSnapshot({
          total_tools_registered: 3,
          total_recommendations: 0,
          recommendations_completed: 0,
          recommendations_in_progress: 0,
          recommendations_not_started: 0,
          recommendations_deferred: 0,
          remediation_completion_percentage: 0,
        }),
      },
    });
    const result = validateBoardSummary(response, request);
    // Should not error on percentage — 0/0 → expect 0
    const percentErrors = result.errors.filter((e) =>
      e.includes("remediation_completion_percentage")
    );
    expect(percentErrors).toHaveLength(0);
  });

  // ── Rule 5: Critical/High flags appear in findings_detail ──

  it("rejects when Critical/High flag is missing from findings_detail", () => {
    const findings = validFindingsDetail().filter(
      (f) => f.flag_title !== "Client Data Exposed to Vendor Model Training"
    );
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        narrative: {
          ...validNarrative(),
          critical_and_high_findings: {
            narrative: validNarrative().critical_and_high_findings.narrative,
            findings_detail: findings,
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Client Data Exposed to Vendor Model Training")
    );
  });

  // ── Rule 6: Every tool in appendix ──

  it("rejects when tool is missing from appendix", () => {
    const table = validAppendixData().tool_summary_table.filter(
      (t) => t.tool_name !== "Otter.ai"
    );
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        appendix_data: {
          ...validAppendixData(),
          tool_summary_table: table,
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Tool "Otter.ai" is missing from appendix')
    );
  });

  // ── Rule 7: Chart data consistency ──

  it("rejects when risk_distribution_data values are inconsistent", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        appendix_data: {
          ...validAppendixData(),
          risk_distribution_data: {
            labels: ["Critical", "High", "Moderate", "Low"],
            values: [2, 1, 1, 0], // Wrong: critical=2 but snapshot says 1
            chart_type: "donut",
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("risk_distribution_data values do not match")
    );
  });

  it("rejects when governance_distribution_data values are inconsistent", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        appendix_data: {
          ...validAppendixData(),
          governance_distribution_data: {
            labels: [
              "Managed",
              "Partially Managed",
              "Unmanaged",
              "Shadow AI",
            ],
            values: [0, 1, 1, 0], // Wrong: managed=0 but snapshot says 1
            chart_type: "donut",
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        "governance_distribution_data values do not match"
      )
    );
  });

  it("rejects when remediation_progress_data values are inconsistent", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        appendix_data: {
          ...validAppendixData(),
          remediation_progress_data: {
            labels: ["Completed", "In Progress", "Not Started", "Deferred"],
            values: [7, 4, 5, 0], // Wrong: deferred=0 but snapshot says 1
            chart_type: "bar",
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("remediation_progress_data values do not match")
    );
  });

  it("rejects chart data with wrong number of values", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        appendix_data: {
          ...validAppendixData(),
          risk_distribution_data: {
            labels: ["Critical", "High"],
            values: [1, 1],
            chart_type: "donut",
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("should have 4 values")
    );
  });

  // ── Rule 8: changes_since_last_report.included consistency ──

  it("rejects included=true on first report", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        report_metadata: {
          ...validReportMetadata(),
          is_first_report: true,
        },
        changes_since_last_report: {
          ...validChangesSinceLastReport(),
          included: true,
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        "changes_since_last_report.included must be false"
      )
    );
  });

  // ── Rule 9: No framework terms in narrative ──

  it("rejects framework term in executive_overview", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        narrative: {
          ...validNarrative(),
          executive_overview:
            "The organization complies with NIST AI RMF guidelines.",
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Framework term "NIST"')
    );
  });

  it("rejects framework term in risk_posture_analysis", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        narrative: {
          ...validNarrative(),
          risk_posture_analysis:
            "According to ISO 27001 standards, the organization should improve.",
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Framework term "ISO 27001"')
    );
  });

  it("rejects SOC 2 in narrative", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        narrative: {
          ...validNarrative(),
          remediation_progress:
            "The vendor has SOC 2 certification so risk is low.",
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Framework term "SOC 2"')
    );
  });

  it("rejects HIPAA in findings narrative", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        narrative: {
          ...validNarrative(),
          critical_and_high_findings: {
            ...validNarrative().critical_and_high_findings,
            narrative:
              "This tool is not HIPAA eligible at the current tier.",
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Framework term "HIPAA"')
    );
  });

  // ── Rule 10: Action items consistency with no_action_needed ──

  it("rejects no_action_needed=false with empty action_items", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        narrative: {
          ...validNarrative(),
          leadership_action_items: {
            narrative: "Items need attention.",
            action_items: [],
            no_action_needed: false,
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        "no_action_needed is false but action_items array is empty"
      )
    );
  });

  it("rejects no_action_needed=true with non-empty action_items", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        narrative: {
          ...validNarrative(),
          leadership_action_items: {
            narrative: "No action needed.",
            action_items: validActionItems(),
            no_action_needed: true,
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        "no_action_needed is true but action_items array is not empty"
      )
    );
  });

  // ── Rule 11: risk_trend_data on first report ──

  it("rejects risk_trend_data included on first report", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        appendix_data: {
          ...validAppendixData(),
          risk_trend_data: {
            included: true,
            periods: ["Q4 2025", "Q1 2026"],
            critical_count: [2, 1],
            high_count: [1, 1],
            moderate_count: [1, 1],
            low_count: [0, 0],
            chart_type: "stacked_bar",
          },
        },
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        "risk_trend_data.included must be false when is_first_report"
      )
    );
  });

  // ── Rule 12: metadata.tools_included matches request ──

  it("rejects mismatched tools_included count", () => {
    const response = buildBoardSummaryResponse({
      metadata_overrides: {
        ...validBoardSummaryMetadata(),
        tools_included: 5,
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("metadata.tools_included")
    );
  });

  // ── Multiple errors accumulated ──

  it("accumulates multiple errors", () => {
    const response = buildBoardSummaryResponse({
      board_summary_overrides: {
        ...validBoardSummary(),
        portfolio_snapshot: buildPortfolioSnapshot({
          total_tools_registered: 10, // wrong
          total_recommendations: 99, // wrong
        }),
        narrative: {
          ...validNarrative(),
          executive_overview:
            "Per NIST guidelines, risk is elevated.", // framework term
        },
      },
      metadata_overrides: {
        ...validBoardSummaryMetadata(),
        tools_included: 99, // wrong
      },
    });
    const result = validateBoardSummary(response, request);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
