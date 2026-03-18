import { adminDb } from "./firebase/admin";
import { type PolicyRule } from "./policy-scope-store";

export interface EffectivePolicy {
    action: "block" | "allow" | "audit_only" | "redact" | "warn";
    rules: PolicyRule[];
    source: "user" | "group" | "org" | "platform";
    source_id: string;
    degraded_analysis_behavior?: "block" | "redact" | "audit_only" | "warn";
}

const PLATFORM_DEFAULT_RULES: PolicyRule[] = [
    {
        rule_id: "platform-default-safety",
        type: "ai_category",
        target: "category:malicious_use",
        action: "block",
        priority: 10,
        enabled: true
    }
];

/**
 * Resolves the effective policy for a user based on inheritance hierarchy:
 * 1. User Override
 * 2. Group Policy (first active one if multiple)
 * 3. Organization Policy
 * 4. Platform Default
 */
export async function getEffectivePolicy(
    uid: string,
    orgId: string,
    groupIds: string[] = []
): Promise<EffectivePolicy> {
    if (!adminDb) {
        return {
            action: "allow",
            rules: PLATFORM_DEFAULT_RULES,
            source: "platform",
            source_id: "default",
            degraded_analysis_behavior: "redact"
        };
    }

    // 1. Check User Override
    const userPolicySnap = await adminDb.ref(`policies/user/${uid}`).get();
    if (userPolicySnap.exists()) {
        const data = userPolicySnap.val();
        return {
            action: data.action || "audit_only",
            rules: data.rules || [],
            source: "user",
            source_id: uid,
            degraded_analysis_behavior: data.degraded_analysis_behavior || "redact"
        };
    }

    // 2. Check Group Policies
    if (groupIds.length > 0) {
        for (const gid of groupIds) {
            const groupPolicySnap = await adminDb.ref(`policies/group/${gid}`).get();
            if (groupPolicySnap.exists()) {
                const data = groupPolicySnap.val();
                return {
                    action: data.action || "audit_only",
                    rules: data.rules || [],
                    source: "group",
                    source_id: gid,
                    degraded_analysis_behavior: data.degraded_analysis_behavior || "redact"
                };
            }
        }
    }

    // 3. Check Organization Policy
    const orgPolicySnap = await adminDb.ref(`policies/org/${orgId}`).get();
    if (orgPolicySnap.exists()) {
        const data = orgPolicySnap.val();
        return {
            action: data.action || "audit_only",
            rules: data.rules || [],
            source: "org",
            source_id: orgId,
            degraded_analysis_behavior: data.degraded_analysis_behavior || "redact"
        };
    }

    // 4. Platform Default
    return {
        action: "audit_only",
        rules: PLATFORM_DEFAULT_RULES,
        source: "platform",
        source_id: "default",
        degraded_analysis_behavior: "redact"
    };
}
