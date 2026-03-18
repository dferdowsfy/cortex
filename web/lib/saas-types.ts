/**
 * SaaS Governance Types & Entitlements
 */

export type UserRole = "super_admin" | "org_admin" | "group_admin" | "member";

export interface PlanFeatures {
    custom_policy: boolean;
    audit_log: boolean;
    saml: boolean;
    advanced_reporting: boolean;
}

export interface PlanEntitlements {
    id: string;
    name: string;
    max_users: number;
    max_groups: number;
    features: PlanFeatures;
}

export const PLANS: Record<string, PlanEntitlements> = {
    starter: {
        id: "starter",
        name: "Starter",
        max_users: 5,
        max_groups: 2,
        features: {
            custom_policy: false,
            audit_log: true,
            saml: false,
            advanced_reporting: false,
        },
    },
    team: {
        id: "team",
        name: "Team",
        max_users: 25,
        max_groups: 10,
        features: {
            custom_policy: true,
            audit_log: true,
            saml: false,
            advanced_reporting: true,
        },
    },
    enterprise: {
        id: "enterprise",
        name: "Enterprise",
        max_users: 10000,
        max_groups: 1000,
        features: {
            custom_policy: true,
            audit_log: true,
            saml: true,
            advanced_reporting: true,
        },
    },
};

export function getPlan(planId: string = "starter"): PlanEntitlements {
    return PLANS[planId] || PLANS.starter;
}
