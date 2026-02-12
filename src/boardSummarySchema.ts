import { z } from "zod";

/**
 * Complyze Prompt 5: Board Summary Narrative
 * Schema definitions for executive-level portfolio risk reports
 */

// ── Enums ──────────────────────────────────────────────────────────

export const ReportTypeSchema = z.enum(["Monthly", "Quarterly", "Ad Hoc"]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const PostureTrendSchema = z.enum([
  "Improving",
  "Stable",
  "Deteriorating",
]);
export type PostureTrend = z.infer<typeof PostureTrendSchema>;

export const ActionTypeSchema = z.enum([
  "Budget Approval",
  "Policy Approval",
  "Strategic Decision",
  "Awareness Only",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const UrgencySchema = z.enum([
  "Immediate",
  "Next 30 Days",
  "Next Quarter",
  "Informational",
]);
export type Urgency = z.infer<typeof UrgencySchema>;

export const RemediationStatusSchema = z.enum([
  "Not Started",
  "In Progress",
  "Completed",
  "Deferred",
]);
export type RemediationStatus = z.infer<typeof RemediationStatusSchema>;

export const ChartTypeSchema = z.enum([
  "donut",
  "bar",
  "stacked_bar",
  "line",
]);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const DataCompletenessSchema = z.enum(["Complete", "Partial"]);
export type DataCompleteness = z.infer<typeof DataCompletenessSchema>;

// ── Report Metadata ────────────────────────────────────────────────

export const ReportMetadataSchema = z.object({
  company_name: z.string().min(1),
  industry: z.string().min(1),
  report_period: z.string().min(1),
  report_type: ReportTypeSchema,
  generated_at: z.string().min(1),
  previous_report_date: z.string().nullable(),
  is_first_report: z.boolean(),
  data_as_of: z.string().min(1),
});
export type ReportMetadata = z.infer<typeof ReportMetadataSchema>;

// ── Portfolio Snapshot ─────────────────────────────────────────────

export const ToolsByRiskTierSchema = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  moderate: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
});
export type ToolsByRiskTier = z.infer<typeof ToolsByRiskTierSchema>;

export const ToolsByGovernanceStatusSchema = z.object({
  managed: z.number().int().nonnegative(),
  partially_managed: z.number().int().nonnegative(),
  unmanaged: z.number().int().nonnegative(),
  shadow_ai: z.number().int().nonnegative(),
});
export type ToolsByGovernanceStatus = z.infer<
  typeof ToolsByGovernanceStatusSchema
>;

export const CategoryCountSchema = z.object({
  category: z.string().min(1),
  count: z.number().int().positive(),
});
export type CategoryCount = z.infer<typeof CategoryCountSchema>;

export const ActiveFlagsSchema = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
});
export type ActiveFlags = z.infer<typeof ActiveFlagsSchema>;

export const PortfolioSnapshotSchema = z.object({
  total_tools_registered: z.number().int().nonnegative(),
  total_estimated_users: z.number().int().nonnegative(),
  tools_by_risk_tier: ToolsByRiskTierSchema,
  tools_by_governance_status: ToolsByGovernanceStatusSchema,
  tools_by_category: z.array(CategoryCountSchema),
  total_active_flags: ActiveFlagsSchema,
  total_recommendations: z.number().int().nonnegative(),
  recommendations_completed: z.number().int().nonnegative(),
  recommendations_in_progress: z.number().int().nonnegative(),
  recommendations_not_started: z.number().int().nonnegative(),
  recommendations_deferred: z.number().int().nonnegative(),
  remediation_completion_percentage: z.number().min(0).max(100),
});
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;

// ── Changes Since Last Report ──────────────────────────────────────

export const ToolAddedSchema = z.object({
  tool_name: z.string().min(1),
  risk_tier: z.string().min(1),
  date_added: z.string().min(1),
});
export type ToolAdded = z.infer<typeof ToolAddedSchema>;

export const ToolRemovedSchema = z.object({
  tool_name: z.string().min(1),
  reason: z.string().min(1),
  date_removed: z.string().min(1),
});
export type ToolRemoved = z.infer<typeof ToolRemovedSchema>;

export const TierChangeSchema = z.object({
  tool_name: z.string().min(1),
  previous_tier: z.string().min(1),
  current_tier: z.string().min(1),
  change_driver: z.string().min(1),
});
export type TierChange = z.infer<typeof TierChangeSchema>;

export const ChangesSinceLastReportSchema = z.object({
  included: z.boolean(),
  tools_added: z.array(ToolAddedSchema),
  tools_removed: z.array(ToolRemovedSchema),
  tier_changes: z.array(TierChangeSchema),
  flags_resolved: z.number().int().nonnegative(),
  flags_new: z.number().int().nonnegative(),
  recommendations_completed_this_period: z.number().int().nonnegative(),
  posture_trend: PostureTrendSchema,
  trend_summary: z.string().min(1),
});
export type ChangesSinceLastReport = z.infer<
  typeof ChangesSinceLastReportSchema
>;

// ── Findings Detail ────────────────────────────────────────────────

export const FindingDetailSchema = z.object({
  tool_name: z.string().min(1),
  tool_tier: z.string().min(1),
  risk_tier: z.string().min(1),
  flag_title: z.string().min(1),
  flag_severity: z.string().min(1),
  plain_language_description: z.string().min(1),
  remediation_status: RemediationStatusSchema,
  expected_resolution: z.string().nullable(),
});
export type FindingDetail = z.infer<typeof FindingDetailSchema>;

// ── Action Items ───────────────────────────────────────────────────

export const ActionItemSchema = z.object({
  action_id: z.string().min(1),
  action_type: ActionTypeSchema,
  description: z.string().min(1),
  estimated_cost: z.string().nullable(),
  urgency: UrgencySchema,
  related_tools: z.array(z.string().min(1)).min(1),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

// ── Narrative Sections ─────────────────────────────────────────────

export const CriticalAndHighFindingsSchema = z.object({
  narrative: z.string().min(1),
  findings_detail: z.array(FindingDetailSchema),
});
export type CriticalAndHighFindings = z.infer<
  typeof CriticalAndHighFindingsSchema
>;

export const LeadershipActionItemsSchema = z.object({
  narrative: z.string().min(1),
  action_items: z.array(ActionItemSchema),
  no_action_needed: z.boolean(),
});
export type LeadershipActionItems = z.infer<typeof LeadershipActionItemsSchema>;

export const NarrativeSchema = z.object({
  executive_overview: z.string().min(1),
  portfolio_overview: z.string().min(1),
  risk_posture_analysis: z.string().min(1),
  critical_and_high_findings: CriticalAndHighFindingsSchema,
  remediation_progress: z.string().min(1),
  leadership_action_items: LeadershipActionItemsSchema,
  outlook_and_next_steps: z.string().min(1),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

// ── Appendix Data ──────────────────────────────────────────────────

export const ToolSummaryRowSchema = z.object({
  tool_name: z.string().min(1),
  vendor: z.string().min(1),
  tier: z.string().min(1),
  category: z.string().min(1),
  risk_tier: z.string().min(1),
  governance_status: z.string().min(1),
  active_flags_critical: z.number().int().nonnegative(),
  active_flags_high: z.number().int().nonnegative(),
  active_flags_medium: z.number().int().nonnegative(),
  active_flags_low: z.number().int().nonnegative(),
  remediation_completion: z.string().min(1),
  next_reassessment_date: z.string().min(1),
});
export type ToolSummaryRow = z.infer<typeof ToolSummaryRowSchema>;

export const ChartDataSchema = z.object({
  labels: z.array(z.string()),
  values: z.array(z.number().int().nonnegative()),
  chart_type: ChartTypeSchema,
});
export type ChartData = z.infer<typeof ChartDataSchema>;

export const RiskTrendDataSchema = z.object({
  included: z.boolean(),
  periods: z.array(z.string()),
  critical_count: z.array(z.number().int().nonnegative()),
  high_count: z.array(z.number().int().nonnegative()),
  moderate_count: z.array(z.number().int().nonnegative()),
  low_count: z.array(z.number().int().nonnegative()),
  chart_type: ChartTypeSchema,
});
export type RiskTrendData = z.infer<typeof RiskTrendDataSchema>;

export const AppendixDataSchema = z.object({
  tool_summary_table: z.array(ToolSummaryRowSchema),
  risk_distribution_data: ChartDataSchema,
  governance_distribution_data: ChartDataSchema,
  remediation_progress_data: ChartDataSchema,
  risk_trend_data: RiskTrendDataSchema,
});
export type AppendixData = z.infer<typeof AppendixDataSchema>;

// ── Board Summary ──────────────────────────────────────────────────

export const BoardSummarySchema = z.object({
  report_metadata: ReportMetadataSchema,
  portfolio_snapshot: PortfolioSnapshotSchema,
  changes_since_last_report: ChangesSinceLastReportSchema,
  narrative: NarrativeSchema,
  appendix_data: AppendixDataSchema,
});
export type BoardSummary = z.infer<typeof BoardSummarySchema>;

// ── Response Metadata ──────────────────────────────────────────────

export const BoardSummaryMetadataSchema = z.object({
  schema_version: z.string(),
  prompt_version: z.string(),
  tools_included: z.number().int().nonnegative(),
  tools_excluded: z.number().int().nonnegative(),
  exclusion_note: z.string().nullable(),
  data_completeness: DataCompletenessSchema,
});
export type BoardSummaryMetadata = z.infer<typeof BoardSummaryMetadataSchema>;

// ── Top-Level Response ─────────────────────────────────────────────

export const BoardSummaryResponseSchema = z.object({
  board_summary: BoardSummarySchema,
  metadata: BoardSummaryMetadataSchema,
});
export type BoardSummaryResponse = z.infer<typeof BoardSummaryResponseSchema>;

// ── Request Schema ─────────────────────────────────────────────────

export const ToolAssessmentSchema = z.object({
  tool_profile: z.any(),
  risk_classification: z.any(),
  flag_report: z.any(),
  remediation_plan: z.any(),
  remediation_progress: z.any().optional(),
});
export type ToolAssessment = z.infer<typeof ToolAssessmentSchema>;

export const OrganizationContextSchema = z.object({
  company_name: z.string().min(1),
  industry: z.string().min(1),
  employee_count: z.number().int().positive(),
  report_period: z.string().min(1),
  report_type: ReportTypeSchema,
  previous_report_date: z.string().nullable(),
});
export type OrganizationContext = z.infer<typeof OrganizationContextSchema>;

export const BoardSummaryRequestSchema = z.object({
  organization: OrganizationContextSchema,
  tool_assessments: z.array(ToolAssessmentSchema).min(1),
});
export type BoardSummaryRequest = z.infer<typeof BoardSummaryRequestSchema>;

// ── Validation Result ──────────────────────────────────────────────

export interface BoardSummaryValidationResult {
  valid: boolean;
  errors: string[];
}
