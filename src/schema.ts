/**
 * Complyze Tool Intelligence Schema — Zod definitions
 *
 * These schemas define and validate every field in the Prompt 1
 * "Tool Intelligence Profile" output. They are the single source of
 * truth for the JSON structure returned by the extraction LLM call.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const RiskSeverity = z.enum(["Critical", "High", "Medium", "Low"]);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const OverallTier = z.enum(["Low", "Moderate", "High", "Critical"]);
export type OverallTier = z.infer<typeof OverallTier>;

export const ToolCategory = z.enum([
  "Generative AI Platform",
  "AI Coding Assistant",
  "AI Writing Assistant",
  "AI-Embedded SaaS",
  "AI Transcription/Meeting",
  "AI Image/Video Generation",
  "AI Data Analysis",
  "AI Customer Service",
  "AI Sales/Marketing",
  "AI HR/Recruiting",
  "AI Security",
  "AI Search",
  "AI Agent/Automation",
  "Other AI Tool",
]);
export type ToolCategory = z.infer<typeof ToolCategory>;

export const AnswerFormat = z.enum([
  "single_select",
  "multi_select",
  "numeric",
  "yes_no",
]);
export type AnswerFormat = z.infer<typeof AnswerFormat>;

export const RiskDimension = z.enum([
  "data_sensitivity",
  "decision_impact",
  "affected_parties",
  "human_oversight",
  "governance_status",
]);
export type RiskDimension = z.infer<typeof RiskDimension>;

export const TrainsOnUserData = z.enum([
  "Yes",
  "No",
  "Opt-out available",
  "Varies by tier",
  "Unknown",
]);

export const YesNoUnknown = z.enum(["Yes", "No", "Unknown"]);

export const ThirdPartySharing = z.enum(["Yes", "No", "Limited", "Unknown"]);

// ---------------------------------------------------------------------------
// Tool Profile
// ---------------------------------------------------------------------------

export const ToolProfileSchema = z.object({
  tool_name: z.string().min(1),
  vendor: z.string().min(1),
  tier: z.string().min(1),
  tier_specified_by_user: z.boolean(),
  category: ToolCategory,
  ai_capability_types: z.array(z.string().min(1)).min(1),
  description: z.string().min(10),
  website: z.string().url(),
  knowledge_date_note: z.string().min(1),
});
export type ToolProfile = z.infer<typeof ToolProfileSchema>;

// ---------------------------------------------------------------------------
// Data Handling
// ---------------------------------------------------------------------------

const ConfidenceField = z.object({
  value: z.string().min(1),
  detail: z.string().min(1),
  confidence: Confidence,
});

export const DataHandlingSchema = z.object({
  trains_on_user_data: z.object({
    value: TrainsOnUserData,
    detail: z.string().min(1),
    confidence: Confidence,
  }),
  data_retention: ConfidenceField,
  data_residency: ConfidenceField,
  data_encryption: z.object({
    in_transit: YesNoUnknown,
    at_rest: YesNoUnknown,
    confidence: Confidence,
  }),
  third_party_data_sharing: z.object({
    value: ThirdPartySharing,
    detail: z.string().min(1),
    confidence: Confidence,
  }),
  data_handling_risk_summary: z.string().min(10),
});
export type DataHandling = z.infer<typeof DataHandlingSchema>;

// ---------------------------------------------------------------------------
// Security Posture
// ---------------------------------------------------------------------------

export const SecurityPostureSchema = z.object({
  soc2_certified: z.object({
    value: YesNoUnknown,
    confidence: Confidence,
  }),
  hipaa_eligible: z.object({
    value: z.string().min(1),
    confidence: Confidence,
  }),
  sso_support: z.object({
    value: z.string().min(1),
    detail: z.string().min(1),
    confidence: Confidence,
  }),
  audit_logging: z.object({
    value: z.string().min(1),
    confidence: Confidence,
  }),
  access_controls: z.object({
    value: z.string().min(1),
    confidence: Confidence,
  }),
  other_certifications: z.array(z.string()),
  security_risk_summary: z.string().min(10),
});
export type SecurityPosture = z.infer<typeof SecurityPostureSchema>;

// ---------------------------------------------------------------------------
// Enterprise Readiness
// ---------------------------------------------------------------------------

export const EnterpriseReadinessSchema = z.object({
  has_enterprise_tier: z.boolean(),
  enterprise_tier_name: z.string(),
  enterprise_improvements: z.array(z.string()),
  admin_console: z.string().min(1),
  usage_analytics: z.string().min(1),
  deployment_options: z.string().min(1),
});
export type EnterpriseReadiness = z.infer<typeof EnterpriseReadinessSchema>;

// ---------------------------------------------------------------------------
// Default Risk Assessment
// ---------------------------------------------------------------------------

const RiskScore = z.object({
  score: z.number().int().min(1).max(5),
  rationale: z.string().min(1),
});

export const DefaultRiskAssessmentSchema = z.object({
  data_sensitivity_default: RiskScore,
  decision_impact_default: RiskScore,
  affected_parties_default: RiskScore,
  human_oversight_default: RiskScore,
  overall_default_tier: OverallTier,
  scoring_note: z.string().min(1),
});
export type DefaultRiskAssessment = z.infer<typeof DefaultRiskAssessmentSchema>;

// ---------------------------------------------------------------------------
// Known Risk Flags
// ---------------------------------------------------------------------------

export const RiskFlagSchema = z.object({
  flag: z.string().min(1),
  severity: RiskSeverity,
  description: z.string().min(10),
  source_confidence: Confidence,
});
export type RiskFlag = z.infer<typeof RiskFlagSchema>;

// ---------------------------------------------------------------------------
// Enrichment Questions
// ---------------------------------------------------------------------------

export const EnrichmentQuestionSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(5),
  why_it_matters: z.string().min(5),
  answer_format: AnswerFormat,
  options: z.array(z.string()),
  risk_dimension_affected: RiskDimension,
});
export type EnrichmentQuestion = z.infer<typeof EnrichmentQuestionSchema>;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const MetadataSchema = z.object({
  assessment_generated_at: z.string().min(1),
  schema_version: z.literal("1.0"),
  overall_confidence: Confidence,
});
export type Metadata = z.infer<typeof MetadataSchema>;

// ---------------------------------------------------------------------------
// Full Tool Intelligence Profile (top-level)
// ---------------------------------------------------------------------------

export const ToolIntelligenceProfileSchema = z.object({
  tool_profile: ToolProfileSchema,
  data_handling: DataHandlingSchema,
  security_posture: SecurityPostureSchema,
  enterprise_readiness: EnterpriseReadinessSchema,
  default_risk_assessment: DefaultRiskAssessmentSchema,
  known_risk_flags: z.array(RiskFlagSchema).min(1),
  enrichment_questions: z.array(EnrichmentQuestionSchema).min(3),
  tier_upgrade_note: z.string().nullable(),
  metadata: MetadataSchema,
});
export type ToolIntelligenceProfile = z.infer<
  typeof ToolIntelligenceProfileSchema
>;

// ---------------------------------------------------------------------------
// Extraction Request (input)
// ---------------------------------------------------------------------------

export const ExtractionRequestSchema = z.object({
  tool_name: z.string().min(1),
  vendor: z.string().default("Unknown"),
  tier: z.string().default("Not specified"),
  additional_context: z.string().optional(),
});
export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>;
