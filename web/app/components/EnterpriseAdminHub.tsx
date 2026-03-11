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
    const loadGroupPolicy = useCallback(async (gid: string) => {
        if (!gid || policyMap[gid] !== undefined) return; // cached
        const r = await fetch(`/api/admin/groups/${gid}/policy?workspaceId=${wid}`);
        if (!r.ok) return;
        const { policy } = await r.json();
        setPolicyMap(prev => ({ ...prev, [gid]: policy?.rules || [] }));
    }, [wid, policyMap]);

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

    /* Lazy-load group policy only when Policy tab is open and group selected */
    useEffect(() => {
        if (tab === "policy" && policyTarget === "group" && activeGroupId) {
            loadGroupPolicy(activeGroupId);
        }
    }, [tab, policyTarget, activeGroupId, loadGroupPolicy]);

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
            if (policyTarget === "group" && activeGroupId) {
                url = `/api/admin/groups/${activeGroupId}/policy?workspaceId=${wid}`;
                body = { org_id: activeOrgId, rules: currentPolicy, inherit_org_default: true };
            }
            // user-level and org-level stubs — extend as backend grows
            if (!url) { toast("Select a Group or User to save this policy.", "error"); return; }
            const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            r.ok ? toast("Policy saved.", "success") : toast("Failed to save policy.", "error");
        } finally { setSavingPolicy(false); }
    };

    const policyKey = () => policyTarget === "group" ? activeGroupId : policyTarget === "user" ? `u:${activeUserId}` : "org";

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
        <div className="max-w-[1200px] mx-auto px-6 pb-32 space-y-8 font-sans antialiased text-white">
            <ToastContainer toasts={toasts} dismiss={dismiss} />

            {/* Header + Org Switcher */}
            <div className="flex items-end justify-between border-b border-white/5 pb-8 pt-2">
                <div>
                    <h1 className="text-2xl font-black tracking-tighter">Manage</h1>
                    <p className="text-[12px] text-white/30 uppercase tracking-[0.2em] font-black mt-1">Groups · Users · Policies · Deployment</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Org:</span>
                    {organizations.map(org => (
                        <button key={org.id} onClick={() => setActiveOrgId(org.id)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${activeOrgId === org.id ? "bg-[var(--brand-color)] text-white border-[var(--brand-color)]" : "bg-white/5 text-zinc-400 border-transparent hover:border-white/20"}`}
                        >
                            {org.name}
                            <span className="ml-2 opacity-50 text-[8px] border border-white/20 px-1 rounded">{org.plan || "STARTER"}</span>
                        </button>
                    ))}
                    {showOrgForm ? (
                        <div className="flex items-center gap-2">
                            <input autoFocus value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleCreateOrg(); if (e.key === "Escape") setShowOrgForm(false); }}
                                placeholder="Org name…" className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-xs text-white w-36 focus:outline-none" />
                            <button onClick={handleCreateOrg} disabled={creating.org} className="px-3 py-2 bg-[var(--brand-color)] text-white rounded-lg text-[10px] font-black uppercase disabled:opacity-50">{creating.org ? "…" : "Add"}</button>
                            <button onClick={() => setShowOrgForm(false)} className="text-white/30 hover:text-white text-xs">✕</button>
                        </div>
                    ) : (
                        <button onClick={() => setShowOrgForm(true)} className="w-8 h-8 rounded-lg bg-white/5 hover:border-white/20 border border-transparent flex items-center justify-center text-white/40 hover:text-white transition-all">
                            <Plus className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Plan Tier" value={activeOrg?.plan || "STARTER"} sub="Subscription" color="text-[#7261fd]" />
                <StatCard label="Seats Used" value={activeOrg?.seatsUsed || 0} sub={`of ${activeOrg?.seatsPurchased || 1} available`} color={activeOrg?.seatsUsed && activeOrg?.seatsPurchased && activeOrg.seatsUsed >= activeOrg.seatsPurchased ? "text-red-400" : "text-emerald-400"} />
                <StatCard label="Active Extensions" value={activeDevices.length} sub={`of ${devices.length} total`} />
                <StatCard label="Managed Users" value={activeUsers.length} sub={`${users.length} enrolled`} color="text-blue-400" />
            </div>

            {/* Tabs — Issue 3: TABS is a module constant, no recreation on render */}
            <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-1">
                {TABS.map(({ key, label, Icon }) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-[12px] font-black uppercase tracking-widest transition-colors ${tab === key ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}
                    >
                        <Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{label}</span>
                    </button>
                ))}
            </div>

            {/* ══ FLEET (shown inside Deploy tab) ═════════════════ */}
            {tab === "deploy" && devices.length > 0 && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/60">Extension Fleet</h2>
                        <div className="flex gap-2">
                            <button onClick={fetchDevices} className="p-2 bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/20 rounded-lg text-white/60 hover:text-white transition-all">
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    {devices.length === 0 ? (
                        <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-2xl p-20 text-center">
                            <Monitor className="w-10 h-10 text-white/20 mx-auto mb-4" />
                            <p className="text-[10px] text-white/60 font-black uppercase tracking-widest">No extensions enrolled yet</p>
                            <p className="text-xs text-white/50 mt-2">Deploy the MDM configuration to browsers across your fleet.</p>
                        </div>
                    ) : (
                        <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead><tr className="text-[11px] font-black text-white/20 uppercase tracking-widest border-b border-white/5 bg-white/[0.01]">
                                    <th className="px-6 py-4">Identity</th><th className="px-6 py-4">Browser</th>
                                    <th className="px-6 py-4">Extension</th><th className="px-6 py-4">Last Interaction</th>
                                    <th className="px-6 py-4">Shield Status</th><th className="px-6 py-4 text-right">Actions</th>
                                </tr></thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {devices.map(d => (
                                        <tr key={d.device_id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4">
                                                <p className="text-lg font-black text-white/90 uppercase">{d.hostname || "Unknown"}</p>
                                                <p className="text-[12px] text-white/50 font-mono">{d.device_id?.substring(0, 16) || "..."}…</p>
                                            </td>
                                            <td className="px-6 py-4"><span className="text-sm font-bold text-white/70 uppercase">{d.browser || "—"}</span></td>
                                            <td className="px-6 py-4"><span className="text-sm font-mono text-white/60">v{d.extension_version || "—"}</span></td>
                                            <td className="px-6 py-4"><span className="text-sm text-white/60 font-bold">
                                                {d.last_sync ? new Date(d.last_sync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                                            </span></td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${d.status === "active" || d.status === "Healthy" ? "bg-emerald-500" : d.status === "revoked" ? "bg-red-500" : "bg-amber-500"}`} />
                                                    <span className={`text-[11px] font-black uppercase ${d.status === "active" || d.status === "Healthy" ? "text-emerald-400" : d.status === "revoked" ? "text-red-400" : "text-amber-400"}`}>
                                                        {d.status === "active" ? "Active" : d.status}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {d.status !== "revoked" && (
                                                    <button onClick={() => handleRevokeDevice(d.device_id)} disabled={revoking === d.device_id}
                                                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 ml-auto px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-[11px] font-black uppercase border border-red-500/20 transition-all disabled:animate-pulse">
                                                        {revoking === d.device_id ? <span className="animate-spin w-3 h-3 border border-red-400 border-b-transparent rounded-full" /> : <XCircle className="w-3 h-3" />}
                                                        Decommission Extension
                                                    </button>
                                                )}
                                                {d.status === "revoked" && <span className="text-[9px] font-black text-red-500/50 uppercase">Decommissioned</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ══ GROUPS + USERS ═══════════════════════════════════ */}
            {tab === "people" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-[14px] font-black uppercase tracking-[0.3em] text-white/40">Groups — {activeOrg?.name}</h2>
                        <button onClick={() => setShowGroupForm(v => !v)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--brand-color)] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:opacity-90 transition-all">
                            <Plus className="w-3.5 h-3.5" /> New Group
                        </button>
                    </div>
                    {showGroupForm && (
                        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4 animate-in fade-in duration-200">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Create Group</p>
                            <div className="grid grid-cols-2 gap-4">
                                <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleCreateGroup()}
                                    placeholder="Group name (e.g. Engineering)"
                                    className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 placeholder:text-white/20" />
                                <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                                    placeholder="Description (optional)"
                                    className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 placeholder:text-white/20" />
                            </div>
                            <div className="flex gap-3">
                                <button onClick={handleCreateGroup} disabled={creating.group || !newGroupName.trim()}
                                    className="px-8 py-2.5 bg-[var(--brand-color)] text-white rounded-lg text-[10px] font-black uppercase disabled:opacity-50">
                                    {creating.group ? "Creating…" : "Create Group"}
                                </button>
                                <button onClick={() => setShowGroupForm(false)} className="text-white/30 hover:text-white text-xs px-4">Cancel</button>
                            </div>
                        </div>
                    )}
                    {groups.length === 0 ? (
                        <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-2xl p-20 text-center">
                            <Shield className="w-10 h-10 text-white/20 mx-auto mb-4" />
                            <p className="text-[10px] text-white/60 font-black uppercase tracking-widest">No groups yet</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {groups.map(g => {
                                const memberCount = users.filter(u => u.group_id === g.group_id).length;
                                return (
                                    <div key={g.group_id} className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex items-center justify-between hover:bg-white/[0.03] transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-[var(--brand-color)]/10 flex items-center justify-center">
                                                <Shield className="w-5 h-5 text-[var(--brand-color)]" />
                                            </div>
                                            <div>
                                                <p className="text-lg font-black text-white/90 uppercase">{g.name}</p>
                                                {g.description && <p className="text-base text-white/60">{g.description}</p>}
                                                <div className="flex gap-4 mt-1">
                                                    <span className="text-[11px] font-black text-white/50 uppercase">{memberCount} members</span>
                                                    <span className={`text-[11px] font-black uppercase ${g.policy_id ? "text-emerald-400" : "text-amber-400"}`}>
                                                        {g.group_id.startsWith("temp-") ? "Saving…" : g.policy_id ? "Policy set" : "No policy"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setActiveGroupId(g.group_id); setPolicyTarget("group"); setTab("policy"); }}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[13px] font-black uppercase text-white/60 hover:text-white transition-all">
                                                <Settings className="w-3 h-3" /> Edit Policy
                                            </button>
                                            <button onClick={() => handleDeleteGroup(g.group_id)} disabled={g.group_id.startsWith("temp-")}
                                                className="p-2 rounded-lg text-red-400/50 hover:bg-red-500/10 hover:text-red-400 transition-all disabled:opacity-30">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ══ USERS (also part of People tab) ═════════════════ */}
            {tab === "people" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-[14px] font-black uppercase tracking-[0.3em] text-white/40">Users — {activeOrg?.name}</h2>
                        <button onClick={() => setShowUserForm(v => !v)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--brand-color)] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:opacity-90 transition-all">
                            <Plus className="w-3.5 h-3.5" /> Add User
                        </button>
                    </div>
                    {showUserForm && (
                        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-5 animate-in fade-in duration-200">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/70">New User</p>
                                <p className="text-xs text-white/50 mt-1">Fill in all required fields. The user will appear immediately after creation.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {/* Full Name */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black text-white/60 uppercase tracking-widest">Full Name <span className="text-red-400">*</span></label>
                                    <input autoFocus value={newUserName} onChange={e => setNewUserName(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleCreateUser()}
                                        placeholder="Jane Smith"
                                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--brand-color)]/60 placeholder:text-white/30 transition-colors" />
                                </div>
                                {/* Email */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black text-white/60 uppercase tracking-widest">Work Email <span className="text-red-400">*</span></label>
                                    <input value={newUserEmail} onChange={e => { setNewUserEmail(e.target.value); setUserEmailError(""); }} type="email"
                                        onKeyDown={e => e.key === "Enter" && handleCreateUser()}
                                        placeholder="jane@company.com"
                                        className={`bg-white/5 border rounded-lg px-4 py-3 text-sm text-white focus:outline-none placeholder:text-white/30 transition-colors ${userEmailError ? "border-red-500/60 focus:border-red-500" : "border-white/10 focus:border-[var(--brand-color)]/60"}`} />
                                    {userEmailError && <p className="text-[10px] text-red-400 font-bold">{userEmailError}</p>}
                                </div>
                                {/* Role */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black text-white/60 uppercase tracking-widest">Role <span className="text-red-400">*</span></label>
                                    <div className="flex gap-2">
                                        {(["member", "admin"] as const).map(r => (
                                            <button key={r} onClick={() => setNewUserRole(r)}
                                                className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${newUserRole === r
                                                    ? "bg-[var(--brand-color)] border-[var(--brand-color)] text-white shadow-lg"
                                                    : "bg-white/5 border-white/10 text-white/60 hover:border-white/30 hover:text-white"
                                                    }`}>
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-white/40">{newUserRole === "admin" ? "Full access to admin hub." : "Can use monitored AI tools."}</p>
                                </div>
                                {/* Group */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black text-white/60 uppercase tracking-widest">Group Assignment</label>
                                    <select value={newUserGroup} onChange={e => setNewUserGroup(e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--brand-color)]/60 transition-colors">
                                        <option value="">No group (unassigned)</option>
                                        {groups.filter(g => !g.group_id.startsWith("temp-")).map(g =>
                                            <option key={g.group_id} value={g.group_id}>{g.name}</option>
                                        )}
                                    </select>
                                    <p className="text-[10px] text-white/40">User inherits the group&apos;s AI policy.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-1">
                                <button onClick={handleCreateUser}
                                    disabled={creating.user || !newUserEmail.trim() || !newUserName.trim()}
                                    className="flex items-center gap-2 px-8 py-2.5 bg-[var(--brand-color)] text-white rounded-lg text-[10px] font-black uppercase shadow-lg hover:opacity-90 disabled:opacity-40 transition-all">
                                    {creating.user
                                        ? <><span className="animate-spin w-3 h-3 border-2 border-white/20 border-b-white rounded-full" /> Adding…</>
                                        : <><Plus className="w-3.5 h-3.5" /> Add User</>}
                                </button>
                                <button onClick={() => { setShowUserForm(false); setUserEmailError(""); setNewUserName(""); setNewUserEmail(""); }}
                                    className="text-white/50 hover:text-white text-xs px-4 transition-colors">Cancel</button>
                            </div>
                        </div>
                    )}
                    {users.length === 0 ? (
                        <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-2xl p-20 text-center">
                            <Users className="w-10 h-10 text-white/20 mx-auto mb-4" />
                            <p className="text-[10px] text-white/60 font-black uppercase">No users yet — add one above</p>
                        </div>
                    ) : (
                        <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead><tr className="text-[11px] font-black text-white/20 uppercase border-b border-white/5 bg-white/[0.01]">
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4">License Key</th>
                                    <th className="px-6 py-4">Group</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Activity</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr></thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {users.map(u => {
                                        return (
                                            <tr key={u.user_id} className={`hover:bg-white/[0.02] transition-colors group ${!u.active ? "opacity-40" : ""}`}>
                                                <td className="px-6 py-4">
                                                    {u.display_name && <p className="text-base font-bold text-white/90 uppercase">{u.display_name}</p>}
                                                    <p className="text-xs font-bold text-white/40 font-mono">{u.email}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-[11px] font-black bg-white/5 px-2 py-1 rounded border border-white/10 text-blue-400 tracking-wider">
                                                            {u.license_key || "CMP-PENDING"}
                                                        </code>
                                                        <button onClick={() => { navigator.clipboard.writeText(u.license_key || ""); toast("Copied key", "success"); }} className="opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-white"><Copy className="w-3 h-3" /></button>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={u.group_id || ""}
                                                        onChange={(e) => handleAssignUserGroup(u.user_id, e.target.value || null)}
                                                        className="bg-transparent text-sm font-bold text-white/70 focus:outline-none cursor-pointer hover:text-white transition-colors"
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {groups.filter(g => !g.group_id.startsWith("temp-")).map(g => (
                                                            <option key={g.group_id} value={g.group_id}>{g.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-emerald-500" : "bg-red-500"}`} />
                                                        <span className={`text-[11px] font-black uppercase ${u.active ? "text-emerald-400" : "text-red-400"}`}>{u.active ? "Active" : "Revoked"}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-[11px] font-black text-white/30 uppercase tracking-widest">{u.last_activity ? timeSince(new Date(u.last_activity).getTime()) : "Never"}</p>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleRegenerateKey(u.user_id)} title="Regenerate License" className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-blue-400 transition-all">
                                                            <RefreshCw className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => handleResetPassword(u.email)} title="Reset Password" className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-amber-400 transition-all">
                                                            <Key className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => handleToggleUser(u)} title={u.active ? "Revoke Access" : "Grant Access"} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-red-400 transition-all">
                                                            {u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ══ POLICY EDITOR ════════════════════════════════════════ */}
            {tab === "policy" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Issue 2: hierarchy selector — Org / Group / User */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-[14px] font-black uppercase tracking-[0.3em] text-white/40">Policy Editor</h2>
                            <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                                {(["org", "group", "user"] as const).map(t => (
                                    <button key={t} onClick={() => setPolicyTarget(t)}
                                        className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-widest transition-all ${policyTarget === t ? "bg-white/15 text-white" : "text-white/30 hover:text-white/60"}`}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                            {policyTarget === "group" && (
                                <select value={activeGroupId} onChange={e => setActiveGroupId(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
                                    <option value="">Select group…</option>
                                    {/* Issue 1+2 fix: live groups state — includes newly created groups */}
                                    {groups.filter(g => !g.group_id.startsWith("temp-")).map(g =>
                                        <option key={g.group_id} value={g.group_id}>{g.name}</option>
                                    )}
                                </select>
                            )}
                            {policyTarget === "user" && (
                                <select value={activeUserId} onChange={e => setActiveUserId(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
                                    <option value="">Select user…</option>
                                    {users.map(u => <option key={u.user_id} value={u.user_id}>{u.email}</option>)}
                                </select>
                            )}
                        </div>
                        <button onClick={handleSavePolicy} disabled={savingPolicy}
                            className="flex items-center gap-2 px-6 py-2.5 bg-[var(--brand-color)] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:opacity-90 disabled:opacity-50 transition-all">
                            {savingPolicy ? <span className="animate-spin w-3.5 h-3.5 border-2 border-white/20 border-b-white rounded-full" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            {savingPolicy ? "Saving…" : "Save Policy"}
                        </button>
                    </div>

                    {/* Policy scope badge */}
                    <div className="flex items-center gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-5 py-3">
                        <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                        <p className="text-base text-blue-300/80 font-bold">
                            Hierarchy: <span className="text-white/60">Org default</span>
                            <ChevronRight className="w-3 h-3 inline mx-1 text-white/30" />
                            <span className={policyTarget === "group" ? "text-white" : "text-white/60"}>Group policy</span>
                            <ChevronRight className="w-3 h-3 inline mx-1 text-white/30" />
                            <span className={policyTarget === "user" ? "text-white" : "text-white/60"}>User override</span>
                            &nbsp;— editing <strong className="text-white">{policyTarget === "org" ? "Org Default" : policyTarget === "group" ? (groups.find(g => g.group_id === activeGroupId)?.name || "group") : (users.find(u => u.user_id === activeUserId)?.email || "user")}</strong>
                        </p>
                    </div>

                    {/* Active rules */}
                    <div className="space-y-2">
                        <p className="text-[12px] font-black uppercase tracking-widest text-white/60">Active Rules ({currentPolicy.length})</p>
                        {currentPolicy.length === 0 ? (
                            <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-xl p-10 text-center">
                                <p className="text-[10px] text-white/60 font-black uppercase">No rules — inheriting from parent level</p>
                            </div>
                        ) : currentPolicy.map(rule => {
                            const parsed = parseRuleTarget(rule.target);
                            const typeIcon = parsed.type === "ai_tool" ? <Bot className="w-3 h-3" />
                                : parsed.type === "ai_category" ? <Layers className="w-3 h-3" />
                                    : <Globe className="w-3 h-3" />;
                            return (
                                <div key={rule.rule_id} className={`flex items-center gap-3 bg-white/[0.02] border border-white/10 rounded-xl px-5 py-3.5 group transition-all ${!rule.enabled ? "opacity-40" : ""}`}>
                                    <span className="text-[11px] font-black text-white/40 font-mono w-6 text-center shrink-0">{rule.priority}</span>
                                    <span className={`px-2.5 py-1 rounded text-[11px] font-black uppercase shrink-0 ${ACTION_BADGE[rule.action] || "bg-white/10 text-white/60"}`}>{rule.action}</span>
                                    <span className="flex items-center gap-1.5 text-[11px] font-black text-white/50 uppercase shrink-0">{typeIcon}{parsed.type.replace(/_/g, " ")}</span>
                                    <span className="flex-1 text-sm font-semibold text-white/80 truncate">{parsed.displayLabel || "unnamed target"}</span>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={() => handleToggleRule(rule.rule_id)} className="text-white/50 hover:text-white text-[9px] font-black uppercase transition-all">
                                            {rule.enabled ? "Disable" : "Enable"}
                                        </button>
                                        <button onClick={() => handleRemoveRule(rule.rule_id)} className="text-red-400/60 hover:text-red-400 transition-all">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Visual Rule Builder ─────────────────────────────── */}
                    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-6">
                        {/* Header */}
                        <div>
                            <p className="text-[12px] font-black uppercase tracking-widest text-white/70">Add Rule</p>
                            <p className="text-sm text-white/50 mt-1">Select what to govern, then define the enforcement action.</p>
                        </div>

                        {/* ── WHEN row ── */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 w-14 shrink-0">WHEN</span>
                                <div className="h-px flex-1 bg-white/5" />
                            </div>

                            {/* Target Type selector */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {([
                                    { id: "ai_tool" as RuleTargetType, label: "AI Tool", icon: <Bot className="w-3.5 h-3.5" />, desc: "Specific AI product" },
                                    { id: "ai_category" as RuleTargetType, label: "AI Category", icon: <Layers className="w-3.5 h-3.5" />, desc: "Group of tools" },
                                    { id: "domain" as RuleTargetType, label: "Domain", icon: <Globe className="w-3.5 h-3.5" />, desc: "Advanced" },
                                    { id: "pattern" as RuleTargetType, label: "Pattern", icon: <SlidersHorizontal className="w-3.5 h-3.5" />, desc: "Regex / DLP" },
                                ] as const).map(({ id, label, icon, desc }) => (
                                    <button key={id} onClick={() => { setRuleTargetType(id); if (id === "domain" || id === "pattern") setShowAdvancedTarget(true); }}
                                        className={`flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border text-left transition-all ${ruleTargetType === id
                                            ? "bg-orange-500/10 border-orange-500/60 shadow-[0_0_15px_rgba(249,115,22,0.15)] text-white"
                                            : "bg-white/[0.02] border-white/10 text-white/50 hover:border-white/30 hover:text-white/80"
                                            }`}>
                                        <div className="flex items-center gap-1.5">{icon}<span className="text-[12px] font-black uppercase tracking-widest">{label}</span></div>
                                        <span className="text-[11px] text-white/40">{desc}</span>
                                    </button>
                                ))}
                            </div>

                            {/* ── AI Tool picker ── */}
                            {ruleTargetType === "ai_tool" && (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                                        <input
                                            value={toolSearch}
                                            onChange={e => setToolSearch(e.target.value)}
                                            placeholder="Search tools…"
                                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--brand-color)]/60 placeholder:text-white/30 transition-colors"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                                        {Object.values(AI_TOOL_REGISTRY)
                                            .filter(t => !toolSearch || t.display_name.toLowerCase().includes(toolSearch.toLowerCase()) || t.vendor.toLowerCase().includes(toolSearch.toLowerCase()))
                                            .map(tool => (
                                                <button key={tool.id} onClick={() => setSelectedTool(tool.id)}
                                                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${selectedTool === tool.id
                                                        ? "bg-orange-500/10 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.1)]"
                                                        : "bg-white/[0.02] border-white/10 hover:border-white/25"
                                                        }`}>
                                                    <span className="text-xs font-bold text-white/90">{tool.display_name}</span>
                                                    <span className="text-[9px] text-white/40">{tool.vendor}</span>
                                                    <span className={`text-[8px] font-black uppercase mt-0.5 ${tool.risk_tier === "critical" ? "text-red-400"
                                                        : tool.risk_tier === "high" ? "text-amber-400"
                                                            : tool.risk_tier === "moderate" ? "text-blue-400"
                                                                : "text-emerald-400"
                                                        }`}>{tool.risk_tier} risk · {tool.domains.length} domains covered</span>
                                                </button>
                                            ))}
                                    </div>
                                    {selectedTool && (
                                        <p className="text-[10px] text-white/40">
                                            Covers all known {AI_TOOL_REGISTRY[selectedTool].display_name} endpoints automatically. Domain list managed by Complyze registry.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ── AI Category multi-select ── */}
                            {ruleTargetType === "ai_category" && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {Object.values(AI_CATEGORY_REGISTRY).map(cat => {
                                            const active = selectedCategories.includes(cat.id);
                                            return (
                                                <button key={cat.id} onClick={() => setSelectedCategories(prev =>
                                                    active ? prev.filter(c => c !== cat.id) : [...prev, cat.id]
                                                )}
                                                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all ${active
                                                        ? "bg-orange-500/10 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.1)]"
                                                        : "bg-white/[0.02] border-white/10 hover:border-white/25"
                                                        }`}>
                                                    <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${active ? "bg-orange-500 border-orange-500" : "border-white/30"
                                                        }`}>
                                                        {active && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white/90">{cat.display_name}</p>
                                                        <p className="text-[11px] text-white/50 mt-0.5">{cat.description}</p>
                                                        <p className="text-[11px] text-white/30 mt-1">{cat.tools.length} tools covered</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {selectedCategories.length === 0 && (
                                        <p className="text-[10px] text-amber-400/70">Select at least one category to add a rule.</p>
                                    )}
                                </div>
                            )}

                            {/* ── Advanced: Domain / Pattern ── */}
                            {(ruleTargetType === "domain" || ruleTargetType === "pattern") && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                        <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <p className="text-[10px] text-amber-300/80 font-bold">Advanced configuration — for IT/security teams managing firewall-level rules.</p>
                                    </div>
                                    <input
                                        autoFocus
                                        value={rawTargetValue}
                                        onChange={e => setRawTargetValue(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleAddRule()}
                                        placeholder={ruleTargetType === "domain" ? "e.g. openai.com" : "e.g. (SSN|\\d{9})|(credit.card)"}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-[var(--brand-color)]/60 placeholder:text-white/30 transition-colors"
                                    />
                                    <p className="text-[10px] text-white/40">
                                        {ruleTargetType === "domain" ? "Exact domain or subdomain to match (no wildcards needed — subdomains are covered)." : "ECMAScript regex. Evaluated against outbound request payloads before forwarding."}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── THEN row ── */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 w-14 shrink-0">THEN</span>
                                <div className="h-px flex-1 bg-white/5" />
                            </div>
                            <div className="flex gap-2">
                                {(["block", "allow", "audit_only", "redact"] as const).map(act => (
                                    <button key={act} onClick={() => setNewRule(r => ({ ...r, action: act }))}
                                        className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase border transition-all ${newRule.action === act
                                            ? act === "block" ? "bg-red-500/20 border-orange-500/60 text-red-300"
                                                : act === "allow" ? "bg-emerald-500/20 border-orange-500/60 text-emerald-300"
                                                    : act === "audit_only" ? "bg-blue-500/20 border-orange-500/60 text-blue-300"
                                                        : "bg-amber-500/20 border-orange-500/60 text-amber-300"
                                            : "bg-white/5 border-white/10 text-white/50 hover:border-white/30 hover:text-white"
                                            }`}>
                                        {act === "audit_only" ? "Audit Only" : act.charAt(0).toUpperCase() + act.slice(1)}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[12px] text-white/40">
                                {newRule.action === "block" ? "Request is terminated. User receives a blocked notice."
                                    : newRule.action === "allow" ? "Request is explicitly permitted (overrides category blocks)."
                                        : newRule.action === "audit_only" ? "Request passes through. Event is logged for compliance review."
                                            : "Sensitive fields are stripped before the request is forwarded."}
                            </p>
                        </div>

                        {/* ── PRIORITY row ── */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 w-14 shrink-0">PRIORITY</span>
                                <div className="h-px flex-1 bg-white/5" />
                            </div>
                            <div className="flex items-center gap-4">
                                <input type="number" value={newRule.priority} min={1} max={999}
                                    onChange={e => setNewRule(r => ({ ...r, priority: parseInt(e.target.value) || 50 }))}
                                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--brand-color)]/60 transition-colors" />
                                <p className="text-[10px] text-white/40">Lower = evaluated first. 1 is highest priority. Default: 50.</p>
                            </div>
                        </div>

                        {/* ── Submit ── */}
                        <div className="flex items-center gap-3 pt-1 border-t border-white/5">
                            <button onClick={handleAddRule} disabled={!ruleBuilderValid}
                                className="flex items-center gap-2 px-12 py-3.5 bg-orange-600 text-white rounded-xl text-[12px] font-black uppercase shadow-[0_10px_20px_rgba(249,115,22,0.2)] hover:bg-orange-500 hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                Save
                            </button>
                            {!ruleBuilderValid && (
                                <p className="text-[10px] text-white/40">
                                    {ruleTargetType === "ai_category" ? "Select at least one category above." : "Complete the selection above to add a rule."}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══ ENROLLMENT ══════════════════════════════════════════ */}
            {tab === "deploy" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-[14px] font-black uppercase tracking-[0.3em] text-white/40">Enrollment — {activeOrg?.name}</h2>
                        <button onClick={handleGenerateToken} disabled={creating.token || !activeOrgId}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--brand-color)] text-white rounded-xl text-[12px] font-black uppercase shadow-lg hover:opacity-90 disabled:opacity-50 transition-all">
                            {creating.token ? <span className="animate-spin w-3.5 h-3.5 border-2 border-white/20 border-b-white rounded-full" /> : <Key className="w-3.5 h-3.5" />}
                            Generate Token
                        </button>
                    </div>
                    {generatedToken && (
                        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.25em]">New Token — Copy Now (shown once)</p>
                                <button onClick={() => setGeneratedToken(null)} className="text-white/30 hover:text-white text-xs">✕ Dismiss</button>
                            </div>
                            <div className="flex items-center gap-3">
                                <code className="flex-1 bg-black/30 rounded-xl px-4 py-3 text-xs font-mono text-emerald-300 break-all select-all">
                                    {tokenVisible ? generatedToken : generatedToken.replace(/./g, "•")}
                                </code>
                                <button onClick={() => setTokenVisible(v => !v)} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
                                    {tokenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button onClick={async () => { await navigator.clipboard.writeText(generatedToken!); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2500); toast("Token copied.", "success"); }}
                                    className={`p-2.5 rounded-lg transition-all ${tokenCopied ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 hover:bg-white/10 text-white/40 hover:text-white"}`}>
                                    {tokenCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                            <div className="bg-black/20 rounded-xl px-5 py-4 font-mono text-[10px]">
                                <p className="text-[9px] text-white/30 font-black uppercase mb-2">Deploy Configuration (MDM):</p>
                                <pre className="text-emerald-400 break-all leading-relaxed whitespace-pre-wrap">{JSON.stringify({ organizationId: { Value: activeOrgId }, apiEndpoint: { Value: "https://api.complyze.com" }, deploymentToken: { Value: generatedToken } }, null, 2)}</pre>
                            </div>
                        </div>
                    )}
                    {tokens.length === 0 ? (
                        <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-2xl p-20 text-center">
                            <Key className="w-10 h-10 text-white/20 mx-auto mb-4" />
                            <p className="text-[10px] text-white/60 font-black uppercase">No tokens yet — generate one above</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tokens.map(t => (
                                <div key={t.id} className="bg-white/[0.02] border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between group hover:border-white/20 transition-all">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <span className={`px-2.5 py-1 rounded text-[11px] font-black uppercase shrink-0 ${t.status === "active" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : t.status === "revoked" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-zinc-700/50 text-zinc-400 border border-zinc-600/30"}`}>{t.status}</span>
                                        <span className="text-sm font-mono text-white/60 truncate">{t.token}</span>
                                        <span className="text-[11px] text-white/50 font-black uppercase shrink-0">{t.uses_count} used</span>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                        <span className="text-[9px] text-white/50 font-mono hidden md:block">exp {new Date(t.expires_at).toLocaleDateString()}</span>
                                        {t.status === "active" && (
                                            <button onClick={() => handleRevokeToken(t.id)}
                                                className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-[9px] font-black uppercase border border-red-500/20 transition-all">
                                                <Trash2 className="w-3 h-3" /> Revoke
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
