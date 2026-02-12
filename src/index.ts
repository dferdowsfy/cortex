/**
 * Complyze — Public API
 */
export {
  // Schema & types
  ToolIntelligenceProfileSchema,
  ExtractionRequestSchema,
  type ToolIntelligenceProfile,
  type ExtractionRequest,
  type ToolProfile,
  type DataHandling,
  type SecurityPosture,
  type EnterpriseReadiness,
  type DefaultRiskAssessment,
  type RiskFlag,
  type EnrichmentQuestion,
  type Metadata,
  type ToolCategory,
  type Confidence,
  type OverallTier,
  type RiskSeverity,
  type AnswerFormat,
  type RiskDimension,
} from "./schema.js";

export {
  // Prompts
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "./prompts.js";

export {
  // Validation
  validateProfile,
  computeExpectedTier,
  type ValidationResult,
  type ValidationSuccess,
  type ValidationFailure,
} from "./validation.js";

export {
  // Extraction
  analyzeAITool,
  extractToolIntelligence,
  createAnthropicCaller,
  parseJsonResponse,
  type ExtractionConfig,
  type ExtractionResult,
  type ExtractionSuccess,
  type ExtractionError,
  type LLMCaller,
} from "./extraction.js";

export {
  // Classification Schema
  RiskClassificationSchema,
  ClassificationRequestSchema,
  EnrichmentAnswerSchema,
  type RiskClassification,
  type ClassificationRequest,
  type EnrichmentAnswer,
  type DimensionScore,
  type Modifier,
  type Override,
  type GovernanceStatus,
  type OverallRisk,
  type ScoreChange,
  type ReassessmentChange,
  type EnrichmentCoverage,
  type GovernanceLevel,
  type InputBasis,
  type ScoreChangeDirection,
  type AssessmentType,
  type AssessmentConfidence,
} from "./classificationSchema.js";

export {
  // Classification Prompts
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationUserPrompt,
} from "./classificationPrompts.js";

export {
  // Classification Validation
  validateClassification,
  computeClassificationTier,
  expectedDirection,
  type ClassificationValidationResult,
  type ClassificationValidationSuccess,
  type ClassificationValidationFailure,
} from "./classificationValidation.js";

export {
  // Classification Service
  classifyToolRisk,
  analyzeToolRisk,
  type ClassificationConfig,
  type ClassificationResult,
  type ClassificationSuccess,
  type ClassificationError,
} from "./classification.js";

export {
  // Recommendation Schema
  RemediationPlanSchema,
  RecommendationResponseSchema,
  RecommendationRequestSchema,
  type RemediationPlan,
  type RecommendationResponse,
  type RecommendationRequest,
  type Recommendation,
  type Strategy,
  type FlagResolution,
  type ImplementationPhase,
  type ImplementationSequence,
  type RiskReductionProjection,
  type PlanSummary,
  type EffortLevel,
  type Timeframe,
  type RecommendationType,
  type ResolutionType,
  type RiskTier,
} from "./recommendationSchema.js";

export {
  // Recommendation Prompts
  RECOMMENDATION_SYSTEM_PROMPT,
  buildRecommendationUserPrompt,
} from "./recommendationPrompts.js";

export {
  // Recommendation Validation
  validateRecommendationPlan,
} from "./recommendationValidation.js";

export {
  // Recommendation Service
  generateRecommendations,
  analyzeToolRecommendations,
} from "./recommendation.js";

export {
  // Board Summary Schema
  BoardSummaryResponseSchema,
  BoardSummaryRequestSchema,
  BoardSummarySchema,
  ReportMetadataSchema,
  PortfolioSnapshotSchema,
  ChangesSinceLastReportSchema,
  NarrativeSchema,
  AppendixDataSchema,
  FindingDetailSchema,
  ActionItemSchema,
  ToolSummaryRowSchema,
  OrganizationContextSchema,
  BoardSummaryMetadataSchema,
  ReportTypeSchema,
  PostureTrendSchema,
  ActionTypeSchema,
  UrgencySchema,
  RemediationStatusSchema,
  DataCompletenessSchema,
  type BoardSummaryResponse,
  type BoardSummaryRequest,
  type BoardSummary,
  type ReportMetadata,
  type PortfolioSnapshot,
  type ChangesSinceLastReport,
  type Narrative,
  type AppendixData,
  type FindingDetail,
  type ActionItem,
  type ToolSummaryRow,
  type OrganizationContext,
  type ToolAssessment,
  type BoardSummaryMetadata,
  type BoardSummaryValidationResult,
  type ReportType,
  type PostureTrend,
  type ActionType,
  type Urgency,
  type RemediationStatus,
  type DataCompleteness,
  type ToolsByRiskTier,
  type ToolsByGovernanceStatus,
  type ActiveFlags,
  type CategoryCount,
  type ChartData,
  type RiskTrendData,
  type ToolAdded,
  type ToolRemoved,
  type TierChange,
  type CriticalAndHighFindings,
  type LeadershipActionItems,
} from "./boardSummarySchema.js";

export {
  // Board Summary Prompts
  BOARD_SUMMARY_SYSTEM_PROMPT,
  buildBoardSummaryUserPrompt,
} from "./boardSummaryPrompts.js";

export {
  // Board Summary Validation
  validateBoardSummary,
} from "./boardSummaryValidation.js";

export {
  // Board Summary Service
  generateBoardSummary,
  generatePortfolioReport,
} from "./boardSummary.js";
