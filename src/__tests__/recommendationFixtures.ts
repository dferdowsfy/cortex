/**
 * Test fixtures for Prompt 4: Recommendation Engine
 */

import type {
  RecommendationRequest,
  RecommendationResponse,
  RemediationPlan,
  Strategy,
  Recommendation,
} from "../recommendationSchema.js";
import { validChatGPTProfile } from "./fixtures.js";
import { validChatGPTClassification } from "./classificationFixtures.js";

/**
 * Stub for validChatGPTFlags - minimal mock until Prompt 3 is implemented
 */
function validChatGPTFlags() {
  return {
    flags: [
      {
        flag_id: "flag_01",
        title: "Client Data Exposed to Vendor Model Training",
        severity: "Critical",
        category: "data_exposure",
        description: "Test flag",
        trigger_rule: "DE-1",
        risk_summary: "Test risk",
      },
      {
        flag_id: "flag_02",
        title: "No Centralized Access Management or Visibility",
        severity: "High",
        category: "access_control",
        description: "Test flag",
        trigger_rule: "AC-1",
        risk_summary: "Test risk",
      },
      {
        flag_id: "flag_03",
        title: "No Audit Trail for AI Usage",
        severity: "High",
        category: "access_control",
        description: "Test flag",
        trigger_rule: "AC-2",
        risk_summary: "Test risk",
      },
      {
        flag_id: "flag_04",
        title: "Client-Facing Deliverables Without Consistent Review",
        severity: "High",
        category: "output_risk",
        description: "Test flag",
        trigger_rule: "OR-1",
        risk_summary: "Test risk",
      },
      {
        flag_id: "flag_05",
        title: "AI Tool in Use Without Formal Approval",
        severity: "Medium",
        category: "governance_gap",
        description: "Test flag",
        trigger_rule: "GG-2",
        risk_summary: "Test risk",
      },
      {
        flag_id: "flag_06",
        title: "Client Data Processing Without Client Awareness",
        severity: "Medium",
        category: "regulatory_exposure",
        description: "Test flag",
        trigger_rule: "RE-1",
        risk_summary: "Test risk",
      },
    ],
    flag_summary: {
      critical: 1,
      high: 3,
      medium: 2,
      low: 0,
      total: 6,
    },
    executive_summary: "Test flag report",
  };
}

/**
 * Valid ChatGPT recommendation request (combines outputs from Prompts 1-3)
 */
export function chatGPTRecommendationRequest(): RecommendationRequest {
  return {
    tool_profile: validChatGPTProfile(),
    risk_classification: validChatGPTClassification(),
    flag_report: validChatGPTFlags(),
  };
}

/**
 * Valid ChatGPT remediation plan (simplified from spec example)
 */
export function validChatGPTRemediation(): RemediationPlan {
  return {
    tool_name: "ChatGPT",
    tool_tier: "Free",
    current_risk_tier: "Critical",
    current_governance_status: "Partially Managed",
    generated_at: "2026-02-12T00:00:00Z",

    plan_summary: {
      total_recommendations: 8,
      total_strategies: 3,
      flags_addressed: 6,
      flags_total: 6,
      quick_wins_available: 4,
      projected_risk_tier_after_full_remediation: "Low",
      projected_risk_tier_after_quick_wins: "High",
      executive_summary:
        "ChatGPT Free presents Critical risk due to client data exposure with no vendor data protections and no organizational controls. Three quick wins can be implemented this week to reduce immediate exposure: notifying users, restricting data types, and assigning a tool owner. The highest-impact action is migrating to ChatGPT Enterprise, which resolves four of six flags simultaneously by adding data protections, SSO, and audit logging. Full remediation including governance processes would reduce risk from Critical to Low within 8-12 weeks.",
    },

    strategies: [
      {
        strategy_id: "strat_01",
        strategy_name: "Immediate Risk Reduction",
        strategy_goal:
          "Reduce client data exposure and establish basic oversight within one week",
        priority: 1,
        timeframe: "Immediate",
        flags_resolved: [
          {
            flag_id: "flag_01",
            flag_title: "Client Data Exposed to Vendor Model Training",
            resolution_type: "Severity Reduced",
          },
          {
            flag_id: "flag_05",
            flag_title: "AI Tool in Use Without Formal Approval",
            resolution_type: "Partially Addressed",
          },
        ],
        recommendations: [
          {
            rec_id: "rec_01",
            title: "Notify All ChatGPT Users of Data Handling Risks",
            type: "Communicate",
            effort: "Quick Win",
            timeframe: "Immediate",
            description:
              "Send a direct communication to all employees known to use ChatGPT Free informing them that the tool may use their inputs to train future AI models.",
            steps: [
              "Identify all known ChatGPT users (estimated 21-50 based on current assessment)",
              "Draft a clear, non-technical communication explaining the data training risk and immediate restrictions on data types",
              "Send via email with read-receipt or equivalent acknowledgment mechanism",
              "Follow up within 3 business days with anyone who has not acknowledged",
              "Save acknowledgment records as evidence of risk communication",
            ],
            owner_suggestion: "Compliance Officer or IT Manager",
            flags_addressed: ["flag_01"],
            dependencies: [],
            success_criteria:
              "All identified ChatGPT users have received and acknowledged the data handling communication. Acknowledgment records are stored and accessible.",
          },
          {
            rec_id: "rec_02",
            title: "Assign a Tool Owner for ChatGPT",
            type: "Monitor",
            effort: "Quick Win",
            timeframe: "Immediate",
            description:
              "Designate a specific person as the organizational owner of ChatGPT. This person will be responsible for maintaining the user list, enforcing any usage restrictions, conducting periodic reviews, and serving as the escalation point for any AI-related concerns with this tool.",
            steps: [
              "Identify the appropriate person based on who currently has the most visibility into ChatGPT usage",
              "Formally assign ownership with a brief written description of responsibilities",
              "Ensure the tool owner has access to this Complyze assessment and understands the current risk classification",
              "Add a recurring calendar reminder for the tool owner to review ChatGPT status (monthly for Critical-tier tools)",
            ],
            owner_suggestion: "CISO or Compliance Officer (to assign), IT Team Lead (to own)",
            flags_addressed: ["flag_05"],
            dependencies: [],
            success_criteria:
              "A named tool owner is documented in Complyze with accepted responsibilities and a review schedule.",
          },
          {
            rec_id: "rec_03",
            title: "Enable Data Training Opt-Out for All Known Users",
            type: "Restrict",
            effort: "Quick Win",
            timeframe: "Immediate",
            description:
              "While migration to Enterprise tier is the proper solution, as an immediate measure, instruct all ChatGPT users to enable the data training opt-out in their individual account settings.",
            steps: [
              "Create a simple visual guide showing how to navigate to ChatGPT settings and disable the 'Improve the model for everyone' toggle",
              "Include this guide in the communication sent in rec_01",
              "Ask users to confirm they have completed this step",
              "Note in records that this is an interim measure — individual opt-out cannot be verified or enforced by the organization",
            ],
            owner_suggestion: "Tool Owner (once assigned)",
            flags_addressed: ["flag_01"],
            dependencies: ["rec_01"],
            success_criteria:
              "All acknowledged users have confirmed they disabled model training in their ChatGPT settings. Limitation documented: organization cannot verify compliance.",
          },
        ],
      },
      {
        strategy_id: "strat_02",
        strategy_name: "Enterprise Tier Migration",
        strategy_goal:
          "Resolve data protection, access control, and audit logging gaps by migrating to ChatGPT Enterprise",
        priority: 2,
        timeframe: "Short-term",
        flags_resolved: [
          {
            flag_id: "flag_01",
            flag_title: "Client Data Exposed to Vendor Model Training",
            resolution_type: "Fully Resolved",
          },
          {
            flag_id: "flag_02",
            flag_title: "No Centralized Access Management or Visibility",
            resolution_type: "Fully Resolved",
          },
          {
            flag_id: "flag_03",
            flag_title: "No Audit Trail for AI Usage",
            resolution_type: "Fully Resolved",
          },
          {
            flag_id: "flag_06",
            flag_title: "Client Data Processing Without Client Awareness",
            resolution_type: "Severity Reduced",
          },
        ],
        recommendations: [
          {
            rec_id: "rec_04",
            title: "Evaluate and Procure ChatGPT Enterprise",
            type: "Upgrade",
            effort: "Medium Effort",
            timeframe: "Short-term",
            description:
              "Migrate from ChatGPT Free to ChatGPT Enterprise (or ChatGPT Team as an intermediate option). Enterprise tier resolves the four most significant technical risk flags simultaneously: data is no longer used for model training, SSO enables centralized access control, admin console provides usage visibility, and audit logging supports compliance oversight.",
            steps: [
              "Request enterprise pricing from OpenAI based on estimated 21-50 users",
              "Evaluate ChatGPT Team tier as a faster, lower-cost intermediate option if Enterprise procurement will take longer than 30 days",
              "Prepare a business case for budget approval: frame as risk reduction (Critical to Moderate) and cite the four flags resolved",
              "Negotiate data processing agreement and review enterprise terms of service with legal",
              "Configure SSO integration with your identity provider during onboarding",
              "Migrate existing users from personal free accounts to managed enterprise accounts",
              "Decommission or block free-tier access after migration is complete",
            ],
            owner_suggestion: "IT Manager (procurement), CISO (approval), Tool Owner (migration)",
            flags_addressed: ["flag_01", "flag_02", "flag_03", "flag_06"],
            dependencies: ["rec_02"],
            success_criteria:
              "ChatGPT Enterprise is deployed with SSO enabled, all users migrated to managed accounts, free-tier access blocked, and admin console confirming data training is disabled.",
          },
        ],
      },
      {
        strategy_id: "strat_03",
        strategy_name: "Governance Foundation",
        strategy_goal:
          "Establish formal policies, review processes, and ongoing oversight for AI tool usage",
        priority: 3,
        timeframe: "Short-term",
        flags_resolved: [
          {
            flag_id: "flag_04",
            flag_title: "Client-Facing Deliverables Without Consistent Review",
            resolution_type: "Fully Resolved",
          },
          {
            flag_id: "flag_05",
            flag_title: "AI Tool in Use Without Formal Approval",
            resolution_type: "Fully Resolved",
          },
          {
            flag_id: "flag_06",
            flag_title: "Client Data Processing Without Client Awareness",
            resolution_type: "Partially Addressed",
          },
        ],
        recommendations: [
          {
            rec_id: "rec_05",
            title: "Draft AI Acceptable Use Policy for ChatGPT",
            type: "Policy",
            effort: "Low Effort",
            timeframe: "Short-term",
            description:
              "Create an acceptable use policy specific to ChatGPT (or a broader AI acceptable use policy if none exists for the organization). Based on this tool's risk profile, the policy should address: approved use cases, prohibited data types, mandatory review requirements, incident reporting, and consequences for policy violations.",
            steps: [
              "Review the risk flags and enrichment data in this assessment to identify policy requirements specific to your organization",
              "Draft the policy — focus on clear, short rules rather than lengthy legal language",
              "Review with legal counsel for any industry-specific requirements",
              "Obtain approval from appropriate leadership (CISO, CRO, or equivalent)",
              "Distribute to all ChatGPT users with acknowledgment requirement",
              "Store signed acknowledgments as governance evidence",
            ],
            owner_suggestion: "Compliance Officer, with legal review",
            flags_addressed: ["flag_05"],
            dependencies: [],
            success_criteria:
              "AI acceptable use policy is approved, distributed to all users, and signed acknowledgments are on file.",
          },
          {
            rec_id: "rec_06",
            title: "Establish Mandatory Review for Client-Facing AI Content",
            type: "Process",
            effort: "Low Effort",
            timeframe: "Short-term",
            description:
              "Implement a rule that any AI-assisted content intended for clients must be reviewed by a second person before delivery. This does not require a new tool or system — it can be integrated into existing quality review, approval workflows, or peer review practices.",
            steps: [
              "Identify which teams or roles are producing client-facing deliverables with ChatGPT assistance",
              "Determine where in existing workflows a review checkpoint can be added with minimal disruption",
              "Communicate the requirement to affected teams with clear expectations",
              "Add the review requirement to the acceptable use policy (rec_05)",
              "Spot-check compliance monthly for the first quarter",
            ],
            owner_suggestion: "Department Managers (for their teams), Tool Owner (for oversight)",
            flags_addressed: ["flag_04"],
            dependencies: [],
            success_criteria:
              "All teams producing client-facing AI-assisted content have a documented review step in their workflow. Spot-checks confirm compliance.",
          },
          {
            rec_id: "rec_07",
            title: "Review Client Contracts for AI Data Handling Obligations",
            type: "Process",
            effort: "Low Effort",
            timeframe: "Short-term",
            description:
              "Review active client contracts and standard engagement terms for clauses that may be affected by AI tool usage — particularly data handling, confidentiality, subprocessing, and technology usage provisions.",
            steps: [
              "Pull standard client contract template and identify relevant clauses (confidentiality, data handling, subprocessor, technology)",
              "Assess whether ChatGPT usage (even post-Enterprise migration) falls within existing contractual permissions",
              "If gaps exist, consult legal counsel on remediation approach (client notification, contract amendment, or updated terms for future engagements)",
              "Document findings and any required client communications",
              "Update standard engagement terms to address AI usage going forward",
            ],
            owner_suggestion: "Legal Counsel or Compliance Officer",
            flags_addressed: ["flag_06"],
            dependencies: [],
            success_criteria:
              "Client contracts have been reviewed, any gaps documented, remediation plan in place for affected contracts, and standard terms updated for future engagements.",
          },
          {
            rec_id: "rec_08",
            title: "Schedule Periodic Risk Reassessment",
            type: "Monitor",
            effort: "Quick Win",
            timeframe: "Short-term",
            description:
              "Set a recurring reassessment for this tool in Complyze. Given the current Critical risk tier, reassessment should occur every 30 days until the risk is reduced to High or below, then shift to quarterly.",
            steps: [
              "Set a 30-day reassessment reminder in Complyze for this tool",
              "At each reassessment, update enrichment answers to reflect changes (new tier, new policies, updated review practices)",
              "Review the reassessment diff to confirm risk reduction is tracking as expected",
              "Once risk tier drops to Moderate or Low, shift to quarterly reassessment cycle",
            ],
            owner_suggestion: "Tool Owner",
            flags_addressed: ["flag_05"],
            dependencies: ["rec_02"],
            success_criteria:
              "Reassessment schedule is set and first reassessment is completed within 30 days showing measurable risk reduction.",
          },
        ],
      },
    ],

    implementation_sequence: {
      description:
        "Start with the three quick wins in Week 1 to immediately reduce exposure. In parallel, begin the Enterprise tier procurement process. Once migration is complete, implement governance processes and schedule ongoing oversight.",
      phases: [
        {
          phase_number: 1,
          phase_name: "Week 1: Immediate Risk Reduction",
          recommendations: ["rec_01", "rec_02", "rec_03"],
          milestone:
            "All users notified and acknowledged, tool owner assigned, data training opt-out enabled. Client data entry prohibited pending migration.",
        },
        {
          phase_number: 2,
          phase_name: "Weeks 2-6: Enterprise Migration",
          recommendations: ["rec_04"],
          milestone:
            "ChatGPT Enterprise deployed, SSO configured, all users on managed accounts, free-tier access blocked.",
        },
        {
          phase_number: 3,
          phase_name: "Weeks 2-6: Governance Build (parallel with Phase 2)",
          recommendations: ["rec_05", "rec_06", "rec_07"],
          milestone:
            "Acceptable use policy approved and distributed, client-facing review process in place, client contracts reviewed.",
        },
        {
          phase_number: 4,
          phase_name: "Ongoing: Monitoring and Review",
          recommendations: ["rec_08"],
          milestone:
            "First reassessment completed showing risk reduction from Critical. Quarterly review cycle established.",
        },
      ],
    },

    risk_reduction_projection: {
      current_state: {
        risk_tier: "Critical",
        data_sensitivity: 5,
        decision_impact: 4,
        affected_parties: 4,
        human_oversight: 3,
        governance_status: "Partially Managed",
      },
      after_quick_wins: {
        risk_tier: "High",
        changes: [
          "Data Sensitivity may decrease from 5 to 4 if users comply with data type restrictions and enable training opt-out, but this cannot be verified technically on the free tier",
          "Governance Status improves from Partially Managed toward Managed with tool owner assignment",
          "Overall risk remains High because technical controls have not changed — only behavioral controls",
        ],
      },
      after_full_remediation: {
        risk_tier: "Low",
        changes: [
          "Data Sensitivity drops to 2 — Enterprise tier prevents model training, SSO enables access control, client data entry is governed by policy with review requirements",
          "Decision Impact drops to 3 — remains moderate due to content drafting use case, but mandatory review for client-facing outputs reduces uncontrolled impact",
          "Affected Parties drops to 2 — client data protections in place, review process prevents unvetted outputs reaching clients",
          "Human Oversight drops to 1 — mandatory review process established and enforced for client-facing content",
          "Governance Status becomes Managed — formal approval, policy, tool owner, and review cycle all in place",
        ],
      },
      residual_risk_note:
        "Even after full remediation, residual risk remains: employees may still use AI outputs without proper review in time-pressured situations, the AI may generate subtly inaccurate content that passes human review, and new AI features may be added to the Enterprise tier that introduce unforeseen risks. Ongoing monitoring through periodic reassessments is the primary control for residual risk.",
    },
  };
}

/**
 * Valid complete recommendation response
 */
export function validChatGPTRecommendations(): RecommendationResponse {
  return {
    remediation_plan: validChatGPTRemediation(),
    metadata: {
      schema_version: "1.0",
      prompt_version: "recommendation_engine_v1",
      generation_rules_applied: [
        "CR-1",
        "AV-1",
        "AV-2",
        "OQ-1",
        "GE-1",
        "GE-2",
        "GE-3",
        "VC-1",
        "VC-2",
      ],
      consolidations_performed: [
        {
          merged_from: [
            "AV-1: SSO upgrade recommendation",
            "AV-2: Audit logging upgrade recommendation",
            "VC-1: Enterprise migration recommendation",
          ],
          merged_into: "rec_04",
          reason:
            "All three are resolved by a single Enterprise tier migration. Consolidated into one recommendation to avoid redundant procurement actions.",
        },
      ],
    },
  };
}

/**
 * Build a recommendation with specific properties
 */
export function buildRecommendation(
  overrides: Partial<Recommendation>
): Recommendation {
  return {
    rec_id: "rec_test",
    title: "Test Recommendation",
    type: "Process",
    effort: "Low Effort",
    timeframe: "Short-term",
    description: "This is a test recommendation",
    steps: ["Step 1", "Step 2", "Step 3"],
    owner_suggestion: "Test Owner",
    flags_addressed: ["flag_01"],
    dependencies: [],
    success_criteria: "Test criteria met",
    ...overrides,
  };
}

/**
 * Build a strategy with specific properties
 */
export function buildStrategy(overrides: Partial<Strategy>): Strategy {
  return {
    strategy_id: "strat_test",
    strategy_name: "Test Strategy",
    strategy_goal: "Test goal",
    priority: 1,
    timeframe: "Short-term",
    flags_resolved: [
      {
        flag_id: "flag_01",
        flag_title: "Test Flag",
        resolution_type: "Fully Resolved",
      },
    ],
    recommendations: [buildRecommendation({ rec_id: "rec_test_01" })],
    ...overrides,
  };
}

/**
 * Build a remediation plan with specific properties
 */
export function buildRemediationPlan(
  overrides: Partial<RemediationPlan>
): RemediationPlan {
  const baseRec = buildRecommendation({ rec_id: "rec_01" });
  const baseStrat = buildStrategy({
    strategy_id: "strat_01",
    recommendations: [baseRec],
  });

  return {
    tool_name: "Test Tool",
    tool_tier: "Free",
    current_risk_tier: "High",
    current_governance_status: "Unmanaged",
    generated_at: "2026-02-12T00:00:00Z",
    plan_summary: {
      total_recommendations: 1,
      total_strategies: 1,
      flags_addressed: 1,
      flags_total: 1,
      quick_wins_available: 0,
      projected_risk_tier_after_full_remediation: "Low",
      projected_risk_tier_after_quick_wins: "Moderate",
      executive_summary: "Test executive summary",
    },
    strategies: [baseStrat],
    implementation_sequence: {
      description: "Test implementation sequence",
      phases: [
        {
          phase_number: 1,
          phase_name: "Phase 1",
          recommendations: ["rec_01"],
          milestone: "Test milestone",
        },
      ],
    },
    risk_reduction_projection: {
      current_state: {
        risk_tier: "High",
        data_sensitivity: 4,
        decision_impact: 3,
        affected_parties: 3,
        human_oversight: 4,
        governance_status: "Unmanaged",
      },
      after_quick_wins: {
        risk_tier: "Moderate",
        changes: ["Test change for quick wins"],
      },
      after_full_remediation: {
        risk_tier: "Low",
        changes: ["Test change for full remediation"],
      },
      residual_risk_note: "Test residual risk note",
    },
    ...overrides,
  };
}
