export type PlanTier = "STARTER" | "SHIELD" | "ENTERPRISE";

export interface FeatureMatrix {
    promptMonitoring: boolean;
    sensitiveDataDetection: boolean;
    riskScore: boolean;
    aiAppDetection: boolean;
    alerts: boolean;
    redaction: boolean;
    blocking: boolean;
    attachmentScanning: boolean;
    adminDashboard: boolean;
    auditLogs: boolean;
    teamPolicies: boolean;
    sso: boolean;
    apiAccess: boolean;
    policyEditor: boolean;
}

export const PLAN_FEATURES: Record<PlanTier, FeatureMatrix> = {
    STARTER: {
        promptMonitoring: true,
        sensitiveDataDetection: true,
        riskScore: true,
        aiAppDetection: true,
        alerts: true,
        redaction: false,
        blocking: false,
        attachmentScanning: false,
        adminDashboard: true,
        auditLogs: true,
        teamPolicies: false,
        sso: false,
        apiAccess: false,
        policyEditor: false,
    },
    SHIELD: {
        promptMonitoring: true,
        sensitiveDataDetection: true,
        riskScore: true,
        aiAppDetection: true,
        alerts: true,
        redaction: true,
        blocking: true,
        attachmentScanning: true,
        adminDashboard: true,
        auditLogs: true,
        teamPolicies: true,
        sso: false,
        apiAccess: false,
        policyEditor: true,
    },
    ENTERPRISE: {
        promptMonitoring: true,
        sensitiveDataDetection: true,
        riskScore: true,
        aiAppDetection: true,
        alerts: true,
        redaction: true,
        blocking: true,
        attachmentScanning: true,
        adminDashboard: true,
        auditLogs: true,
        teamPolicies: true,
        sso: true,
        apiAccess: true,
        policyEditor: true,
    },
};

export const DEFAULT_PLAN: PlanTier = "STARTER";

export function getFeaturesForPlan(plan: string | undefined): FeatureMatrix {
    const tier = (plan?.toUpperCase() as PlanTier) || DEFAULT_PLAN;
    return PLAN_FEATURES[tier] || PLAN_FEATURES[DEFAULT_PLAN];
}
