/**
 * Test fixtures for Prompt 5: Board Summary Narrative
 */

import type {
  BoardSummaryRequest,
  BoardSummaryResponse,
  BoardSummary,
  PortfolioSnapshot,
  ReportMetadata,
  ChangesSinceLastReport,
  Narrative,
  AppendixData,
  FindingDetail,
  ActionItem,
  ToolSummaryRow,
  OrganizationContext,
  ToolAssessment,
  BoardSummaryMetadata,
} from "../boardSummarySchema.js";

// ── Organization Context ───────────────────────────────────────────

export function meridianOrganization(): OrganizationContext {
  return {
    company_name: "Meridian Financial Advisors",
    industry: "Financial Services",
    employee_count: 800,
    report_period: "Q1 2026",
    report_type: "Quarterly",
    previous_report_date: null,
  };
}

export function meridianFollowUpOrganization(): OrganizationContext {
  return {
    company_name: "Meridian Financial Advisors",
    industry: "Financial Services",
    employee_count: 800,
    report_period: "Q2 2026",
    report_type: "Quarterly",
    previous_report_date: "2026-02-12T00:00:00Z",
  };
}

// ── Tool Assessments (stubbed Prompts 1-4 outputs) ─────────────────

function chatGPTAssessment(): ToolAssessment {
  return {
    tool_profile: {
      tool_profile: {
        tool_name: "ChatGPT",
        vendor: "OpenAI",
        tier: "Free",
        category: "Generative AI Platform",
      },
    },
    risk_classification: {
      overall_risk: "Critical",
      governance_status: "Partially Managed",
      estimated_users: "21-50",
    },
    flag_report: {
      flags: [
        {
          flag_id: "flag_01",
          title: "Client Data Exposed to Vendor Model Training",
          severity: "Critical",
          category: "data_exposure",
        },
        {
          flag_id: "flag_02",
          title: "No Centralized Access Management or Visibility",
          severity: "High",
          category: "access_control",
        },
        {
          flag_id: "flag_03",
          title: "No Audit Trail for AI Usage",
          severity: "High",
          category: "access_control",
        },
        {
          flag_id: "flag_04",
          title: "Client-Facing Deliverables Without Consistent Review",
          severity: "High",
          category: "output_risk",
        },
        {
          flag_id: "flag_05",
          title: "AI Tool in Use Without Formal Approval",
          severity: "Medium",
          category: "governance_gap",
        },
        {
          flag_id: "flag_06",
          title: "Client Data Processing Without Client Awareness",
          severity: "Medium",
          category: "regulatory_exposure",
        },
      ],
    },
    remediation_plan: {
      remediation_plan: {
        tool_name: "ChatGPT",
        plan_summary: { total_recommendations: 8 },
        strategies: [],
      },
    },
    remediation_progress: {
      completed: 3,
      in_progress: 2,
      not_started: 2,
      deferred: 1,
    },
  };
}

function copilotAssessment(): ToolAssessment {
  return {
    tool_profile: {
      tool_profile: {
        tool_name: "Microsoft Copilot",
        vendor: "Microsoft",
        tier: "M365 E5",
        category: "AI Writing Assistant",
      },
    },
    risk_classification: {
      overall_risk: "Moderate",
      governance_status: "Managed",
      estimated_users: "51-100",
    },
    flag_report: {
      flags: [
        {
          flag_id: "flag_07",
          title: "Broad Data Access Scope",
          severity: "Medium",
          category: "data_exposure",
        },
        {
          flag_id: "flag_08",
          title: "Employee Training Gap",
          severity: "Medium",
          category: "governance_gap",
        },
        {
          flag_id: "flag_09",
          title: "Output Quality for Specialized Content",
          severity: "Low",
          category: "output_risk",
        },
      ],
    },
    remediation_plan: {
      remediation_plan: {
        tool_name: "Microsoft Copilot",
        plan_summary: { total_recommendations: 4 },
        strategies: [],
      },
    },
    remediation_progress: {
      completed: 4,
      in_progress: 0,
      not_started: 0,
      deferred: 0,
    },
  };
}

function otterAssessment(): ToolAssessment {
  return {
    tool_profile: {
      tool_profile: {
        tool_name: "Otter.ai",
        vendor: "Otter.ai",
        tier: "Business",
        category: "AI Transcription/Meeting",
      },
    },
    risk_classification: {
      overall_risk: "High",
      governance_status: "Unmanaged",
      estimated_users: "6-20",
    },
    flag_report: {
      flags: [
        {
          flag_id: "flag_10",
          title: "Client Meeting Recordings Without Formal Approval",
          severity: "High",
          category: "data_exposure",
        },
        {
          flag_id: "flag_11",
          title: "Meeting Content Used for Vendor Model Improvement",
          severity: "High",
          category: "data_exposure",
        },
        {
          flag_id: "flag_12",
          title: "No Access Controls on Transcription Data",
          severity: "High",
          category: "access_control",
        },
        {
          flag_id: "flag_13",
          title: "Transcription Accuracy for Specialized Terms",
          severity: "Medium",
          category: "output_risk",
        },
      ],
    },
    remediation_plan: {
      remediation_plan: {
        tool_name: "Otter.ai",
        plan_summary: { total_recommendations: 5 },
        strategies: [],
      },
    },
    remediation_progress: {
      completed: 0,
      in_progress: 2,
      not_started: 3,
      deferred: 0,
    },
  };
}

// ── Board Summary Request ──────────────────────────────────────────

export function meridianBoardSummaryRequest(): BoardSummaryRequest {
  return {
    organization: meridianOrganization(),
    tool_assessments: [
      chatGPTAssessment(),
      copilotAssessment(),
      otterAssessment(),
    ],
  };
}

export function singleToolRequest(): BoardSummaryRequest {
  return {
    organization: {
      company_name: "Acme Corp",
      industry: "Technology",
      employee_count: 500,
      report_period: "February 2026",
      report_type: "Ad Hoc",
      previous_report_date: null,
    },
    tool_assessments: [chatGPTAssessment()],
  };
}

// ── Valid Board Summary Response ────────────────────────────────────

export function validReportMetadata(): ReportMetadata {
  return {
    company_name: "Meridian Financial Advisors",
    industry: "Financial Services",
    report_period: "Q1 2026",
    report_type: "Quarterly",
    generated_at: "2026-02-12T00:00:00Z",
    previous_report_date: null,
    is_first_report: true,
    data_as_of: "2026-02-12T00:00:00Z",
  };
}

export function validPortfolioSnapshot(): PortfolioSnapshot {
  return {
    total_tools_registered: 3,
    total_estimated_users: 115,
    tools_by_risk_tier: {
      critical: 1,
      high: 1,
      moderate: 1,
      low: 0,
    },
    tools_by_governance_status: {
      managed: 1,
      partially_managed: 1,
      unmanaged: 1,
      shadow_ai: 0,
    },
    tools_by_category: [
      { category: "Generative AI Platform", count: 1 },
      { category: "AI Writing Assistant", count: 1 },
      { category: "AI Transcription/Meeting", count: 1 },
    ],
    total_active_flags: {
      critical: 1,
      high: 6,
      medium: 5,
      low: 1,
    },
    total_recommendations: 17,
    recommendations_completed: 7,
    recommendations_in_progress: 4,
    recommendations_not_started: 5,
    recommendations_deferred: 1,
    remediation_completion_percentage: 41.2,
  };
}

export function validChangesSinceLastReport(): ChangesSinceLastReport {
  return {
    included: false,
    tools_added: [],
    tools_removed: [],
    tier_changes: [],
    flags_resolved: 0,
    flags_new: 0,
    recommendations_completed_this_period: 0,
    posture_trend: "Stable",
    trend_summary:
      "This is the organization's first AI risk posture report. No trend data is available. Subsequent reports will track changes over time.",
  };
}

export function validFindingsDetail(): FindingDetail[] {
  return [
    {
      tool_name: "ChatGPT",
      tool_tier: "Free",
      risk_tier: "Critical",
      flag_title: "Client Data Exposed to Vendor Model Training",
      flag_severity: "Critical",
      plain_language_description:
        "Employees are entering client financial data into ChatGPT Free, where OpenAI may use it to train future AI models. The organization cannot prevent or monitor this.",
      remediation_status: "In Progress",
      expected_resolution:
        "Enterprise migration targeted for March 15, 2026",
    },
    {
      tool_name: "ChatGPT",
      tool_tier: "Free",
      risk_tier: "Critical",
      flag_title: "No Centralized Access Management or Visibility",
      flag_severity: "High",
      plain_language_description:
        "IT cannot see who is using ChatGPT, cannot enforce policies on accounts, and cannot revoke access when employees leave.",
      remediation_status: "In Progress",
      expected_resolution:
        "Resolved by Enterprise migration — March 15, 2026",
    },
    {
      tool_name: "ChatGPT",
      tool_tier: "Free",
      risk_tier: "Critical",
      flag_title: "No Audit Trail for AI Usage",
      flag_severity: "High",
      plain_language_description:
        "There is no record of what data was entered into ChatGPT or what outputs were generated. If a data incident occurs, investigation will be severely limited.",
      remediation_status: "In Progress",
      expected_resolution:
        "Resolved by Enterprise migration — March 15, 2026",
    },
    {
      tool_name: "ChatGPT",
      tool_tier: "Free",
      risk_tier: "Critical",
      flag_title: "Client-Facing Deliverables Without Consistent Review",
      flag_severity: "High",
      plain_language_description:
        "AI-generated content is being delivered to clients without guaranteed human review for accuracy and quality.",
      remediation_status: "In Progress",
      expected_resolution:
        "Review process expected by end of February 2026",
    },
    {
      tool_name: "Otter.ai",
      tool_tier: "Business",
      risk_tier: "High",
      flag_title: "Client Meeting Recordings Without Formal Approval",
      flag_severity: "High",
      plain_language_description:
        "An AI transcription tool is recording meetings containing client discussions and financial strategy without having gone through security review or formal approval.",
      remediation_status: "Not Started",
      expected_resolution: null,
    },
    {
      tool_name: "Otter.ai",
      tool_tier: "Business",
      risk_tier: "High",
      flag_title: "Meeting Content Used for Vendor Model Improvement",
      flag_severity: "High",
      plain_language_description:
        "Otter.ai may use transcription data to improve its AI models. Meeting content including client names, portfolio details, and strategy discussions may contribute to vendor training data.",
      remediation_status: "Not Started",
      expected_resolution: null,
    },
    {
      tool_name: "Otter.ai",
      tool_tier: "Business",
      risk_tier: "High",
      flag_title: "No Access Controls on Transcription Data",
      flag_severity: "High",
      plain_language_description:
        "Transcription recordings and notes are accessible without centralized control, making it impossible to manage who can view sensitive meeting content.",
      remediation_status: "In Progress",
      expected_resolution: null,
    },
  ];
}

export function validActionItems(): ActionItem[] {
  return [
    {
      action_id: "action_01",
      action_type: "Budget Approval",
      description:
        "Approve annual licensing for ChatGPT Enterprise for approximately 35-50 users. This single expenditure resolves the Critical data exposure finding and three High findings related to access control and audit logging.",
      estimated_cost:
        "$25,000-$50,000 annually (based on published per-user pricing, subject to negotiated enterprise terms)",
      urgency: "Immediate",
      related_tools: ["ChatGPT"],
    },
    {
      action_id: "action_02",
      action_type: "Strategic Decision",
      description:
        "Determine whether Otter.ai should be formally approved with enhanced controls or replaced with a transcription solution that integrates with the existing Microsoft ecosystem.",
      estimated_cost:
        "Cost-neutral if migrating to Microsoft Teams transcription; approximately $6,000-$10,000 annually if upgrading Otter.ai to Enterprise tier",
      urgency: "Next 30 Days",
      related_tools: ["Otter.ai"],
    },
  ];
}

export function validNarrative(): Narrative {
  return {
    executive_overview:
      "Meridian Financial Advisors currently has 3 AI tools registered in its governance program, used by approximately 115 employees across multiple departments. The organization's AI risk posture is elevated and requires leadership attention. The most significant finding is that client financial data is being entered into ChatGPT Free by an estimated 21-50 employees, where the vendor may use it for model training with no organizational controls to prevent this. Remediation is underway — the compliance team has completed initial quick wins including user notification and tool owner assignment, and is pursuing enterprise tier migration to resolve the most critical data exposure risks.",

    portfolio_overview:
      "Meridian's current AI footprint consists of three tools: ChatGPT Free (general-purpose AI, ~35 users), Microsoft Copilot within the M365 E5 environment (~60 users), and Otter.ai Business for meeting transcription (~20 users). All three tools fall into distinct categories, but they share a common characteristic: they process organizational content that may include client information.\n\nMicrosoft Copilot is the most mature from a governance perspective — it was formally approved, has enterprise-grade data protections through the existing M365 E5 license, and has a designated owner with a quarterly review cycle. ChatGPT and Otter.ai represent the organization's governance gaps.\n\nIt is important to note that this registry of 3 tools likely represents a fraction of the AI-enabled software in use at Meridian. A more comprehensive AI discovery exercise is recommended.",

    risk_posture_analysis:
      "Risk is concentrated in two tools. ChatGPT Free is classified as Critical risk due to the combination of client data entering a tool with no enterprise data protections and no organizational ability to monitor or control usage. Otter.ai Business is classified as High risk because it records and transcribes meetings that frequently contain client discussions.\n\nA pattern emerges across the portfolio: two of three tools were adopted by employees without formal organizational approval. This indicates a systemic governance gap rather than isolated incidents.\n\nGovernance maturity varies significantly: only Microsoft Copilot has achieved full Managed status. ChatGPT is Partially Managed, and Otter.ai is Unmanaged.",

    critical_and_high_findings: {
      narrative:
        "One Critical finding and six High findings are active across the portfolio. The Critical finding — client financial data exposure through ChatGPT Free — represents the most urgent risk. Client data entered into the free tier may be used by OpenAI to train future models.\n\nThe High findings cluster around two themes. First, access control and audit gaps: both ChatGPT Free and Otter.ai lack centralized access management. Second, output quality risk: AI-generated content is reaching clients without consistent human review.\n\nThe Otter.ai findings are particularly time-sensitive because the tool is actively recording meetings that include client portfolio discussions.",
      findings_detail: validFindingsDetail(),
    },

    remediation_progress:
      "Since the Complyze program launch in January 2026, the compliance team has completed 7 of 17 total recommendations across the portfolio (41% completion). All quick wins for the Critical-tier ChatGPT assessment have been completed. Microsoft Copilot has achieved full remediation with all 4 recommendations completed.\n\nThe primary in-flight initiative is the ChatGPT Enterprise migration, progressing through procurement review with an expected completion date of March 15, 2026.\n\nOtter.ai remediation has not yet started. Given that this tool is actively recording client meetings daily, initiating the Otter.ai remediation plan should be treated as an immediate priority.",

    leadership_action_items: {
      narrative:
        "Two items require leadership decision or approval. Both relate to budget for AI tool upgrades that resolve Critical and High risk findings.",
      action_items: validActionItems(),
      no_action_needed: false,
    },

    outlook_and_next_steps:
      "By the Q2 2026 report, the compliance team expects to have completed the ChatGPT Enterprise migration and resolved the Otter.ai situation. If both actions are completed, the organization would have zero Critical-tier tools and at most one High-tier tool, moving the overall posture from Elevated to Acceptable.\n\nThe compliance team also plans to expand the AI tool registry by conducting a broader discovery exercise, likely identifying an additional 10-20 AI-enabled tools.\n\nLooking further ahead, the organization should consider establishing a formal AI intake process to prevent future Shadow AI accumulation.",
  };
}

export function validAppendixData(): AppendixData {
  return {
    tool_summary_table: validToolSummaryTable(),
    risk_distribution_data: {
      labels: ["Critical", "High", "Moderate", "Low"],
      values: [1, 1, 1, 0],
      chart_type: "donut",
    },
    governance_distribution_data: {
      labels: ["Managed", "Partially Managed", "Unmanaged", "Shadow AI"],
      values: [1, 1, 1, 0],
      chart_type: "donut",
    },
    remediation_progress_data: {
      labels: ["Completed", "In Progress", "Not Started", "Deferred"],
      values: [7, 4, 5, 1],
      chart_type: "bar",
    },
    risk_trend_data: {
      included: false,
      periods: [],
      critical_count: [],
      high_count: [],
      moderate_count: [],
      low_count: [],
      chart_type: "stacked_bar",
    },
  };
}

export function validToolSummaryTable(): ToolSummaryRow[] {
  return [
    {
      tool_name: "ChatGPT",
      vendor: "OpenAI",
      tier: "Free",
      category: "Generative AI Platform",
      risk_tier: "Critical",
      governance_status: "Partially Managed",
      active_flags_critical: 1,
      active_flags_high: 3,
      active_flags_medium: 2,
      active_flags_low: 0,
      remediation_completion: "3 of 8 complete",
      next_reassessment_date: "2026-03-12",
    },
    {
      tool_name: "Microsoft Copilot",
      vendor: "Microsoft",
      tier: "M365 E5",
      category: "AI Writing Assistant",
      risk_tier: "Moderate",
      governance_status: "Managed",
      active_flags_critical: 0,
      active_flags_high: 0,
      active_flags_medium: 2,
      active_flags_low: 1,
      remediation_completion: "4 of 4 complete",
      next_reassessment_date: "2026-06-12",
    },
    {
      tool_name: "Otter.ai",
      vendor: "Otter.ai",
      tier: "Business",
      category: "AI Transcription/Meeting",
      risk_tier: "High",
      governance_status: "Unmanaged",
      active_flags_critical: 0,
      active_flags_high: 3,
      active_flags_medium: 1,
      active_flags_low: 0,
      remediation_completion: "0 of 5 complete",
      next_reassessment_date: "2026-03-12",
    },
  ];
}

// ── Complete Valid Response ─────────────────────────────────────────

export function validBoardSummaryResponse(): BoardSummaryResponse {
  return {
    board_summary: validBoardSummary(),
    metadata: validBoardSummaryMetadata(),
  };
}

export function validBoardSummary(): BoardSummary {
  return {
    report_metadata: validReportMetadata(),
    portfolio_snapshot: validPortfolioSnapshot(),
    changes_since_last_report: validChangesSinceLastReport(),
    narrative: validNarrative(),
    appendix_data: validAppendixData(),
  };
}

export function validBoardSummaryMetadata(): BoardSummaryMetadata {
  return {
    schema_version: "1.0",
    prompt_version: "board_summary_v1",
    tools_included: 3,
    tools_excluded: 0,
    exclusion_note: null,
    data_completeness: "Complete",
  };
}

// ── Builder Helpers ────────────────────────────────────────────────

export function buildBoardSummaryResponse(
  overrides: Partial<BoardSummaryResponse> & {
    board_summary_overrides?: Partial<BoardSummary>;
    metadata_overrides?: Partial<BoardSummaryMetadata>;
  } = {}
): BoardSummaryResponse {
  const { board_summary_overrides, metadata_overrides, ...rest } = overrides;

  return {
    board_summary: {
      ...validBoardSummary(),
      ...board_summary_overrides,
    },
    metadata: {
      ...validBoardSummaryMetadata(),
      ...metadata_overrides,
    },
    ...rest,
  };
}

export function buildPortfolioSnapshot(
  overrides: Partial<PortfolioSnapshot>
): PortfolioSnapshot {
  return {
    ...validPortfolioSnapshot(),
    ...overrides,
  };
}

export function buildReportMetadata(
  overrides: Partial<ReportMetadata>
): ReportMetadata {
  return {
    ...validReportMetadata(),
    ...overrides,
  };
}

export function buildFindingDetail(
  overrides: Partial<FindingDetail>
): FindingDetail {
  return {
    tool_name: "Test Tool",
    tool_tier: "Free",
    risk_tier: "High",
    flag_title: "Test Finding",
    flag_severity: "High",
    plain_language_description: "A test finding for validation.",
    remediation_status: "Not Started",
    expected_resolution: null,
    ...overrides,
  };
}

export function buildActionItem(
  overrides: Partial<ActionItem>
): ActionItem {
  return {
    action_id: "action_test",
    action_type: "Budget Approval",
    description: "Test action item",
    estimated_cost: null,
    urgency: "Next 30 Days",
    related_tools: ["Test Tool"],
    ...overrides,
  };
}
