/**
 * Complyze Prompt 5: Board Summary Schema Tests
 */

import { describe, it, expect } from "vitest";
import {
  BoardSummaryResponseSchema,
  BoardSummaryRequestSchema,
  ReportMetadataSchema,
  PortfolioSnapshotSchema,
  ChangesSinceLastReportSchema,
  NarrativeSchema,
  AppendixDataSchema,
  FindingDetailSchema,
  ActionItemSchema,
  ToolSummaryRowSchema,
  CategoryCountSchema,
  ChartDataSchema,
  RiskTrendDataSchema,
  ReportTypeSchema,
  PostureTrendSchema,
  ActionTypeSchema,
  UrgencySchema,
  RemediationStatusSchema,
  DataCompletenessSchema,
  OrganizationContextSchema,
  BoardSummaryMetadataSchema,
} from "../boardSummarySchema.js";
import {
  validBoardSummaryResponse,
  validPortfolioSnapshot,
  validReportMetadata,
  validChangesSinceLastReport,
  validNarrative,
  validAppendixData,
  validFindingsDetail,
  validActionItems,
  validToolSummaryTable,
  meridianBoardSummaryRequest,
  meridianOrganization,
  buildPortfolioSnapshot,
  buildReportMetadata,
  buildFindingDetail,
  buildActionItem,
} from "./boardSummaryFixtures.js";

// ── Enum Schemas ───────────────────────────────────────────────────

describe("Enum schemas", () => {
  it("accepts valid ReportType values", () => {
    expect(ReportTypeSchema.safeParse("Monthly").success).toBe(true);
    expect(ReportTypeSchema.safeParse("Quarterly").success).toBe(true);
    expect(ReportTypeSchema.safeParse("Ad Hoc").success).toBe(true);
  });

  it("rejects invalid ReportType", () => {
    expect(ReportTypeSchema.safeParse("Weekly").success).toBe(false);
  });

  it("accepts valid PostureTrend values", () => {
    expect(PostureTrendSchema.safeParse("Improving").success).toBe(true);
    expect(PostureTrendSchema.safeParse("Stable").success).toBe(true);
    expect(PostureTrendSchema.safeParse("Deteriorating").success).toBe(true);
  });

  it("rejects invalid PostureTrend", () => {
    expect(PostureTrendSchema.safeParse("Unknown").success).toBe(false);
  });

  it("accepts valid ActionType values", () => {
    expect(ActionTypeSchema.safeParse("Budget Approval").success).toBe(true);
    expect(ActionTypeSchema.safeParse("Policy Approval").success).toBe(true);
    expect(ActionTypeSchema.safeParse("Strategic Decision").success).toBe(true);
    expect(ActionTypeSchema.safeParse("Awareness Only").success).toBe(true);
  });

  it("accepts valid Urgency values", () => {
    expect(UrgencySchema.safeParse("Immediate").success).toBe(true);
    expect(UrgencySchema.safeParse("Next 30 Days").success).toBe(true);
    expect(UrgencySchema.safeParse("Next Quarter").success).toBe(true);
    expect(UrgencySchema.safeParse("Informational").success).toBe(true);
  });

  it("accepts valid RemediationStatus values", () => {
    expect(RemediationStatusSchema.safeParse("Not Started").success).toBe(true);
    expect(RemediationStatusSchema.safeParse("In Progress").success).toBe(true);
    expect(RemediationStatusSchema.safeParse("Completed").success).toBe(true);
    expect(RemediationStatusSchema.safeParse("Deferred").success).toBe(true);
  });

  it("accepts valid DataCompleteness values", () => {
    expect(DataCompletenessSchema.safeParse("Complete").success).toBe(true);
    expect(DataCompletenessSchema.safeParse("Partial").success).toBe(true);
  });
});

// ── ReportMetadata ─────────────────────────────────────────────────

describe("ReportMetadataSchema", () => {
  it("accepts valid metadata", () => {
    const result = ReportMetadataSchema.safeParse(validReportMetadata());
    expect(result.success).toBe(true);
  });

  it("accepts metadata with previous report date", () => {
    const meta = buildReportMetadata({
      previous_report_date: "2025-11-15T00:00:00Z",
      is_first_report: false,
    });
    const result = ReportMetadataSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  it("accepts null previous_report_date", () => {
    const meta = buildReportMetadata({ previous_report_date: null });
    const result = ReportMetadataSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  it("rejects empty company_name", () => {
    const meta = buildReportMetadata({ company_name: "" });
    const result = ReportMetadataSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  it("rejects invalid report_type", () => {
    const meta = { ...validReportMetadata(), report_type: "Weekly" };
    const result = ReportMetadataSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });
});

// ── PortfolioSnapshot ──────────────────────────────────────────────

describe("PortfolioSnapshotSchema", () => {
  it("accepts valid snapshot", () => {
    const result = PortfolioSnapshotSchema.safeParse(validPortfolioSnapshot());
    expect(result.success).toBe(true);
  });

  it("rejects negative tool count", () => {
    const snap = buildPortfolioSnapshot({ total_tools_registered: -1 });
    const result = PortfolioSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(false);
  });

  it("rejects remediation_completion_percentage above 100", () => {
    const snap = buildPortfolioSnapshot({
      remediation_completion_percentage: 101,
    });
    const result = PortfolioSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(false);
  });

  it("rejects remediation_completion_percentage below 0", () => {
    const snap = buildPortfolioSnapshot({
      remediation_completion_percentage: -1,
    });
    const result = PortfolioSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(false);
  });

  it("accepts zero for all counts", () => {
    const snap = buildPortfolioSnapshot({
      total_tools_registered: 0,
      total_estimated_users: 0,
      tools_by_risk_tier: { critical: 0, high: 0, moderate: 0, low: 0 },
      tools_by_governance_status: {
        managed: 0,
        partially_managed: 0,
        unmanaged: 0,
        shadow_ai: 0,
      },
      total_recommendations: 0,
      recommendations_completed: 0,
      recommendations_in_progress: 0,
      recommendations_not_started: 0,
      recommendations_deferred: 0,
      remediation_completion_percentage: 0,
    });
    const result = PortfolioSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(true);
  });
});

// ── ChangesSinceLastReport ─────────────────────────────────────────

describe("ChangesSinceLastReportSchema", () => {
  it("accepts valid first-report changes", () => {
    const result = ChangesSinceLastReportSchema.safeParse(
      validChangesSinceLastReport()
    );
    expect(result.success).toBe(true);
  });

  it("accepts changes with tools added/removed", () => {
    const changes = {
      ...validChangesSinceLastReport(),
      included: true,
      tools_added: [
        {
          tool_name: "Grammarly",
          risk_tier: "Low",
          date_added: "2026-01-15",
        },
      ],
      tools_removed: [
        {
          tool_name: "OldTool",
          reason: "Decommissioned",
          date_removed: "2026-01-20",
        },
      ],
      tier_changes: [
        {
          tool_name: "ChatGPT",
          previous_tier: "Critical",
          current_tier: "Low",
          change_driver: "Enterprise migration completed",
        },
      ],
      posture_trend: "Improving" as const,
    };
    const result = ChangesSinceLastReportSchema.safeParse(changes);
    expect(result.success).toBe(true);
  });
});

// ── FindingDetail ──────────────────────────────────────────────────

describe("FindingDetailSchema", () => {
  it("accepts valid finding detail", () => {
    const finding = validFindingsDetail()[0];
    const result = FindingDetailSchema.safeParse(finding);
    expect(result.success).toBe(true);
  });

  it("accepts null expected_resolution", () => {
    const finding = buildFindingDetail({ expected_resolution: null });
    const result = FindingDetailSchema.safeParse(finding);
    expect(result.success).toBe(true);
  });

  it("rejects empty tool_name", () => {
    const finding = buildFindingDetail({ tool_name: "" });
    const result = FindingDetailSchema.safeParse(finding);
    expect(result.success).toBe(false);
  });

  it("rejects invalid remediation_status", () => {
    const finding = { ...buildFindingDetail({}), remediation_status: "Paused" };
    const result = FindingDetailSchema.safeParse(finding);
    expect(result.success).toBe(false);
  });
});

// ── ActionItem ─────────────────────────────────────────────────────

describe("ActionItemSchema", () => {
  it("accepts valid action item", () => {
    const item = validActionItems()[0];
    const result = ActionItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("accepts action with null estimated_cost", () => {
    const item = buildActionItem({ estimated_cost: null });
    const result = ActionItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("rejects action with no related_tools", () => {
    const item = buildActionItem({ related_tools: [] });
    const result = ActionItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("rejects invalid action_type", () => {
    const item = { ...buildActionItem({}), action_type: "Request" };
    const result = ActionItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it("rejects invalid urgency", () => {
    const item = { ...buildActionItem({}), urgency: "Whenever" };
    const result = ActionItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });
});

// ── ToolSummaryRow ─────────────────────────────────────────────────

describe("ToolSummaryRowSchema", () => {
  it("accepts valid tool summary row", () => {
    const row = validToolSummaryTable()[0];
    const result = ToolSummaryRowSchema.safeParse(row);
    expect(result.success).toBe(true);
  });

  it("rejects negative flag count", () => {
    const row = { ...validToolSummaryTable()[0], active_flags_critical: -1 };
    const result = ToolSummaryRowSchema.safeParse(row);
    expect(result.success).toBe(false);
  });
});

// ── Chart Data ─────────────────────────────────────────────────────

describe("ChartDataSchema", () => {
  it("accepts valid chart data", () => {
    const data = { labels: ["A", "B"], values: [1, 2], chart_type: "bar" as const };
    const result = ChartDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects invalid chart_type", () => {
    const data = { labels: ["A"], values: [1], chart_type: "pie" };
    const result = ChartDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ── RiskTrendData ──────────────────────────────────────────────────

describe("RiskTrendDataSchema", () => {
  it("accepts valid trend data when not included", () => {
    const data = {
      included: false,
      periods: [],
      critical_count: [],
      high_count: [],
      moderate_count: [],
      low_count: [],
      chart_type: "stacked_bar" as const,
    };
    const result = RiskTrendDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("accepts valid trend data when included", () => {
    const data = {
      included: true,
      periods: ["Q4 2025", "Q1 2026"],
      critical_count: [3, 1],
      high_count: [2, 1],
      moderate_count: [1, 2],
      low_count: [0, 1],
      chart_type: "line" as const,
    };
    const result = RiskTrendDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ── OrganizationContext ────────────────────────────────────────────

describe("OrganizationContextSchema", () => {
  it("accepts valid organization", () => {
    const result = OrganizationContextSchema.safeParse(meridianOrganization());
    expect(result.success).toBe(true);
  });

  it("rejects zero employee count", () => {
    const org = { ...meridianOrganization(), employee_count: 0 };
    const result = OrganizationContextSchema.safeParse(org);
    expect(result.success).toBe(false);
  });

  it("rejects missing company_name", () => {
    const { company_name, ...rest } = meridianOrganization();
    const result = OrganizationContextSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ── BoardSummaryRequest ────────────────────────────────────────────

describe("BoardSummaryRequestSchema", () => {
  it("accepts valid request", () => {
    const result = BoardSummaryRequestSchema.safeParse(
      meridianBoardSummaryRequest()
    );
    expect(result.success).toBe(true);
  });

  it("rejects request with empty tool_assessments", () => {
    const req = {
      organization: meridianOrganization(),
      tool_assessments: [],
    };
    const result = BoardSummaryRequestSchema.safeParse(req);
    expect(result.success).toBe(false);
  });
});

// ── BoardSummaryResponse ───────────────────────────────────────────

describe("BoardSummaryResponseSchema", () => {
  it("accepts valid response", () => {
    const result = BoardSummaryResponseSchema.safeParse(
      validBoardSummaryResponse()
    );
    expect(result.success).toBe(true);
  });

  it("rejects response missing metadata", () => {
    const { metadata, ...rest } = validBoardSummaryResponse();
    const result = BoardSummaryResponseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects response missing board_summary", () => {
    const { board_summary, ...rest } = validBoardSummaryResponse();
    const result = BoardSummaryResponseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ── CategoryCount ──────────────────────────────────────────────────

describe("CategoryCountSchema", () => {
  it("accepts valid category count", () => {
    const result = CategoryCountSchema.safeParse({
      category: "Generative AI",
      count: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero count", () => {
    const result = CategoryCountSchema.safeParse({
      category: "Generative AI",
      count: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty category", () => {
    const result = CategoryCountSchema.safeParse({ category: "", count: 1 });
    expect(result.success).toBe(false);
  });
});

// ── BoardSummaryMetadata ───────────────────────────────────────────

describe("BoardSummaryMetadataSchema", () => {
  it("accepts valid metadata", () => {
    const result = BoardSummaryMetadataSchema.safeParse({
      schema_version: "1.0",
      prompt_version: "board_summary_v1",
      tools_included: 3,
      tools_excluded: 0,
      exclusion_note: null,
      data_completeness: "Complete",
    });
    expect(result.success).toBe(true);
  });

  it("accepts Partial data_completeness", () => {
    const result = BoardSummaryMetadataSchema.safeParse({
      schema_version: "1.0",
      prompt_version: "board_summary_v1",
      tools_included: 5,
      tools_excluded: 2,
      exclusion_note: "Two tools still in assessment",
      data_completeness: "Partial",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid data_completeness", () => {
    const result = BoardSummaryMetadataSchema.safeParse({
      schema_version: "1.0",
      prompt_version: "board_summary_v1",
      tools_included: 3,
      tools_excluded: 0,
      exclusion_note: null,
      data_completeness: "Unknown",
    });
    expect(result.success).toBe(false);
  });
});

// ── Narrative ──────────────────────────────────────────────────────

describe("NarrativeSchema", () => {
  it("accepts valid narrative", () => {
    const result = NarrativeSchema.safeParse(validNarrative());
    expect(result.success).toBe(true);
  });

  it("rejects empty executive_overview", () => {
    const narrative = { ...validNarrative(), executive_overview: "" };
    const result = NarrativeSchema.safeParse(narrative);
    expect(result.success).toBe(false);
  });

  it("rejects empty portfolio_overview", () => {
    const narrative = { ...validNarrative(), portfolio_overview: "" };
    const result = NarrativeSchema.safeParse(narrative);
    expect(result.success).toBe(false);
  });
});

// ── AppendixData ───────────────────────────────────────────────────

describe("AppendixDataSchema", () => {
  it("accepts valid appendix data", () => {
    const result = AppendixDataSchema.safeParse(validAppendixData());
    expect(result.success).toBe(true);
  });
});
