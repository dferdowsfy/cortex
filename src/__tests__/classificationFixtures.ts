/**
 * Shared test fixtures for Prompt 2 (Risk Classification) tests.
 */
import type { RiskClassification } from "../classificationSchema.js";
import type { ClassificationRequest } from "../classificationSchema.js";
import type { ToolIntelligenceProfile } from "../schema.js";
import { validChatGPTProfile } from "./fixtures.js";

/**
 * Full enrichment answers for ChatGPT Free (matching the spec example).
 */
export function fullEnrichmentRequest(): ClassificationRequest {
  return {
    enrichment_answers: [
      {
        question_id: "eq_01",
        question:
          "Approximately how many employees are using ChatGPT Free for work purposes?",
        answer: "21-50",
      },
      {
        question_id: "eq_02",
        question:
          "What types of data are employees likely entering into ChatGPT?",
        answer: [
          "Internal documents or notes",
          "Client or customer data",
        ],
      },
      {
        question_id: "eq_03",
        question:
          "Are ChatGPT outputs reviewed by a person before being used in work products?",
        answer: "Usually reviewed but not always",
      },
    ],
    unanswered_question_ids: [],
  };
}

/**
 * Enrichment with some questions unanswered.
 */
export function partialEnrichmentRequest(): ClassificationRequest {
  return {
    enrichment_answers: [
      {
        question_id: "eq_01",
        question:
          "Approximately how many employees are using ChatGPT Free for work purposes?",
        answer: "6-20",
      },
    ],
    unanswered_question_ids: ["eq_02", "eq_03"],
  };
}

/**
 * Enrichment with zero answers (all defaults).
 */
export function emptyEnrichmentRequest(): ClassificationRequest {
  return {
    enrichment_answers: [],
    unanswered_question_ids: ["eq_01", "eq_02", "eq_03"],
  };
}

/**
 * A complete, valid Risk Classification for ChatGPT Free with full enrichment.
 * Scores: DS=5, DI=4, AP=4, HO=3 → avg 4.0 → High from average.
 * Override: DS=5 → minimum High. DS=5 AND HO<4 → no Critical override.
 * Final tier: High.
 */
export function validChatGPTClassification(): RiskClassification {
  return {
    classification: {
      tool_name: "ChatGPT",
      tool_tier: "Free",
      assessment_type: "initial",

      dimensions: {
        data_sensitivity: {
          score: 5,
          base_score: 4,
          modifiers_applied: [
            {
              modifier: "Vendor data training with sensitive inputs",
              adjustment: 1,
              reason:
                "OpenAI free tier allows model training on inputs (opt-out available but not organizationally enforceable), and employees are entering client/customer data which scores at base 4.",
            },
          ],
          input_basis: "enrichment",
          key_inputs: [
            "Data types entered: 'Internal documents or notes', 'Client or customer data'",
            "Tool trains on user data: 'Opt-out available' with no organizational enforcement",
          ],
          justification:
            "Employees are entering client data into a tool where the vendor may use that data for model training. While an opt-out setting exists, there is no way for the organization to enforce it. The combination of client data exposure and unenforceable data training controls results in the highest risk level for data sensitivity.",
        },

        decision_impact: {
          score: 4,
          base_score: 4,
          modifiers_applied: [],
          input_basis: "default",
          key_inputs: [
            "Default from tool profile: general-purpose content and analysis assistant.",
          ],
          justification:
            "No enrichment data was provided for use cases. The default score of 4 reflects that a general-purpose LLM may influence client-facing deliverables and operational decisions based on typical enterprise usage patterns.",
        },

        affected_parties: {
          score: 4,
          base_score: 4,
          modifiers_applied: [],
          input_basis: "enrichment",
          key_inputs: [
            "Data types include 'Client or customer data'",
          ],
          justification:
            "Client data is being entered into the tool, meaning external clients are directly affected by any data exposure risk. This drives the affected parties score to 4.",
        },

        human_oversight: {
          score: 2,
          base_score: 2,
          modifiers_applied: [],
          input_basis: "enrichment",
          key_inputs: [
            "Review practice: 'Usually reviewed but not always'",
          ],
          justification:
            "The organization reports that AI outputs are usually reviewed before use. While not perfectly consistent, this represents a meaningful human oversight control. The base score of 2 reflects 'usually reviewed but not always' per the rubric.",
        },
      },

      governance_status: {
        level: "Unmanaged",
        key_inputs: [
          "No enrichment answer provided for approval status",
        ],
        gaps_identified: [
          "No formal approval through IT or security review",
          "No acceptable use policy for this tool",
          "No designated tool owner",
          "No periodic review cycle",
        ],
        justification:
          "Without enrichment data confirming formal governance, the tool is classified as unmanaged. No formal approval, policy, or ownership has been confirmed.",
      },

      overall_risk: {
        tier: "High",
        dimension_average: 3.8,
        tier_from_average: "High",
        overrides_applied: [
          {
            override_rule:
              "Any dimension = 5 triggers minimum High",
            effect:
              "Data Sensitivity = 5 confirms tier cannot be below High. Average of 3.8 already maps to High.",
          },
        ],
        calculation_trace:
          "Data Sensitivity (5) + Decision Impact (4) + Affected Parties (4) + Human Oversight (2) = 15 / 4 = 3.8 → High per average mapping. Override: Data Sensitivity = 5 ensures minimum High.",
        summary:
          "ChatGPT Free is classified as High risk for this organization. Client data is being entered into a tool where the vendor may use it for model training, with no organizational ability to prevent this. Human oversight controls are partially in place but not consistently enforced. Immediate action is recommended to either migrate to an enterprise tier with data protections or restrict use to non-sensitive activities.",
      },

      score_comparison_to_defaults: {
        data_sensitivity_change: {
          default_score: 5,
          final_score: 5,
          direction: "unchanged",
          reason:
            "Enrichment confirmed the default assessment — client data is being entered into a tool without enterprise data protections.",
        },
        decision_impact_change: {
          default_score: 3,
          final_score: 4,
          direction: "increased",
          reason:
            "Default profile score was 3 but the classification engine elevated to 4 based on the tool profile context.",
        },
        affected_parties_change: {
          default_score: 3,
          final_score: 4,
          direction: "increased",
          reason:
            "Enrichment confirmed both client data input, meaning external parties are directly affected.",
        },
        human_oversight_change: {
          default_score: 4,
          final_score: 2,
          direction: "decreased",
          reason:
            "Enrichment revealed that reviews are 'usually' performed, which is better than the default assumption of infrequent review.",
        },
      },

      enrichment_coverage: {
        questions_total: 3,
        questions_answered: 3,
        questions_unanswered: 0,
        unanswered_dimensions: [],
        assessment_confidence: "High",
        confidence_note:
          "All enrichment questions were answered. This assessment reflects a complete picture of current organizational usage. Reassessment is recommended in 90 days or if usage patterns change significantly.",
      },
    },

    reassessment_comparison: {
      is_reassessment: false,
      previous_tier: null,
      previous_scores: {
        data_sensitivity: null,
        decision_impact: null,
        affected_parties: null,
        human_oversight: null,
      },
      changes: [],
      tier_changed: false,
      change_summary: null,
    },

    metadata: {
      classification_generated_at: "2026-02-12T00:00:00Z",
      schema_version: "1.0",
      prompt_version: "risk_classification_v1",
      tool_profile_version: "1.0",
      rubric_version: "complyze_rubric_v1",
    },
  };
}

/**
 * Build a classification fixture with custom dimension scores.
 * Useful for testing various tier/override scenarios.
 */
export function classificationWithScores(
  ds: number,
  di: number,
  ap: number,
  ho: number,
  governanceLevel: "Managed" | "Partially Managed" | "Unmanaged" | "Shadow AI" = "Unmanaged",
  assessmentType: "initial" | "reassessment" = "initial",
): RiskClassification {
  const avg = Math.round(((ds + di + ap + ho) / 4) * 10) / 10;

  let tierFromAverage: "Low" | "Moderate" | "High" | "Critical";
  if (avg <= 2.0) tierFromAverage = "Low";
  else if (avg <= 3.0) tierFromAverage = "Moderate";
  else if (avg <= 4.0) tierFromAverage = "High";
  else tierFromAverage = "Critical";

  let tier = tierFromAverage;
  const hasMax = ds === 5 || di === 5 || ap === 5 || ho === 5;
  if (hasMax && (tier === "Low" || tier === "Moderate")) tier = "High";
  if (ds === 5 && ho >= 4) tier = "Critical";
  if (governanceLevel === "Shadow AI" && (tier === "Low" || tier === "Moderate")) tier = "High";

  return {
    classification: {
      tool_name: "TestTool",
      tool_tier: "Free",
      assessment_type: assessmentType,
      dimensions: {
        data_sensitivity: {
          score: ds,
          base_score: ds,
          modifiers_applied: [],
          input_basis: "enrichment",
          key_inputs: ["Test input data sensitivity"],
          justification: "Test justification for data sensitivity score assignment based on test inputs.",
        },
        decision_impact: {
          score: di,
          base_score: di,
          modifiers_applied: [],
          input_basis: "enrichment",
          key_inputs: ["Test input decision impact"],
          justification: "Test justification for decision impact score assignment based on test inputs.",
        },
        affected_parties: {
          score: ap,
          base_score: ap,
          modifiers_applied: [],
          input_basis: "enrichment",
          key_inputs: ["Test input affected parties"],
          justification: "Test justification for affected parties score assignment based on test inputs.",
        },
        human_oversight: {
          score: ho,
          base_score: ho,
          modifiers_applied: [],
          input_basis: "enrichment",
          key_inputs: ["Test input human oversight"],
          justification: "Test justification for human oversight score assignment based on test inputs.",
        },
      },
      governance_status: {
        level: governanceLevel,
        key_inputs: ["Test governance input"],
        gaps_identified: [],
        justification: "Test governance justification explaining governance level.",
      },
      overall_risk: {
        tier,
        dimension_average: avg,
        tier_from_average: tierFromAverage,
        overrides_applied: [],
        calculation_trace: `DS(${ds}) + DI(${di}) + AP(${ap}) + HO(${ho}) = ${ds + di + ap + ho} / 4 = ${avg} → ${tier}`,
        summary: `Test tool classified as ${tier} risk based on test scores.`,
      },
      score_comparison_to_defaults: {
        data_sensitivity_change: {
          default_score: ds,
          final_score: ds,
          direction: "unchanged",
          reason: "Test — no change from default",
        },
        decision_impact_change: {
          default_score: di,
          final_score: di,
          direction: "unchanged",
          reason: "Test — no change from default",
        },
        affected_parties_change: {
          default_score: ap,
          final_score: ap,
          direction: "unchanged",
          reason: "Test — no change from default",
        },
        human_oversight_change: {
          default_score: ho,
          final_score: ho,
          direction: "unchanged",
          reason: "Test — no change from default",
        },
      },
      enrichment_coverage: {
        questions_total: 3,
        questions_answered: 3,
        questions_unanswered: 0,
        unanswered_dimensions: [],
        assessment_confidence: "High",
        confidence_note:
          "All enrichment questions were answered. This assessment reflects a complete picture.",
      },
    },
    reassessment_comparison: {
      is_reassessment: assessmentType === "reassessment",
      previous_tier: null,
      previous_scores: {
        data_sensitivity: null,
        decision_impact: null,
        affected_parties: null,
        human_oversight: null,
      },
      changes: [],
      tier_changed: false,
      change_summary: assessmentType === "reassessment" ? "No changes from previous assessment." : null,
    },
    metadata: {
      classification_generated_at: "2026-02-12T00:00:00Z",
      schema_version: "1.0",
      prompt_version: "risk_classification_v1",
      tool_profile_version: "1.0",
      rubric_version: "complyze_rubric_v1",
    },
  };
}
