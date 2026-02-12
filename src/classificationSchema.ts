/**
 * Complyze Prompt 2 — Risk Classification Schema
 *
 * Zod schemas for the classification input (enrichment answers) and
 * the full risk classification output.
 */
import { z } from "zod";
import { OverallTier } from "./schema.js";

// ---------------------------------------------------------------------------
// Shared enums for Prompt 2
// ---------------------------------------------------------------------------

export const GovernanceLevel = z.enum([
  "Managed",
  "Partially Managed",
  "Unmanaged",
  "Shadow AI",
]);
export type GovernanceLevel = z.infer<typeof GovernanceLevel>;

export const InputBasis = z.enum(["enrichment", "default"]);
export type InputBasis = z.infer<typeof InputBasis>;

export const ScoreChangeDirection = z.enum([
  "increased",
  "decreased",
  "unchanged",
]);
export type ScoreChangeDirection = z.infer<typeof ScoreChangeDirection>;

export const AssessmentType = z.enum(["initial", "reassessment"]);
export type AssessmentType = z.infer<typeof AssessmentType>;

export const AssessmentConfidence = z.enum(["High", "Medium", "Low"]);
export type AssessmentConfidence = z.infer<typeof AssessmentConfidence>;

// ---------------------------------------------------------------------------
// Input: Enrichment Answers
// ---------------------------------------------------------------------------

export const EnrichmentAnswerSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.union([z.string(), z.array(z.string())]),
});
export type EnrichmentAnswer = z.infer<typeof EnrichmentAnswerSchema>;

export const ClassificationRequestSchema = z.object({
  enrichment_answers: z.array(EnrichmentAnswerSchema),
  unanswered_question_ids: z.array(z.string()),
});
export type ClassificationRequest = z.infer<typeof ClassificationRequestSchema>;

// ---------------------------------------------------------------------------
// Output: Risk Classification
// ---------------------------------------------------------------------------

const ModifierSchema = z.object({
  modifier: z.string().min(1),
  adjustment: z.number().int(),
  reason: z.string().min(1),
});
export type Modifier = z.infer<typeof ModifierSchema>;

const DimensionScoreSchema = z.object({
  score: z.number().int().min(1).max(5),
  base_score: z.number().int().min(1).max(5),
  modifiers_applied: z.array(ModifierSchema),
  input_basis: InputBasis,
  key_inputs: z.array(z.string().min(1)).min(1),
  justification: z.string().min(10),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

const OverrideSchema = z.object({
  override_rule: z.string().min(1),
  effect: z.string().min(1),
});
export type Override = z.infer<typeof OverrideSchema>;

const GovernanceStatusSchema = z.object({
  level: GovernanceLevel,
  key_inputs: z.array(z.string().min(1)),
  gaps_identified: z.array(z.string()),
  justification: z.string().min(10),
});
export type GovernanceStatus = z.infer<typeof GovernanceStatusSchema>;

const OverallRiskSchema = z.object({
  tier: OverallTier,
  dimension_average: z.number().min(1).max(5),
  tier_from_average: OverallTier,
  overrides_applied: z.array(OverrideSchema),
  calculation_trace: z.string().min(10),
  summary: z.string().min(20),
});
export type OverallRisk = z.infer<typeof OverallRiskSchema>;

const ScoreChangeSchema = z.object({
  default_score: z.number().int().min(1).max(5),
  final_score: z.number().int().min(1).max(5),
  direction: ScoreChangeDirection,
  reason: z.string().min(1),
});
export type ScoreChange = z.infer<typeof ScoreChangeSchema>;

const ReassessmentChangeSchema = z.object({
  dimension: z.string().min(1),
  previous_score: z.number().int().min(1).max(5),
  new_score: z.number().int().min(1).max(5),
  change_driver: z.string().min(1),
});
export type ReassessmentChange = z.infer<typeof ReassessmentChangeSchema>;

const EnrichmentCoverageSchema = z.object({
  questions_total: z.number().int().min(0),
  questions_answered: z.number().int().min(0),
  questions_unanswered: z.number().int().min(0),
  unanswered_dimensions: z.array(z.string()),
  assessment_confidence: AssessmentConfidence,
  confidence_note: z.string().min(10),
});
export type EnrichmentCoverage = z.infer<typeof EnrichmentCoverageSchema>;

// ---------------------------------------------------------------------------
// Full Classification Output
// ---------------------------------------------------------------------------

export const RiskClassificationSchema = z.object({
  classification: z.object({
    tool_name: z.string().min(1),
    tool_tier: z.string().min(1),
    assessment_type: AssessmentType,

    dimensions: z.object({
      data_sensitivity: DimensionScoreSchema,
      decision_impact: DimensionScoreSchema,
      affected_parties: DimensionScoreSchema,
      human_oversight: DimensionScoreSchema,
    }),

    governance_status: GovernanceStatusSchema,

    overall_risk: OverallRiskSchema,

    score_comparison_to_defaults: z.object({
      data_sensitivity_change: ScoreChangeSchema,
      decision_impact_change: ScoreChangeSchema,
      affected_parties_change: ScoreChangeSchema,
      human_oversight_change: ScoreChangeSchema,
    }),

    enrichment_coverage: EnrichmentCoverageSchema,
  }),

  reassessment_comparison: z.object({
    is_reassessment: z.boolean(),
    previous_tier: OverallTier.nullable(),
    previous_scores: z.object({
      data_sensitivity: z.number().int().min(1).max(5).nullable(),
      decision_impact: z.number().int().min(1).max(5).nullable(),
      affected_parties: z.number().int().min(1).max(5).nullable(),
      human_oversight: z.number().int().min(1).max(5).nullable(),
    }),
    changes: z.array(ReassessmentChangeSchema),
    tier_changed: z.boolean(),
    change_summary: z.string().nullable(),
  }),

  metadata: z.object({
    classification_generated_at: z.string().min(1),
    schema_version: z.literal("1.0"),
    prompt_version: z.literal("risk_classification_v1"),
    tool_profile_version: z.string().min(1),
    rubric_version: z.literal("complyze_rubric_v1"),
  }),
});
export type RiskClassification = z.infer<typeof RiskClassificationSchema>;
