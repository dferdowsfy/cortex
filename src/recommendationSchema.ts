import { z } from "zod";

/**
 * Complyze Prompt 4: Recommendation Engine
 * Schema definitions for remediation plan generation
 */

/**
 * Effort levels for recommendations
 */
export const EffortLevelSchema = z.enum([
  "Quick Win",
  "Low Effort",
  "Medium Effort",
  "High Effort",
  "Strategic Initiative",
]);
export type EffortLevel = z.infer<typeof EffortLevelSchema>;

/**
 * Timeframe categories
 */
export const TimeframeSchema = z.enum([
  "Immediate",
  "Short-term",
  "Medium-term",
  "Long-term",
]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

/**
 * Recommendation types
 */
export const RecommendationTypeSchema = z.enum([
  "Restrict",
  "Upgrade",
  "Policy",
  "Process",
  "Communicate",
  "Monitor",
]);
export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

/**
 * Resolution types for flags
 */
export const ResolutionTypeSchema = z.enum([
  "Fully Resolved",
  "Severity Reduced",
  "Partially Addressed",
]);
export type ResolutionType = z.infer<typeof ResolutionTypeSchema>;

/**
 * Risk tier values
 */
export const RiskTierSchema = z.enum(["Critical", "High", "Moderate", "Low"]);
export type RiskTier = z.infer<typeof RiskTierSchema>;

/**
 * Governance status values
 */
export const GovernanceStatusSchema = z.enum([
  "Unmanaged",
  "Partially Managed",
  "Managed",
]);
export type GovernanceStatus = z.infer<typeof GovernanceStatusSchema>;

/**
 * Flag resolution record
 */
export const FlagResolutionSchema = z.object({
  flag_id: z.string(),
  flag_title: z.string(),
  resolution_type: ResolutionTypeSchema,
});
export type FlagResolution = z.infer<typeof FlagResolutionSchema>;

/**
 * Individual recommendation
 */
export const RecommendationSchema = z.object({
  rec_id: z.string(),
  title: z.string(),
  type: RecommendationTypeSchema,
  effort: EffortLevelSchema,
  timeframe: TimeframeSchema,
  description: z.string(),
  steps: z.array(z.string()).min(1),
  owner_suggestion: z.string(),
  flags_addressed: z.array(z.string()),
  dependencies: z.array(z.string()),
  success_criteria: z.string(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Remediation strategy grouping recommendations
 */
export const StrategySchema = z.object({
  strategy_id: z.string(),
  strategy_name: z.string(),
  strategy_goal: z.string(),
  priority: z.number().int().positive(),
  timeframe: TimeframeSchema,
  flags_resolved: z.array(FlagResolutionSchema),
  recommendations: z.array(RecommendationSchema).min(1),
});
export type Strategy = z.infer<typeof StrategySchema>;

/**
 * Implementation phase
 */
export const ImplementationPhaseSchema = z.object({
  phase_number: z.number().int().positive(),
  phase_name: z.string(),
  recommendations: z.array(z.string()).min(1),
  milestone: z.string(),
});
export type ImplementationPhase = z.infer<typeof ImplementationPhaseSchema>;

/**
 * Implementation sequence
 */
export const ImplementationSequenceSchema = z.object({
  description: z.string(),
  phases: z.array(ImplementationPhaseSchema).min(1),
});
export type ImplementationSequence = z.infer<
  typeof ImplementationSequenceSchema
>;

/**
 * Risk state snapshot
 */
export const RiskStateSchema = z.object({
  risk_tier: RiskTierSchema,
  data_sensitivity: z.number().int().min(1).max(5),
  decision_impact: z.number().int().min(1).max(5),
  affected_parties: z.number().int().min(1).max(5),
  human_oversight: z.number().int().min(1).max(5),
  governance_status: GovernanceStatusSchema,
});
export type RiskState = z.infer<typeof RiskStateSchema>;

/**
 * Projected risk state after remediation
 */
export const ProjectedRiskStateSchema = z.object({
  risk_tier: RiskTierSchema,
  changes: z.array(z.string()).min(1),
});
export type ProjectedRiskState = z.infer<typeof ProjectedRiskStateSchema>;

/**
 * Risk reduction projection
 */
export const RiskReductionProjectionSchema = z.object({
  current_state: RiskStateSchema,
  after_quick_wins: ProjectedRiskStateSchema,
  after_full_remediation: ProjectedRiskStateSchema,
  residual_risk_note: z.string(),
});
export type RiskReductionProjection = z.infer<
  typeof RiskReductionProjectionSchema
>;

/**
 * Plan summary
 */
export const PlanSummarySchema = z.object({
  total_recommendations: z.number().int().nonnegative(),
  total_strategies: z.number().int().nonnegative(),
  flags_addressed: z.number().int().nonnegative(),
  flags_total: z.number().int().nonnegative(),
  quick_wins_available: z.number().int().nonnegative(),
  projected_risk_tier_after_full_remediation: RiskTierSchema,
  projected_risk_tier_after_quick_wins: RiskTierSchema,
  executive_summary: z.string(),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

/**
 * Consolidation record tracking merged recommendations
 */
export const ConsolidationRecordSchema = z.object({
  merged_from: z.array(z.string()).min(1),
  merged_into: z.string(),
  reason: z.string(),
});
export type ConsolidationRecord = z.infer<typeof ConsolidationRecordSchema>;

/**
 * Metadata about plan generation
 */
export const MetadataSchema = z.object({
  schema_version: z.string(),
  prompt_version: z.string(),
  generation_rules_applied: z.array(z.string()),
  consolidations_performed: z.array(ConsolidationRecordSchema),
});
export type Metadata = z.infer<typeof MetadataSchema>;

/**
 * Complete remediation plan
 */
export const RemediationPlanSchema = z.object({
  tool_name: z.string(),
  tool_tier: z.string(),
  current_risk_tier: RiskTierSchema,
  current_governance_status: GovernanceStatusSchema,
  generated_at: z.string(),
  plan_summary: PlanSummarySchema,
  strategies: z.array(StrategySchema),
  implementation_sequence: ImplementationSequenceSchema,
  risk_reduction_projection: RiskReductionProjectionSchema,
});
export type RemediationPlan = z.infer<typeof RemediationPlanSchema>;

/**
 * Request to generate remediation plan
 */
export const RecommendationRequestSchema = z.object({
  tool_profile: z.any(), // ToolIntelligenceProfile from Prompt 1
  risk_classification: z.any(), // RiskClassification from Prompt 2
  flag_report: z.any(), // FlagReport from Prompt 3
});
export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;

/**
 * LLM response wrapper
 */
export const RecommendationResponseSchema = z.object({
  remediation_plan: RemediationPlanSchema,
  metadata: MetadataSchema,
});
export type RecommendationResponse = z.infer<
  typeof RecommendationResponseSchema
>;

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
