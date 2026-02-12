/**
 * Shared test fixtures for Complyze tests.
 */
import type { ToolIntelligenceProfile, ExtractionRequest } from "../schema.js";

/**
 * A fully valid ChatGPT Free tier profile matching the spec example.
 */
export function validChatGPTProfile(): ToolIntelligenceProfile {
  return {
    tool_profile: {
      tool_name: "ChatGPT",
      vendor: "OpenAI",
      tier: "Free",
      tier_specified_by_user: true,
      category: "Generative AI Platform",
      ai_capability_types: [
        "Text generation",
        "Code generation",
        "Summarization",
        "Translation",
        "Data analysis",
        "Conversational AI",
      ],
      description:
        "ChatGPT is a general-purpose AI chatbot that can generate text, answer questions, write code, summarize documents, and assist with a wide range of tasks. Organizations commonly use it for drafting content, research assistance, brainstorming, and code help.",
      website: "https://chat.openai.com",
      knowledge_date_note:
        "Information based on publicly available data as of early 2025. OpenAI frequently updates terms and features — verify current policies before finalizing assessment.",
    },
    data_handling: {
      trains_on_user_data: {
        value: "Opt-out available",
        detail:
          "On the free tier, OpenAI may use conversations to improve their models by default. Users can opt out through settings, but this is a per-user action and cannot be enforced centrally by an organization.",
        confidence: "high",
      },
      data_retention: {
        value: "Retained for up to 30 days",
        detail:
          "OpenAI retains conversations for abuse monitoring. On free tier, there are no organizational controls over retention.",
        confidence: "medium",
      },
      data_residency: {
        value: "United States",
        detail:
          "Data is processed on OpenAI infrastructure primarily in the US. No data residency controls available on free tier.",
        confidence: "medium",
      },
      data_encryption: {
        in_transit: "Yes",
        at_rest: "Yes",
        confidence: "high",
      },
      third_party_data_sharing: {
        value: "Limited",
        detail:
          "OpenAI states data may be shared with service providers. On free tier, the data training policy means content effectively enters the model training pipeline unless individually opted out.",
        confidence: "medium",
      },
      data_handling_risk_summary:
        "The free tier allows OpenAI to use conversations for model training by default. Any sensitive, client, or proprietary information entered into ChatGPT Free may be incorporated into future model training data. Opt-out exists but cannot be enforced organizationally.",
    },
    security_posture: {
      soc2_certified: { value: "Yes", confidence: "high" },
      hipaa_eligible: {
        value: "Enterprise tier only",
        confidence: "high",
      },
      sso_support: {
        value: "No",
        detail:
          "SSO is not available on the free tier. Users authenticate with personal accounts.",
        confidence: "high",
      },
      audit_logging: { value: "No", confidence: "high" },
      access_controls: {
        value:
          "No centralized access controls. Individual user accounts only. Organization cannot manage, monitor, or revoke access.",
        confidence: "high",
      },
      other_certifications: [],
      security_risk_summary:
        "While OpenAI maintains SOC 2 certification at the infrastructure level, the free tier provides no organizational controls. There is no SSO, no admin console, no audit logging, and no way to centrally manage or monitor usage.",
    },
    enterprise_readiness: {
      has_enterprise_tier: true,
      enterprise_tier_name: "ChatGPT Enterprise",
      enterprise_improvements: [
        "Data is not used for model training",
        "SSO/SCIM support for centralized identity management",
        "Admin console with usage analytics",
        "Extended context windows",
        "Audit logging for compliance",
        "Custom data retention policies",
        "HIPAA eligibility with BAA",
      ],
      admin_console: "No",
      usage_analytics: "No",
      deployment_options: "Cloud only",
    },
    default_risk_assessment: {
      data_sensitivity_default: {
        score: 5,
        rationale:
          "Free tier allows model training on inputs with no organizational controls, making any sensitive data exposure effectively permanent.",
      },
      decision_impact_default: {
        score: 3,
        rationale:
          "General-purpose tool used for a wide range of tasks — decision impact varies widely but defaults to moderate as a general-purpose content and analysis assistant.",
      },
      affected_parties_default: {
        score: 3,
        rationale:
          "Outputs may affect internal teams and potentially external parties depending on use case. Cannot determine without organizational context.",
      },
      human_oversight_default: {
        score: 4,
        rationale:
          "Direct conversational interface means outputs are frequently used without formal review steps. No organizational workflow enforcement.",
      },
      // avg = (5+3+3+4)/4 = 3.75 → High; also override because 5
      overall_default_tier: "High",
      scoring_note:
        "These scores reflect the ChatGPT Free tier profile alone. Actual risk depends on how your organization uses it, what data employees enter, and whether outputs are reviewed before use.",
    },
    known_risk_flags: [
      {
        flag: "Model Training on User Inputs",
        severity: "Critical",
        description:
          "OpenAI may use conversations from free tier users to train future models. Any client data, proprietary information, or trade secrets entered into the tool could become part of OpenAI's training data. Individual opt-out exists but cannot be enforced by the organization.",
        source_confidence: "high",
      },
      {
        flag: "No Organizational Access Controls",
        severity: "High",
        description:
          "There is no way to centrally manage who uses ChatGPT Free, what they use it for, or to revoke access. Usage is invisible to IT and security teams.",
        source_confidence: "high",
      },
      {
        flag: "No Audit Trail",
        severity: "High",
        description:
          "No logging or monitoring capabilities exist on the free tier. If a data breach occurs through the tool, there is no way to determine what was shared or by whom.",
        source_confidence: "high",
      },
    ],
    enrichment_questions: [
      {
        question_id: "eq_01",
        question:
          "Approximately how many employees are using ChatGPT Free for work purposes?",
        why_it_matters:
          "The number of users directly affects the scale of potential data exposure and the urgency of implementing controls.",
        answer_format: "single_select",
        options: ["1-5", "6-20", "21-50", "50+", "Unknown"],
        risk_dimension_affected: "data_sensitivity",
      },
      {
        question_id: "eq_02",
        question:
          "What types of data are employees likely entering into ChatGPT?",
        why_it_matters:
          "The sensitivity of data being entered is the primary driver of data exposure risk.",
        answer_format: "multi_select",
        options: [
          "General research questions (non-sensitive)",
          "Internal documents or notes",
          "Client or customer data",
          "Financial or accounting data",
          "Code or proprietary intellectual property",
        ],
        risk_dimension_affected: "data_sensitivity",
      },
      {
        question_id: "eq_03",
        question:
          "Are ChatGPT outputs reviewed by a person before being used in work products?",
        why_it_matters:
          "Human review before use is a key control that reduces the risk of inaccurate or inappropriate AI outputs.",
        answer_format: "single_select",
        options: [
          "Always reviewed before use",
          "Usually reviewed but not always",
          "Rarely reviewed",
          "No review process exists",
          "Unknown",
        ],
        risk_dimension_affected: "human_oversight",
      },
    ],
    tier_upgrade_note:
      "Migrating from ChatGPT Free to ChatGPT Enterprise would address the most critical risks identified: data would no longer be used for model training, SSO would enable centralized access control, admin console would provide usage visibility, and audit logging would support compliance requirements.",
    metadata: {
      assessment_generated_at: "2026-02-12T00:00:00Z",
      schema_version: "1.0",
      overall_confidence: "high",
    },
  };
}

/**
 * A simple extraction request for ChatGPT Free.
 */
export function chatGPTRequest(): ExtractionRequest {
  return {
    tool_name: "ChatGPT",
    vendor: "OpenAI",
    tier: "Free",
  };
}
