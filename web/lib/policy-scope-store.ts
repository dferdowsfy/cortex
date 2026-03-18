import crypto from "crypto";
import { adminDb } from "./firebase/admin";
import { localStorage } from "./local-storage";

export type EnforcementAction = "block" | "allow" | "audit_only" | "redact" | "warn";

export interface PolicyRule {
  rule_id: string;
  type: string;
  target: string;
  action: EnforcementAction;
  priority: number;
  enabled: boolean;
}

export interface ScopedPolicy {
  policy_id: string;
  scope_type: "org" | "group" | "user";
  scope_id: string;
  org_id: string;
  version: number;
  rules: PolicyRule[];
  updated_at: string;
}

const POLICIES_PATH = "scoped_policies";

class PolicyScopeStore {
  async getPolicy(scope_type: "org" | "group" | "user", scope_id: string, workspaceId = "default"): Promise<ScopedPolicy | null> {
    if (adminDb && adminDb.app.options.databaseURL) {
      const snap = await adminDb.ref(POLICIES_PATH).orderByChild("scope_id").equalTo(scope_id).get();
      if (snap.exists()) {
        const values = Object.values(snap.val()) as ScopedPolicy[];
        return values.find((p) => p.scope_type === scope_type) || null;
      }
    } else {
      const policies = localStorage.getWorkspaceData(workspaceId, POLICIES_PATH, {}) as Record<string, ScopedPolicy>;
      return Object.values(policies).find((p) => p.scope_type === scope_type && p.scope_id === scope_id) || null;
    }

    return null;
  }

  async upsertPolicy(
    scope_type: "org" | "group" | "user",
    scope_id: string,
    org_id: string,
    rules: PolicyRule[],
    workspaceId = "default"
  ): Promise<ScopedPolicy> {
    const existing = await this.getPolicy(scope_type, scope_id, workspaceId);
    const policy_id = existing?.policy_id || crypto.randomUUID();

    const policy: ScopedPolicy = {
      policy_id,
      scope_type,
      scope_id,
      org_id,
      version: (existing?.version || 0) + 1,
      rules,
      updated_at: new Date().toISOString(),
    };

    if (adminDb && adminDb.app.options.databaseURL) {
      await adminDb.ref(`${POLICIES_PATH}/${policy_id}`).set(policy);
    } else {
      const policies = localStorage.getWorkspaceData(workspaceId, POLICIES_PATH, {}) as Record<string, ScopedPolicy>;
      policies[policy_id] = policy;
      localStorage.setWorkspaceData(workspaceId, POLICIES_PATH, policies);
    }

    return policy;
  }
}

export const policyScopeStore = new PolicyScopeStore();
