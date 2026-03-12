import { enrollmentStore } from "@/lib/enrollment-store";
import { groupStore } from "@/lib/group-store";
import { policyScopeStore } from "@/lib/policy-scope-store";
import { userStore } from "@/lib/user-store";

export interface EffectivePolicyResult {
  userId: string;
  organizationId: string;
  groupIds: string[];
  resolvedPolicy: Record<string, any>;
  policyVersion: number;
  updatedAt: string;
  sourceBreakdown: {
    orgPolicy: any;
    matchingGroups: any[];
    userOverride: any;
  };
}

export async function resolveEffectivePolicy(params: {
  organizationId: string;
  userId?: string;
  email?: string;
  workspaceId?: string;
}): Promise<EffectivePolicyResult> {
  const workspaceId = params.workspaceId || "default";
  const org = await enrollmentStore.getOrganization(params.organizationId, workspaceId);
  if (!org) {
    throw new Error("Organization not found");
  }

  const users = await userStore.listUsers(org.org_id, workspaceId);
  const managedUser = users.find((u) => u.user_id === params.userId || (params.email && u.email.toLowerCase() === params.email.toLowerCase()));

  const groupIds = managedUser?.group_id ? [managedUser.group_id] : [];
  const groupPolicies = await Promise.all(groupIds.map((groupId) => groupStore.getPolicyByGroup(groupId, workspaceId)));
  const validGroupPolicies = groupPolicies.filter(Boolean) as any[];

  const userOverride = managedUser
    ? await policyScopeStore.getPolicy("user", managedUser.user_id, workspaceId)
    : null;

  const orgPolicy = org.policy_config || {};
  const mergedRules: any[] = [...(orgPolicy.rules || [])];

  for (const gp of validGroupPolicies) {
    if (!gp.inherit_org_default) {
      mergedRules.length = 0;
    }
    mergedRules.push(...(gp.rules || []));
  }

  if (userOverride?.rules?.length) {
    mergedRules.length = 0;
    mergedRules.push(...userOverride.rules);
  }

  const versions = [org.policy_version || 0, ...validGroupPolicies.map((p) => p.version || 0), userOverride?.version || 0];
  const policyVersion = Math.max(...versions, 0);
  const updatedAt = [org.created_at, ...validGroupPolicies.map((p) => p.updated_at), userOverride?.updated_at]
    .filter(Boolean)
    .sort()
    .at(-1) || new Date().toISOString();

  return {
    userId: managedUser?.user_id || params.userId || params.email || "unknown",
    organizationId: org.org_id,
    groupIds,
    resolvedPolicy: {
      ...orgPolicy,
      rules: mergedRules,
    },
    policyVersion,
    updatedAt,
    sourceBreakdown: {
      orgPolicy: orgPolicy,
      matchingGroups: validGroupPolicies,
      userOverride,
    },
  };
}
