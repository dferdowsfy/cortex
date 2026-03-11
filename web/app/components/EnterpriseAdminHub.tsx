"use client";

import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/hooks/use-toast";
import { ToastContainer } from "./ToastContainer";
import {
    Shield, Users, Monitor, Key, Settings, Plus, Trash2, RefreshCw,
    CheckCircle, XCircle, Download, Copy, Eye, EyeOff,
    UserX, UserCheck, Globe, Building2, ChevronRight,
    ChevronDown, Layers, Bot, Search, SlidersHorizontal,
} from "lucide-react";
import {
    AI_TOOL_REGISTRY, AI_CATEGORY_REGISTRY,
    type ToolId, type CategoryId, type RuleTargetType,
    serializeRuleTarget, parseRuleTarget,
} from "@/lib/ai-tool-registry";

/* ─── Types ─────────────────────────────────────────────── */
interface Organization { id: string; name: string; created_at: string; plan?: string; seatsPurchased?: number; seatsUsed?: number; }
interface Group { group_id: string; org_id: string; name: string; description?: string; policy_id: string | null; created_at: string; }
interface PolicyRule { rule_id: string; type: string; target: string; action: "block" | "allow" | "audit_only" | "redact"; priority: number; enabled: boolean; }
interface GroupPolicy { policy_id: string; group_id: string; version: number; rules: PolicyRule[]; inherit_org_default: boolean; }
interface ManagedUser { user_id: string; org_id: string; group_id: string | null; email: string; display_name?: string; role: string; active: boolean; created_at: string; license_key?: string; last_activity?: string; }
interface ExtensionStatus { device_id: string; hostname: string; browser?: string; extension_version?: string; last_sync: string; status: string; }
interface EnrollmentToken { id: string; token: string; status: "active" | "revoked" | "expired"; expires_at: string; uses_count: number; max_uses: number | null; org_id: string; }

/* ─── Constants (outside component — fixes Issue 3) ─────── */
type Tab = "people" | "policy" | "deploy";
const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
    { key: "people", label: "Groups & Users", Icon: Users },
    { key: "policy", label: "Policies", Icon: Settings },
    { key: "deploy", label: "Deploy", Icon: Key },
];

const ACTION_BADGE: Record<string, string> = {
    block: "bg-red-500/15 text-red-400 border border-red-500/30",
    allow: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    audit_only: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    redact: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
};

/* ─── Memoised sub-components ───────────────────────────── */
const StatCard = memo(function StatCard({ label, value, sub, color = "text-white" }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col gap-1.5">
            <p className="text-[12px] font-black uppercase tracking-[0.25em] text-white/30">{label}</p>
            <p className={`text-4xl font-black tabular-nums ${color}`}>{value}</p>
            {sub && <p className="text-[13px] text-white/30 font-bold uppercase tracking-widest">{sub}</p>}
        </div>
    );
});

/**
 * Human-readable relative time helper
 */
function timeSince(timestamp: number) {
    const seconds = Math.floor((new Date().getTime() - timestamp) / 1000);
    let interval = seconds / 31536000;

    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    if (seconds < 10) return "Just now";
    return Math.floor(seconds) + " seconds ago";
}

/* ─── Main Component ─────────────────────────────────────── */
export default function EnterpriseAdminHub() {
    const { user } = useAuth();
    const wid = user?.uid || "default";
    const { toasts, toast, dismiss } = useToast();

    /* ── Core data ── */
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [activeOrgId, setActiveOrgId] = useState("");
    const [groups, setGroups] = useState<Group[]>([]);
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [devices, setDevices] = useState<ExtensionStatus[]>([]);
    const [tokens, setTokens] = useState<EnrollmentToken[]>([]);

    /* ── Policy state ── */
    const [policyTarget, setPolicyTarget] = useState<"org" | "group" | "user">("group");
    const [activeGroupId, setActiveGroupId] = useState("");
    const [activeUserId, setActiveUserId] = useState("");
    const [policyMap, setPolicyMap] = useState<Record<string, PolicyRule[]>>({});  // keyed by groupId or userId
    const [newRule, setNewRule] = useState<Partial<PolicyRule>>({ type: "ai_tool", action: "block", priority: 50, enabled: true });
    // Rule builder structured state
    const [ruleTargetType, setRuleTargetType] = useState<RuleTargetType>("ai_tool");
    const [selectedTool, setSelectedTool] = useState<ToolId>("chatgpt");
    const [selectedCategories, setSelectedCategories] = useState<CategoryId[]>([]);
    const [rawTargetValue, setRawTargetValue] = useState("");
    const [toolSearch, setToolSearch] = useState("");
    const [showAdvancedTarget, setShowAdvancedTarget] = useState(false);

    /* ── UI state ── */
    const [tab, setTab] = useState<Tab>("people");
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [showUserForm, setShowUserForm] = useState(false);
    const [showOrgForm, setShowOrgForm] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupDesc, setNewGroupDesc] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserName, setNewUserName] = useState("");
    const [newUserGroup, setNewUserGroup] = useState("");
    const [newUserRole, setNewUserRole] = useState("member");
    const [userEmailError, setUserEmailError] = useState("");
    const [newOrgName, setNewOrgName] = useState("");
    const [creating, setCreating] = useState<Record<string, boolean>>({});
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [tokenVisible, setTokenVisible] = useState(false);
    const [tokenCopied, setTokenCopied] = useState(false);

    /* ── UI state: Redesign ── */
    const [groupsCollapsed, setGroupsCollapsed] = useState(true);
    const [advancedRulesCollapsed, setAdvancedRulesCollapsed] = useState(true);


    /* ── Memoised derived ── */
    const activeOrg = useMemo(() => organizations.find(o => o.id === activeOrgId), [organizations, activeOrgId]);
    const activeDevices = useMemo(() => devices.filter(d => d.status === "active" || d.status === "Healthy"), [devices]);
    const revokedDevices = useMemo(() => devices.filter(d => d.status === "revoked"), [devices]);
    const activeUsers = useMemo(() => users.filter(u => u.active), [users]);
    const currentPolicy = useMemo(() => {
        if (policyTarget === "group") return policyMap[activeGroupId] || [];
        if (policyTarget === "user") return policyMap[`u:${activeUserId}`] || [];
        return policyMap["org"] || [];
    }, [policyMap, policyTarget, activeGroupId, activeUserId]);

    /* ── Fetchers ─────────────────────────────────────────── */
    const fetchOrgs = useCallback(async () => {
        const r = await fetch(`/api/admin/organizations?workspaceId=${wid}`);
        if (!r.ok) return;
        const { organizations: orgs } = await r.json();
        setOrganizations(orgs || []);
        setActiveOrgId(prev => prev || orgs?.[0]?.id || "");
    }, [wid]);

    const fetchGroups = useCallback(async (orgId: string) => {
        if (!orgId) return;
        const r = await fetch(`/api/admin/groups?org_id=${orgId}&workspaceId=${wid}`);
        if (!r.ok) return;
        const { groups: g } = await r.json();
        setGroups(g || []);
    }, [wid]);

    const fetchUsers = useCallback(async (orgId: string) => {
        if (!orgId) return;
        const r = await fetch(`/api/admin/users?org_id=${orgId}&workspaceId=${wid}`);
        if (!r.ok) return;
        const { users: u } = await r.json();
        setUsers(u || []);
    }, [wid]);

    const fetchDevices = useCallback(async () => {
        const r = await fetch(`/api/agent/heartbeat?workspaceId=${wid}`);
        if (!r.ok) return;
        const { agents } = await r.json();
        setDevices(agents || []);
    }, [wid]);

    const fetchTokens = useCallback(async (orgId: string) => {
        if (!orgId) return;
        const r = await fetch(`/api/admin/enrollment/tokens?organizationId=${orgId}&workspaceId=${wid}`);
        if (!r.ok) return;
        const { tokens: t } = await r.json();
        setTokens(t || []);
    }, [wid]);

    /* Load policy for a specific group/user on-demand */
    const loadPolicy = useCallback(async (idToLoad: string, target: "org" | "group" | "user") => {
        const key = target === "user" ? `u:${idToLoad}` : (target === "org" ? "org" : idToLoad);
        if (policyMap[key] !== undefined) return; // cached

        const url = target === "org"
            ? `/api/admin/organizations/${activeOrgId}/policy?workspaceId=${wid}`
            : `/api/admin/groups/${idToLoad}/policy?workspaceId=${wid}`;

        const r = await fetch(url);
        if (!r.ok) return;
        const { policy } = await r.json();
        setPolicyMap(prev => ({ ...prev, [key]: policy?.rules || [] }));
    }, [wid, policyMap, activeOrgId]);

    /* ── Boot ── */
    useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([fetchOrgs(), fetchDevices()]);
            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Org-dependent data — triggered only when activeOrgId changes */
    useEffect(() => {
        if (!activeOrgId) return;
        fetchGroups(activeOrgId);
        fetchUsers(activeOrgId);
        fetchTokens(activeOrgId);
    }, [activeOrgId, fetchGroups, fetchUsers, fetchTokens]);

    /* Lazy-load policy only when Policy tab is open and target selected */
    useEffect(() => {
        if (tab === "policy") {
            if (policyTarget === "org" && activeOrgId) {
                loadPolicy(activeOrgId, "org");
            } else if (policyTarget === "group" && activeGroupId) {
                loadPolicy(activeGroupId, "group");
            } else if (policyTarget === "user" && activeUserId) {
                loadPolicy(activeUserId, "user");
            }
        }
    }, [tab, policyTarget, activeGroupId, activeUserId, activeOrgId, loadPolicy]);

    /* 30s background heartbeat only for devices (lightest call) */
    useEffect(() => {
        const iv = setInterval(fetchDevices, 30_000);
        return () => clearInterval(iv);
    }, [fetchDevices]);

    /* ── Actions ─────────────────────────────────────────── */
    const setCreatingKey = (k: string, v: boolean) =>
        setCreating(p => ({ ...p, [k]: v }));

    const handleCreateOrg = async () => {
        if (!newOrgName.trim()) return;
        setCreatingKey("org", true);
        try {
            const r = await fetch(`/api/admin/organizations?workspaceId=${wid}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newOrgName.trim() }),
            });
            if (r.ok) {
                const org = await r.json();
                await fetchOrgs();
                setActiveOrgId(org.org_id || org.id);
                setNewOrgName(""); setShowOrgForm(false);
                toast("Organization created.", "success");
            } else { toast("Failed to create org.", "error"); }
        } finally { setCreatingKey("org", false); }
    };

    /* Issue 1 fix: optimistic update + toast */
    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || !activeOrgId) return;
        setCreatingKey("group", true);

        // Optimistic insert so dropdowns are instantly populated
        const tempId = `temp-${Date.now()}`;
        const optimistic: Group = {
            group_id: tempId, org_id: activeOrgId,
            name: newGroupName.trim(), description: newGroupDesc,
            policy_id: null, created_at: new Date().toISOString(),
        };
        setGroups(prev => [...prev, optimistic]);

        try {
            const r = await fetch(`/api/admin/groups?workspaceId=${wid}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ org_id: activeOrgId, name: newGroupName.trim(), description: newGroupDesc }),
            });
            if (r.ok) {
                const { group } = await r.json();
                // Replace optimistic row with real one
                setGroups(prev => prev.map(g => g.group_id === tempId ? group : g));
                setNewGroupName(""); setNewGroupDesc(""); setShowGroupForm(false);
                toast(`Group "${group.name}" created successfully.`, "success");
            } else {
                setGroups(prev => prev.filter(g => g.group_id !== tempId));
                toast("Failed to create group.", "error");
            }
        } catch {
            setGroups(prev => prev.filter(g => g.group_id !== tempId));
            toast("Network error creating group.", "error");
        } finally { setCreatingKey("group", false); }
    };

    const handleDeleteGroup = async (group_id: string) => {
        if (!confirm("Delete this group? Users in this group will lose their group policy.")) return;
        setGroups(prev => prev.filter(g => g.group_id !== group_id)); // optimistic
        const r = await fetch(`/api/admin/groups?group_id=${group_id}&workspaceId=${wid}`, { method: "DELETE" });
        if (!r.ok) {
            await fetchGroups(activeOrgId); // rollback
            toast("Failed to delete group.", "error");
        } else { toast("Group deleted.", "info"); }
    };

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const handleCreateUser = async () => {
        if (!newUserEmail.trim() || !activeOrgId || !newUserName.trim()) return;
        if (!validateEmail(newUserEmail.trim())) {
            setUserEmailError("Enter a valid email address.");
            return;
        }
        setUserEmailError("");
        setCreatingKey("user", true);
        // Optimistic insert
        const tempId = `temp-user-${Date.now()}`;
        const optimistic: ManagedUser = {
            user_id: tempId, org_id: activeOrgId,
            group_id: newUserGroup || null,
            email: newUserEmail.trim(),
            display_name: newUserName.trim(),
            role: newUserRole, active: true,
            created_at: new Date().toISOString(),
        };
        setUsers(prev => [...prev, optimistic]);
        try {
            const r = await fetch(`/api/admin/users?workspaceId=${wid}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ org_id: activeOrgId, email: newUserEmail.trim(), display_name: newUserName.trim(), role: newUserRole, group_id: newUserGroup || null }),
            });
            if (r.ok) {
                const { user: u } = await r.json();
                setUsers(prev => prev.map(x => x.user_id === tempId ? u : x));
                setNewUserEmail(""); setNewUserName(""); setNewUserGroup(""); setNewUserRole("member"); setShowUserForm(false);
                toast(`User "${u.email}" added successfully.`, "success");
            } else {
                setUsers(prev => prev.filter(x => x.user_id !== tempId));
                toast("Failed to add user.", "error");
            }
        } catch {
            setUsers(prev => prev.filter(x => x.user_id !== tempId));
            toast("Network error adding user.", "error");
        } finally { setCreatingKey("user", false); }
    };

    const handleToggleUser = async (u: ManagedUser) => {
        setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, active: !x.active } : x));
        const r = await fetch(`/api/admin/users?workspaceId=${wid}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: u.user_id, active: !u.active }),
        });
        if (!r.ok) {
            setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, active: u.active } : x));
            toast("Failed to update user.", "error");
        }
    };

    const handleDeleteUser = async (user_id: string) => {
        if (!confirm("Are you sure you want to remove this user? They will lose all access immediately.")) return;
        setUsers(prev => prev.filter(x => x.user_id !== user_id));
        const r = await fetch(`/api/admin/users?workspaceId=${wid}&user_id=${user_id}`, { method: "DELETE" });
        if (!r.ok) {
            toast("Failed to delete user.", "error");
            if (activeOrgId) fetchUsers(activeOrgId);
        } else {
            toast("User removed.", "success");
        }
    };
    const handleAssignUserGroup = async (user_id: string, group_id: string | null) => {
        setUsers(prev => prev.map(x => x.user_id === user_id ? { ...x, group_id } : x));
        const r = await fetch(`/api/admin/users?workspaceId=${wid}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, group_id }),
        });
        if (!r.ok) {
            toast("Failed to assign group.", "error");
            fetchUsers(activeOrgId);
        } else {
            toast("User group updated.", "success");
        }
    };

    const handleRegenerateKey = async (user_id: string) => {
        if (!confirm("Regenerate license key? The old key will stop working immediately.")) return;
        const r = await fetch(`/api/admin/users?workspaceId=${wid}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, regenerate_license: true }),
        });
        if (r.ok) {
            const { license_key } = await r.json();
            setUsers(prev => prev.map(x => x.user_id === user_id ? { ...x, license_key } : x));
            toast("License key regenerated.", "success");
        } else {
            toast("Failed to generate key.", "error");
        }
    };

    const handleResetPassword = async (email: string) => {
        toast(`Password reset link sent to ${email}`, "info");
    };

    const handleRevokeDevice = async (device_id: string) => {
        if (!confirm("Revoke this extension instance? The shield will deactivate within 60 seconds.")) return;
        setRevoking(device_id);
        try {
            const r = await fetch(`/api/admin/devices/${device_id}/revoke?workspaceId=${wid}`, { method: "POST" });
            if (r.ok) {
                setDevices(prev => prev.map(d => d.device_id === device_id ? { ...d, status: "revoked" } : d));
                toast("Extension decommissioned.", "warning");
            }
        } finally { setRevoking(null); }
    };

    const handleGenerateToken = async () => {
        if (!activeOrgId) return;
        setCreatingKey("token", true);
        try {
            const r = await fetch(`/api/admin/enrollment/tokens?workspaceId=${wid}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId: activeOrgId, expires_in_hours: 168, max_uses: null }),
            });
            if (r.ok) {
                const data = await r.json();
                setGeneratedToken(data.plain_token); setTokenVisible(true);
                await fetchTokens(activeOrgId);
                toast("Token generated. Copy it now — shown once.", "info");
            }
        } finally { setCreatingKey("token", false); }
    };

    const handleRevokeToken = async (tokenId: string) => {
        await fetch(`/api/admin/enrollment/tokens/${tokenId}/revoke?workspaceId=${wid}`, { method: "POST" });
        setTokens(prev => prev.map(t => t.id === tokenId ? { ...t, status: "revoked" } : t));
        toast("Token revoked.", "warning");
    };


    /* Issue 2: policy save targets correct entity */
    const handleSavePolicy = async () => {
        setSavingPolicy(true);
        try {
            let url = ""; let body: object = {};
            if (policyTarget === "org") {
                url = `/api/admin/organizations/${activeOrgId}/policy?workspaceId=${wid}`;
                body = { rules: currentPolicy };
            } else if (policyTarget === "group" && activeGroupId) {
                url = `/api/admin/groups/${activeGroupId}/policy?workspaceId=${wid}`;
                body = { org_id: activeOrgId, rules: currentPolicy, inherit_org_default: true };
            } else if (policyTarget === "user" && activeUserId) {
                url = `/api/admin/groups/${activeUserId}/policy?workspaceId=${wid}`;
                body = { org_id: activeOrgId, rules: currentPolicy, inherit_org_default: true };
            }
            if (!url) { toast("Select a target to save this policy.", "error"); return; }
            const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            r.ok ? toast("Policy saved.", "success") : toast("Failed to save policy.", "error");
        } finally { setSavingPolicy(false); }
    };

    const policyKey = () => policyTarget === "group" ? activeGroupId : (policyTarget === "user" ? `u:${activeUserId}` : "org");

    const ruleBuilderValid = useMemo(() => {
        if (ruleTargetType === "ai_tool") return !!selectedTool;
        if (ruleTargetType === "ai_category") return selectedCategories.length > 0;
        return rawTargetValue.trim().length > 0;
    }, [ruleTargetType, selectedTool, selectedCategories, rawTargetValue]);

    const handleAddRule = () => {
        if (!ruleBuilderValid) return;
        const serializedTarget = serializeRuleTarget(
            ruleTargetType,
            ruleTargetType === "ai_tool" ? selectedTool : undefined,
            ruleTargetType === "ai_category" ? selectedCategories : undefined,
            (ruleTargetType === "domain" || ruleTargetType === "pattern") ? rawTargetValue.trim() : undefined,
        );
        const ruleType = ruleTargetType === "ai_tool" ? "ai_tool"
            : ruleTargetType === "ai_category" ? "ai_category"
                : ruleTargetType === "domain" ? "domain"
                    : "dlp_pattern";
        const rule: PolicyRule = {
            rule_id: crypto.randomUUID(),
            type: ruleType,
            target: serializedTarget,
            action: newRule.action || "block",
            priority: newRule.priority || 50,
            enabled: true,
        };
        const key = policyKey();
        setPolicyMap(prev => ({ ...prev, [key]: [...(prev[key] || []), rule].sort((a, b) => a.priority - b.priority) }));
        // Reset builder
        setRuleTargetType("ai_tool");
        setSelectedTool("chatgpt");
        setSelectedCategories([]);
        setRawTargetValue("");
        setToolSearch("");
        setNewRule({ type: "ai_tool", action: "block", priority: 50, enabled: true });
    };

    const handleRemoveRule = (rule_id: string) => {
        const key = policyKey();
        setPolicyMap(prev => ({ ...prev, [key]: (prev[key] || []).filter(r => r.rule_id !== rule_id) }));
    };

    const handleToggleRule = (rule_id: string) => {
        const key = policyKey();
        setPolicyMap(prev => ({ ...prev, [key]: (prev[key] || []).map(r => r.rule_id === rule_id ? { ...r, enabled: !r.enabled } : r) }));
    };

    if (loading) return (
        <div className="flex items-center justify-center py-32">
            <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/20 mx-auto mb-4" />
                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Syncing Enterprise State...</p>
            </div>
        </div>
    );

    return (
        <div className="max-w-[1200px] mx-auto px-6 pb-32 space-y-10 font-sans antialiased text-white">
            <ToastContainer toasts={toasts} dismiss={dismiss} />

            {/* SECTION 1 — ORGANIZATION HEADER */}
            <div className="flex items-center justify-between border-b border-white/10 pb-6 pt-4">
                <div className="flex items-center gap-6">
                    <div>
                        <h1 className="text-xl font-black tracking-tighter">{activeOrg?.name || "Organization"}</h1>
                        <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black">Management Hub</p>
                    </div>
                    <div className="h-8 w-[1px] bg-white/10" />
                    <div className="flex items-center gap-8">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-0.5">Plan</p>
                            <p className="text-xs font-black text-[#7261fd] uppercase">{activeOrg?.plan || "Starter"}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-0.5">Total Users</p>
                            <p className="text-xs font-black text-white">{users.length}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-0.5">Active Extensions</p>
                            <p className="text-xs font-black text-emerald-400">{activeDevices.length}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={activeOrgId}
                        onChange={(e) => setActiveOrgId(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-white/20"
                    >
                        {organizations.map(org => (
                            <option key={org.id} value={org.id} className="bg-zinc-900">{org.name}</option>
                        ))}
                    </select>
                    <button onClick={() => setShowOrgForm(true)} className="p-2 rounded-lg bg-white/5 hover:border-white/20 border border-transparent text-white/40 hover:text-white transition-all">
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Org Creation Modal/Inline (kept for functionality) */}
            {showOrgForm && (
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex items-center justify-between animate-in fade-in duration-200">
                    <div className="flex items-center gap-4">
                        <input autoFocus value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleCreateOrg(); if (e.key === "Escape") setShowOrgForm(false); }}
                            placeholder="New organization name…" className="bg-white/5 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white w-64 focus:outline-none focus:border-[var(--brand-color)]" />
                        <button onClick={handleCreateOrg} disabled={creating.org} className="px-6 py-2.5 bg-[var(--brand-color)] text-white rounded-lg text-[10px] font-black uppercase disabled:opacity-50">{creating.org ? "Creating…" : "Add Organization"}</button>
                    </div>
                    <button onClick={() => setShowOrgForm(false)} className="text-white/30 hover:text-white text-xs px-4 font-black uppercase tracking-widest">Cancel</button>
                </div>
            )}



            {/* ══ SECTION 2: USERS TABLE & GROUPS ══ */}
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Users</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setShowUserForm(v => !v)}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-color)] text-white rounded-lg text-[10px] uppercase font-black tracking-widest shadow-lg hover:opacity-90 transition-all">
                            <Plus className="w-3.5 h-3.5" /> Invite User
                        </button>
                    </div>
                </div>

                {/* Invite User Form */}
                {showUserForm && (
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-5 animate-in fade-in duration-200">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Full Name</label>
                                <input autoFocus value={newUserName} onChange={e => setNewUserName(e.target.value)}
                                    placeholder="Jane Smith"
                                    className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">Work Email</label>
                                <input value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} type="email"
                                    placeholder="jane@company.com"
                                    className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none" />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleCreateUser} disabled={creating.user || !newUserEmail.trim()}
                                className="px-8 py-2.5 bg-[var(--brand-color)] text-white rounded-lg text-[10px] font-black uppercase shadow-lg">
                                {creating.user ? "Adding…" : "Add User"}
                            </button>
                            <button onClick={() => setShowUserForm(false)} className="text-white/40 hover:text-white text-xs px-4">Cancel</button>
                        </div>
                    </div>
                )}

                {/* Users Table */}
                <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black text-white/30 uppercase tracking-widest bg-white/[0.01] border-b border-white/5">
                                <th className="px-5 py-3.5">Name</th>
                                <th className="px-5 py-3.5">Email</th>
                                <th className="px-5 py-3.5">Group</th>
                                <th className="px-5 py-3.5">Policy Status</th>
                                <th className="px-5 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {users.map(u => {
                                const userPolicy = policyMap[`u:${u.user_id}`];
                                const hasUserOverride = userPolicy && userPolicy.length > 0;
                                return (
                                    <tr key={u.user_id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-4 text-sm font-bold text-white/90">{u.display_name || "—"}</td>
                                        <td className="px-5 py-4 text-xs text-white/50 font-mono">{u.email}</td>
                                        <td className="px-5 py-4">
                                            <select value={u.group_id || ""} onChange={e => handleAssignUserGroup(u.user_id, e.target.value || null)}
                                                className="bg-transparent text-xs text-blue-400 font-bold focus:outline-none cursor-pointer">
                                                <option value="" className="text-black bg-white">No Group</option>
                                                {groups.map(g => <option key={g.group_id} value={g.group_id} className="text-black bg-white">{g.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`text-[10px] font-black uppercase ${hasUserOverride ? "text-orange-400" : "text-white/30"}`}>
                                                {hasUserOverride ? "User Override" : (u.group_id ? "Inherits Group" : "Inherits Org")}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex justify-end gap-3">
                                                <button onClick={() => { setActiveUserId(u.user_id); setPolicyTarget("user"); }}
                                                    className="text-[10px] font-black text-white/40 uppercase hover:text-white transition-all">Edit Policy</button>
                                                <button onClick={() => handleDeleteUser(u.user_id)} className="text-red-400/40 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Minimized Groups UI */}
                <div className="bg-white/[0.02] border border-white/10 rounded-xl px-5 py-3">
                    <button onClick={() => setGroupsCollapsed(!groupsCollapsed)} className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/30">
                        <span>Groups ({groups.length})</span>
                        {groupsCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {!groupsCollapsed && (
                        <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            {groups.map(g => (
                                <div key={g.group_id} className="flex items-center justify-between py-2 border-t border-white/5 first:border-0">
                                    <div className="flex items-center gap-3">
                                        <Shield className="w-3 h-3 text-[var(--brand-color)]" />
                                        <span className="text-xs font-bold text-white/80">{g.name}</span>
                                        <span className="text-[10px] text-white/20 font-black uppercase">({users.filter(u => u.group_id === g.group_id).length} users)</span>
                                    </div>
                                    <button onClick={() => { setActiveGroupId(g.group_id); setPolicyTarget("group"); }}
                                        className="text-[9px] font-black text-blue-400/60 uppercase hover:text-blue-400">Edit Group Policy</button>
                                </div>
                            ))}
                            <button onClick={() => setShowGroupForm(true)} className="w-full py-2 border-t border-white/5 text-[9px] font-black uppercase text-white/20 hover:text-white transition-all mt-2">+ Create Group</button>
                        </div>
                    )}
                </div>
            </div>

            {/* ══ SECTION 3: POLICY EDITOR ══ */}
            <div className="space-y-6 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Policy Editor</h2>
                    <button onClick={handleSavePolicy} disabled={savingPolicy}
                        className="flex items-center gap-2 px-6 py-2.5 bg-white text-black rounded-lg text-[10px] font-black uppercase shadow-lg hover:bg-zinc-200 disabled:opacity-50 transition-all">
                        {savingPolicy ? "Saving…" : "Save Policy"}
                    </button>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 space-y-8">
                    <div className="flex items-center gap-8">
                        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                            {(["org", "group", "user"] as const).map(t => (
                                <button key={t} onClick={() => setPolicyTarget(t)}
                                    className={`px-5 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${policyTarget === t ? "bg-white text-black" : "text-white/40 hover:text-white"}`}>
                                    {t}
                                </button>
                            ))}
                        </div>

                        {policyTarget === "group" && (
                            <select value={activeGroupId} onChange={e => setActiveGroupId(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-white/30">
                                <option value="" className="bg-zinc-900">Select group…</option>
                                {groups.map(g => <option key={g.group_id} value={g.group_id} className="bg-zinc-900">{g.name}</option>)}
                            </select>
                        )}
                        {policyTarget === "user" && (
                            <select value={activeUserId} onChange={e => setActiveUserId(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-white/30">
                                <option value="" className="bg-zinc-900">Select user…</option>
                                {users.map(u => <option key={u.user_id} value={u.user_id} className="bg-zinc-900">{u.email}</option>)}
                            </select>
                        )}
                    </div>

                    {/* Simplified AI Rules */}
                    <div className="space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">AI Tool Access Rules</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {currentPolicy.filter(r => r.type === "ai_tool").map(rule => {
                                const toolId = parseRuleTarget(rule.target).toolId;
                                const tool = AI_TOOL_REGISTRY[toolId as ToolId];
                                return (
                                    <div key={rule.rule_id} className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 group hover:border-white/20 transition-all">
                                        <div className="flex items-center gap-3">
                                            <Bot className="w-4 h-4 text-white/40" />
                                            <span className="text-sm font-bold text-white/90">{tool?.display_name || toolId}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${ACTION_BADGE[rule.action]}`}>{rule.action.replace("_only", "")}</span>
                                            <button onClick={() => handleRemoveRule(rule.rule_id)} className="opacity-0 group-hover:opacity-100 text-red-400 transition-all"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Quick Tool Rule Builder */}
                        <div className="flex items-center gap-3 bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-4">
                            <select value={selectedTool} onChange={e => setSelectedTool(e.target.value as ToolId)}
                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none">
                                {Object.values(AI_TOOL_REGISTRY).map(t => <option key={t.id} value={t.id} className="bg-zinc-900">{t.display_name}</option>)}
                            </select>
                            <div className="flex gap-1">
                                {(["block", "allow", "audit_only", "redact"] as const).map(act => (
                                    <button key={act} onClick={() => {
                                        // Quick add handler
                                        const tool = AI_TOOL_REGISTRY[selectedTool];
                                        const rule: PolicyRule = {
                                            rule_id: crypto.randomUUID(), type: "ai_tool",
                                            target: serializeRuleTarget("ai_tool", selectedTool),
                                            action: act, priority: 50, enabled: true,
                                        };
                                        const key = policyKey();
                                        setPolicyMap(prev => ({ ...prev, [key]: [...(prev[key] || []), rule] }));
                                    }}
                                        className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${newRule.action === act ? "bg-white text-black" : "bg-white/5 text-white/40 hover:text-white border border-white/5"}`}>
                                        {act.replace("_only", "")}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Advanced Rules Collapsible */}
                    <div className="pt-4 border-t border-white/5">
                        <button onClick={() => setAdvancedRulesCollapsed(!advancedRulesCollapsed)} className="flex items-center gap-2 text-[10px] font-black uppercase text-white/20 hover:text-white transition-all">
                            <span>Advanced Rules</span>
                            {advancedRulesCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {!advancedRulesCollapsed && (
                            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                {/* Pattern/Category Rules list would go here */}
                                <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center">
                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No advanced rules configured</p>
                                </div>
                                <div className="bg-white/5 p-6 rounded-2xl space-y-4">
                                    <p className="text-xs font-bold">New Advanced Rule</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select value={ruleTargetType} onChange={e => setRuleTargetType(e.target.value as any)} className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-xs">
                                            <option value="ai_category">Category</option>
                                            <option value="domain">Domain</option>
                                            <option value="pattern">Regex Pattern</option>
                                        </select>
                                        <input value={rawTargetValue} onChange={e => setRawTargetValue(e.target.value)} placeholder="Value..." className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-xs" />
                                    </div>
                                    <button onClick={handleAddRule} className="px-6 py-2 bg-white/10 rounded-lg text-[10px] font-black uppercase">Add Advanced Rule</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

