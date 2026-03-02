import { adminDb } from "./firebase/admin";
import { localStorage } from "./local-storage";
import crypto from "crypto";

/* ─── Types ─────────────────────────────────────────────── */

export type RuleAction = "block" | "allow" | "audit_only" | "redact";
export type RuleType =
    | "block_domain"
    | "allow_domain"
    | "block_path"
    | "allow_path"
    | "ai_tool_block"
    | "ai_tool_allow"
    | "ai_tool_audit_only"
    | "dlp_pattern"
    | "dlp_keyword"
    | "max_payload_size"
    | "log_level"
    | "log_include_body"
    | "log_retention_days"
    | "schedule_allow"
    | "schedule_block";

export interface PolicyRule {
    rule_id: string;
    type: RuleType;
    target: string;      // domain, regex, keyword, tool name, etc.
    action: RuleAction;
    priority: number;    // lower = higher priority
    config?: Record<string, any>;
    enabled: boolean;
    created_at: string;
}

export interface GroupPolicy {
    policy_id: string;
    group_id: string;
    org_id: string;
    version: number;
    rules: PolicyRule[];
    inherit_org_default: boolean; // if true, org policy fills gaps
    updated_at: string;
    signature?: string;
}

export interface Group {
    group_id: string;
    org_id: string;
    name: string;
    description?: string;
    policy_id: string | null;
    created_at: string;
    updated_at: string;
}

const GROUPS_PATH = "groups";
const GROUP_POLICIES_PATH = "group_policies";

/* ─── Store ─────────────────────────────────────────────── */

class GroupStore {

    // ── Groups ──────────────────────────────────────────────

    async createGroup(org_id: string, name: string, description?: string, workspaceId: string = "default"): Promise<Group> {
        const group_id = crypto.randomUUID();
        const now = new Date().toISOString();
        const group: Group = {
            group_id,
            org_id,
            name,
            description,
            policy_id: null,
            created_at: now,
            updated_at: now,
        };

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${GROUPS_PATH}/${group_id}`).set(group);
        } else {
            const groups = localStorage.getWorkspaceData(workspaceId, "groups", {}) as Record<string, Group>;
            groups[group_id] = group;
            localStorage.setWorkspaceData(workspaceId, "groups", groups);
        }
        return group;
    }

    async getGroup(group_id: string, workspaceId: string = "default"): Promise<Group | null> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(`${GROUPS_PATH}/${group_id}`).get();
            if (snap.exists()) return snap.val() as Group;
        } else {
            const groups = localStorage.getWorkspaceData(workspaceId, "groups", {}) as Record<string, Group>;
            return groups[group_id] || null;
        }
        return null;
    }

    async listGroups(org_id: string, workspaceId: string = "default"): Promise<Group[]> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(GROUPS_PATH).orderByChild("org_id").equalTo(org_id).get();
            if (snap.exists()) return Object.values(snap.val());
        } else {
            const all = localStorage.getWorkspaceData(workspaceId, "groups", {}) as Record<string, Group>;
            return Object.values(all).filter((g: any) => g.org_id === org_id);
        }
        return [];
    }

    async updateGroup(group_id: string, updates: Partial<Pick<Group, "name" | "description">>, workspaceId: string = "default"): Promise<Group | null> {
        const group = await this.getGroup(group_id, workspaceId);
        if (!group) return null;
        const updated = { ...group, ...updates, updated_at: new Date().toISOString() };
        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${GROUPS_PATH}/${group_id}`).set(updated);
        } else {
            const groups = localStorage.getWorkspaceData(workspaceId, "groups", {}) as Record<string, Group>;
            groups[group_id] = updated;
            localStorage.setWorkspaceData(workspaceId, "groups", groups);
        }
        return updated;
    }

    async deleteGroup(group_id: string, workspaceId: string = "default"): Promise<void> {
        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${GROUPS_PATH}/${group_id}`).remove();
        } else {
            const groups = localStorage.getWorkspaceData(workspaceId, "groups", {}) as Record<string, Group>;
            delete groups[group_id];
            localStorage.setWorkspaceData(workspaceId, "groups", groups);
        }
    }

    // ── Group Policies ───────────────────────────────────────

    async createOrUpdatePolicy(group_id: string, org_id: string, rules: PolicyRule[], inherit_org_default: boolean = true, workspaceId: string = "default"): Promise<GroupPolicy> {
        const existing = await this.getPolicyByGroup(group_id, workspaceId);
        const policy_id = existing?.policy_id || crypto.randomUUID();
        const version = (existing?.version || 0) + 1;

        const policy: GroupPolicy = {
            policy_id,
            group_id,
            org_id,
            version,
            rules,
            inherit_org_default,
            updated_at: new Date().toISOString(),
        };

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${GROUP_POLICIES_PATH}/${policy_id}`).set(policy);
        } else {
            const policies = localStorage.getWorkspaceData(workspaceId, "group_policies", {}) as Record<string, GroupPolicy>;
            policies[policy_id] = policy;
            localStorage.setWorkspaceData(workspaceId, "group_policies", policies);
        }

        // Link policy to group
        const group = await this.getGroup(group_id, workspaceId);
        if (group) {
            group.policy_id = policy_id;
            group.updated_at = new Date().toISOString();
            if (adminDb && adminDb.app.options.databaseURL) {
                await adminDb.ref(`${GROUPS_PATH}/${group_id}`).set(group);
            } else {
                const groups = localStorage.getWorkspaceData(workspaceId, "groups", {}) as Record<string, Group>;
                groups[group_id] = group;
                localStorage.setWorkspaceData(workspaceId, "groups", groups);
            }
        }

        return policy;
    }

    async getPolicyByGroup(group_id: string, workspaceId: string = "default"): Promise<GroupPolicy | null> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(GROUP_POLICIES_PATH).orderByChild("group_id").equalTo(group_id).get();
            if (snap.exists()) {
                const vals = Object.values(snap.val()) as GroupPolicy[];
                return vals[0] || null;
            }
        } else {
            const policies = localStorage.getWorkspaceData(workspaceId, "group_policies", {}) as Record<string, GroupPolicy>;
            return Object.values(policies).find((p: any) => p.group_id === group_id) || null;
        }
        return null;
    }

    async getPolicy(policy_id: string, workspaceId: string = "default"): Promise<GroupPolicy | null> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(`${GROUP_POLICIES_PATH}/${policy_id}`).get();
            if (snap.exists()) return snap.val() as GroupPolicy;
        } else {
            const policies = localStorage.getWorkspaceData(workspaceId, "group_policies", {}) as Record<string, GroupPolicy>;
            return policies[policy_id] || null;
        }
        return null;
    }
}

export const groupStore = new GroupStore();

/* ─── Default Rule Templates ────────────────────────────── */

export const DEFAULT_RULE_TEMPLATES: Omit<PolicyRule, "rule_id" | "created_at">[] = [
    { type: "ai_tool_block", target: "character.ai", action: "block", priority: 10, enabled: false },
    { type: "ai_tool_block", target: "replika.com", action: "block", priority: 11, enabled: false },
    { type: "dlp_pattern", target: "\\b\\d{3}-\\d{2}-\\d{4}\\b", action: "redact", priority: 20, config: { description: "SSN pattern" }, enabled: true },
    { type: "dlp_pattern", target: "\\b4[0-9]{12}(?:[0-9]{3})?\\b", action: "redact", priority: 21, config: { description: "Credit card pattern" }, enabled: true },
    { type: "log_level", target: "full", action: "audit_only", priority: 100, enabled: true },
];
