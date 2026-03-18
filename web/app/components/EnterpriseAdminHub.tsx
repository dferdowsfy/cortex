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
interface Organization {
    id: string;
    org_id: string;
    name: string;
    created_at: string;
    plan?: string;
    seatsPurchased?: number;
    seatsUsed?: number;
    groupsCount?: number;
}

interface Group {
    group_id: string;
    org_id: string;
    name: string;
    description?: string;
    policy_id: string | null;
    created_at: string;
}

interface PolicyRule {
    rule_id: string;
    type: string;
    target: string;
    action: "block" | "allow" | "audit_only" | "redact" | "warn";
    priority: number;
    enabled: boolean;
}

interface ManagedUser {
    user_id: string;
    org_id: string;
    group_id: string | null;
    group_ids?: string[];
    email: string;
    display_name?: string;
    role: "super_admin" | "org_admin" | "group_admin" | "member";
    active: boolean;
    created_at: string;
    license_key?: string;
    last_activity?: string;
}

interface PlanState {
    id: string;
    name: string;
    usage: {
        seats_used: number;
        seats_total: number;
        groups_used: number;
        groups_total: number;
    };
    entitlements: {
        max_users: number;
        max_groups: number;
        features: Record<string, boolean>;
    };
}

interface ExtensionStatus {
    device_id: string;
    hostname: string;
    browser?: string;
    extension_version?: string;
    last_sync: string;
    status: string;
}

interface EnrollmentToken {
    id: string;
    token: string;
    status: "active" | "revoked" | "expired";
    expires_at: string;
    uses_count: number;
    max_uses: number | null;
    org_id: string;
}

/* ─── Constants ─────────────────────────────────────────── */
type Tab = "overview" | "people" | "groups" | "policy" | "plan" | "deploy";
const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
    { key: "overview", label: "Dashboard", Icon: Monitor },
    { key: "people", label: "Users", Icon: Users },
    { key: "groups", label: "Groups", Icon: Layers },
    { key: "policy", label: "Policies", Icon: Shield },
    { key: "plan", label: "Plan & Seats", Icon: Building2 },
    { key: "deploy", label: "Deploy", Icon: Key },
];

const ACTION_BADGE: Record<string, string> = {
    block: "bg-red-500/15 text-red-400 border border-red-500/30",
    allow: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    audit_only: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    redact: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    warn: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
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

const SlidingAlertIcon = memo(({ className }: { className?: string }) => (
    <div className={className}>⚠️</div>
));
SlidingAlertIcon.displayName = "SlidingAlertIcon";

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
    const [currentUserProfile, setCurrentUserProfile] = useState<ManagedUser | null>(null);
    const [devices, setDevices] = useState<ExtensionStatus[]>([]);
    const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
    const [plan, setPlan] = useState<PlanState | null>(null);

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
    const [tab, setTab] = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [showUserForm, setShowUserForm] = useState(false);
    const [showOrgForm, setShowOrgForm] = useState(false);
    const [showBootstrap, setShowBootstrap] = useState(false);
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

    const fetchCurrentUser = useCallback(async () => {
        const r = await fetch(`/api/admin/users/me?workspaceId=${wid}`);
        if (!r.ok) {
            console.error("[EnterpriseAdminHub] Failed to fetch current user profile");
            return;
        }
        const { user: u } = await r.json();
        setCurrentUserProfile(u || null);

        const ownerEmail = "dferdows@gmail.com";
        const isOwner = user?.email?.toLowerCase() === ownerEmail.toLowerCase();

        console.log("[EnterpriseAdminHub] Current user:", user?.email, "isOwner:", isOwner, "profile:", u);

        // If no user record and we are dferdows, check if platform is initialized
        if (!u && isOwner) {
            const setupR = await fetch("/api/admin/setup");
            const status = await setupR.json();
            console.log("[EnterpriseAdminHub] Setup status:", status);
            if (!status.initialized) setShowBootstrap(true);
        }
    }, [wid, user?.email]);

    const fetchTokens = useCallback(async (orgId: string) => {
        if (!orgId) return;
        const r = await fetch(`/api/admin/enrollment/tokens?organizationId=${orgId}&workspaceId=${wid}`);
        if (!r.ok) return;
        const { tokens: t } = await r.json();
        setTokens(t || []);
    }, [wid]);

    const fetchPlan = useCallback(async (orgId: string) => {
        if (!orgId) return;
        const r = await fetch(`/api/admin/plan?org_id=${orgId}&workspaceId=${wid}`);
        if (!r.ok) return;
        const data = await r.json();
        setPlan(data.plan || null);
    }, [wid]);

    /* Load policy for a specific group/user on-demand */
    const loadPolicy = useCallback(async (idToLoad: string, target: "org" | "group" | "user") => {
        const key = target === "user" ? `u:${idToLoad}` : (target === "org" ? "org" : idToLoad);
        if (policyMap[key] !== undefined) return; // cached

        const url = target === "org"
            ? `/api/admin/orgs/${activeOrgId}/policy?workspaceId=${wid}`
            : target === "user"
                ? `/api/admin/users/${idToLoad}/policy?workspaceId=${wid}`
                : `/api/admin/groups/${idToLoad}/policy?workspaceId=${wid}`;

        try {
            const r = await fetch(url);
            if (!r.ok) return;
            const { policy } = await r.json();
            setPolicyMap(prev => ({ ...prev, [key]: policy?.rules || [] }));
        } catch { }
    }, [wid, policyMap, activeOrgId]);

    /* ── Boot ── */
    useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([fetchOrgs(), fetchDevices(), fetchCurrentUser()]);
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
        fetchPlan(activeOrgId);
    }, [activeOrgId, fetchGroups, fetchUsers, fetchTokens, fetchPlan]);

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

    /* Permission Helpers */
    const isSuperAdmin = useMemo(() => {
        const ownerEmail = "dferdows@gmail.com";
        const isOwner = user?.email?.toLowerCase() === ownerEmail.toLowerCase();
        return currentUserProfile?.role === "super_admin" || isOwner;
    }, [currentUserProfile, user]);

    const canManageGroups = useMemo(() => {
        const ownerEmail = "dferdows@gmail.com";
        const isOwner = user?.email?.toLowerCase() === ownerEmail.toLowerCase();
        const role = currentUserProfile?.role;
        return role === "super_admin" || role === "org_admin" || role === "group_admin" || isOwner;
    }, [currentUserProfile, user]);

    const canInviteUsers = useMemo(() => {
        const ownerEmail = "dferdows@gmail.com";
        const isOwner = user?.email?.toLowerCase() === ownerEmail.toLowerCase();
        const role = currentUserProfile?.role;
        return role === "super_admin" || role === "org_admin" || isOwner;
    }, [currentUserProfile, user]);

    /* ─── Actions ─────────────────────────────────────────── */
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

    const handleBootstrap = async () => {
        if (user?.email !== "dferdows@gmail.com") return;
        setLoading(true);
        try {
            const r = await fetch("/api/admin/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    super_admin_id: user.uid,
                    email: user.email,
                    organization_name: "Complyze Global"
                })
            });
            if (r.ok) {
                toast("Platform initialized! You are now Super Admin.", "success");
                setShowBootstrap(false);
                await fetchCurrentUser();
                await fetchOrgs();
            } else {
                toast("Bootstrap failed.", "error");
            }
        } finally { setLoading(false); }
    };

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
            role: newUserRole as any,
            active: true,
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
        if (!activeOrgId) return;
        setSavingPolicy(true);
        try {
            let url = ""; let body: object = {};
            if (policyTarget === "org") {
                url = `/api/admin/orgs/${activeOrgId}/policy?workspaceId=${wid}`;
                body = { rules: currentPolicy, org_id: activeOrgId };
            } else if (policyTarget === "group" && activeGroupId) {
                url = `/api/admin/groups/${activeGroupId}/policy?workspaceId=${wid}`;
                body = { org_id: activeOrgId, rules: currentPolicy, group_id: activeGroupId };
            } else if (policyTarget === "user" && activeUserId) {
                url = `/api/admin/users/${activeUserId}/policy?workspaceId=${wid}`;
                body = { org_id: activeOrgId, rules: currentPolicy, user_id: activeUserId };
            }
            if (!url) { toast("Select a target to save this policy.", "error"); return; }
            const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (r.ok) {
                toast("Policy updated successfully.", "success");
                const key = policyKey();
                setPolicyMap(prev => ({ ...prev, [key]: currentPolicy }));
            } else {
                toast("Failed to save policy.", "error");
            }
        } catch {
            toast("Network error saving policy.", "error");
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
        <div className="max-w-[1240px] mx-auto px-6 pb-32 space-y-10 font-sans antialiased text-white">
            <ToastContainer toasts={toasts} dismiss={dismiss} />

            {/* NAVIGATION TABS */}
            <div className="flex gap-4 border-b border-white/5 pb-0.5 overflow-x-auto pt-6">
                {TABS.map(t => {
                    const Icon = t.Icon;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2.5 px-6 py-4 border-b-2 transition-all whitespace-nowrap ${tab === t.key ? "border-[var(--brand-color)] text-white" : "border-transparent text-white/30 hover:text-white/60"}`}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t.label}</span>
                        </button>
                    )
                })}
            </div>

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

            {/* TAB CONTENT */}
            {tab === "overview" && (
                <div className="space-y-10 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard label="Organization" value={activeOrg?.name || "—"} sub="Current Tenant" />
                        <StatCard label="Plan Tier" value={plan?.name || "Starter"} sub="Active Subscription" color="text-[#7261fd]" />
                        <StatCard label="Seats" value={`${plan?.usage.seats_used || users.length}/${plan?.usage.seats_total || 5}`} sub="Capacity" />
                        <StatCard label="Health" value={`${activeDevices.length} Active`} sub="Extension Heartbeats" color="text-emerald-400" />
                    </div>

                    {showBootstrap && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-8 flex flex-col md:flex-row gap-8 items-center justify-between animate-in slide-in-from-top-4 duration-500">
                            <div className="space-y-2">
                                <h3 className="text-lg font-black tracking-tight text-blue-400">Initialize Complyze Platform</h3>
                                <p className="text-sm text-white/50 max-w-lg">You are identified as the platform owner. Click below to seed the default plans, create the root organization, and promote your account to Super Admin.</p>
                            </div>
                            <button onClick={handleBootstrap} className="px-8 py-4 bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 whitespace-nowrap">
                                Bootstrap Platform
                            </button>
                        </div>
                    )}

                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 flex flex-col md:flex-row gap-8 items-center justify-between">
                        <div className="space-y-2">
                            <h3 className="text-lg font-black tracking-tight">System Status: Healthy</h3>
                            <p className="text-sm text-white/40 max-w-lg">All governance shielding is active. Policies are being enforced on {activeDevices.length} browser instances across {groups.length} groups.</p>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setTab("policy")} className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-white/20 transition-all">Review Policies</button>
                            <button onClick={() => setTab("deploy")} className="px-6 py-3 bg-[var(--brand-color)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all">Deploy Extension</button>
                        </div>
                    </div>
                </div>
            )}

            {
                tab === "people" && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">User Management</h2>
                            {canInviteUsers && (
                                <button onClick={() => setShowUserForm(true)} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg text-[10px] font-black uppercase hover:border-white/20 transition-all">
                                    <Plus className="w-3.5 h-3.5" /> Invite User
                                </button>
                            )}
                        </div>

                        {showUserForm && (
                            <div className="bg-white/[0.05] border border-white/20 rounded-2xl p-6 space-y-4 shadow-2xl">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Full Name..." className="bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm" />
                                    <input value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="Email..." className="bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm" />
                                    <select value={newUserGroup} onChange={e => setNewUserGroup(e.target.value)} className="bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm">
                                        <option value="">No Group</option>
                                        {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
                                    </select>
                                    <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} className="bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm">
                                        <option value="member">Member</option>
                                        <option value="org_admin">Org Admin</option>
                                        <option value="group_admin">Group Admin</option>
                                        {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                                    </select>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setShowUserForm(false)} className="text-[10px] font-black text-white/30 uppercase px-4">Cancel</button>
                                    <button onClick={handleCreateUser} className="px-6 py-2.5 bg-[var(--brand-color)] rounded-lg text-[10px] font-black uppercase">Add User</button>
                                </div>
                            </div>
                        )}

                        <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-[10px] font-black text-white/30 uppercase tracking-widest bg-white/[0.01] border-b border-white/5">
                                        <th className="px-5 py-3.5">User</th>
                                        <th className="px-5 py-3.5">Role</th>
                                        <th className="px-5 py-3.5">Group</th>
                                        <th className="px-5 py-3.5">Effective Policy</th>
                                        <th className="px-5 py-3.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {users.map(u => {
                                        const userPolicy = policyMap[`u:${u.user_id}`];
                                        const hasUserOverride = userPolicy && userPolicy.length > 0;
                                        return (
                                            <tr key={u.user_id} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="px-5 py-4">
                                                    <p className="text-sm font-bold text-white/90">{u.display_name || "—"}</p>
                                                    <p className="text-[10px] text-white/30 font-mono">{u.email}</p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-[#7261fd]">{u.role.replace("_", " ")}</span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <select disabled={!canInviteUsers} value={u.group_id || ""} onChange={e => handleAssignUserGroup(u.user_id, e.target.value || null)}
                                                        className="bg-transparent text-xs text-blue-400 font-bold focus:outline-none cursor-pointer">
                                                        <option value="" className="text-[#111121] bg-white">None</option>
                                                        {groups.map(g => <option key={g.group_id} value={g.group_id} className="text-[#111121] bg-white">{g.name}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`text-[10px] font-black uppercase ${hasUserOverride ? "text-orange-400" : "text-white/30"}`}>
                                                            {hasUserOverride ? "User Override" : (u.group_id ? "Group Inherited" : "Org Default")}
                                                        </span>
                                                        <div className="flex gap-1 overflow-hidden">
                                                            {(userPolicy || []).slice(0, 3).map(r => (
                                                                <span key={r.rule_id} className={`w-1.5 h-1.5 rounded-full ${r.action === 'block' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <div className="flex justify-end gap-3 items-center">
                                                        <button onClick={() => { setActiveUserId(u.user_id); setPolicyTarget("user"); setTab("policy"); }}
                                                            className="p-2 text-white/30 hover:text-white transition-all"><Settings className="w-4 h-4" /></button>
                                                        {canInviteUsers && (
                                                            <button onClick={() => handleDeleteUser(u.user_id)} className="p-2 text-red-400/30 hover:text-red-400 transition-all"><UserX className="w-4 h-4" /></button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {
                tab === "groups" && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Group Policy Scopes</h2>
                            {canManageGroups && (
                                <button onClick={() => setShowGroupForm(true)} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 border border-white/10 text-white rounded-lg text-[10px] font-black uppercase hover:border-white/20 transition-all">
                                    <Plus className="w-3.5 h-3.5" /> Create Group
                                </button>
                            )}
                        </div>

                        {showGroupForm && (
                            <div className="bg-white/[0.05] border border-white/20 rounded-2xl p-6 space-y-4 shadow-2xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group Name (e.g. Developers)..." className="bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm" />
                                    <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Description..." className="bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm" />
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setShowGroupForm(false)} className="text-[10px] font-black text-white/30 uppercase px-4">Cancel</button>
                                    <button onClick={handleCreateGroup} className="px-6 py-2.5 bg-[var(--brand-color)] rounded-lg text-[10px] font-black uppercase">Create Group</button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {groups.map(g => (
                                <div key={g.group_id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4 hover:border-white/20 transition-all group">
                                    <div className="flex justify-between items-start">
                                        <div className="p-3 bg-[var(--brand-color)]/10 rounded-xl">
                                            <Layers className="w-5 h-5 text-[var(--brand-color)]" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setActiveGroupId(g.group_id); setPolicyTarget("group"); setTab("policy"); }}
                                                className="p-2 text-white/20 hover:text-white transition-all"><SlidersHorizontal className="w-4 h-4" /></button>
                                            {canManageGroups && (
                                                <button onClick={() => handleDeleteGroup(g.group_id)} className="p-2 text-white/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest">{g.name}</h3>
                                        <p className="text-[10px] text-white/30 font-bold uppercase mt-1">{users.filter(u => u.group_id === g.group_id).length} Active Members</p>
                                    </div>
                                    <p className="text-xs text-white/40 leading-relaxed min-h-[3em]">{g.description || "No description provided for this group."}</p>
                                    <div className="pt-4 border-t border-white/5 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/20">
                                        <span>Policy: {policyMap[g.group_id]?.length || 0} Rules</span>
                                        <button onClick={() => { setActiveGroupId(g.group_id); setPolicyTarget("group"); setTab("policy"); }} className="text-blue-400/60 hover:text-blue-400">Manage Policy</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {
                tab === "policy" && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between border-b border-white/10 pb-6">
                            <div>
                                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Enforcement Policies</h2>
                                <p className="text-sm text-white/60 mt-2">Manage blocking, redaction, and warning rules for specialized scopes.</p>
                            </div>
                            <button onClick={handleSavePolicy} disabled={savingPolicy}
                                className="flex items-center gap-2 px-8 py-3 bg-[var(--brand-color)] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:opacity-90 disabled:opacity-50 transition-all">
                                {savingPolicy ? "Saving…" : "Save Effective Policy"}
                            </button>
                        </div>

                        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 space-y-8">
                            <div className="flex flex-col md:flex-row gap-8 md:items-center">
                                <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-max">
                                    {(["org", "group", "user"] as const).map(t => (
                                        <button key={t} onClick={() => setPolicyTarget(t)}
                                            className={`px-5 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${policyTarget === t ? "bg-[var(--brand-color)] text-white" : "text-white/40 hover:text-white"}`}>
                                            {t === 'org' ? 'Organization' : t.charAt(0).toUpperCase() + t.slice(1)}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex-1">
                                    {policyTarget === "group" && (
                                        <select value={activeGroupId} onChange={e => setActiveGroupId(e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-white/30 w-full md:w-64">
                                            <option value="" className="bg-zinc-900">Select Group Target...</option>
                                            {groups.map(g => <option key={g.group_id} value={g.group_id} className="bg-zinc-900">{g.name}</option>)}
                                        </select>
                                    )}
                                    {policyTarget === "user" && (
                                        <select value={activeUserId} onChange={e => setActiveUserId(e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-white/30 w-full md:w-64">
                                            <option value="" className="bg-zinc-900">Select User Target...</option>
                                            {users.map(u => <option key={u.user_id} value={u.user_id} className="bg-zinc-900">{u.email}</option>)}
                                        </select>
                                    )}
                                    {policyTarget === "org" && (
                                        <div className="text-[10px] font-black uppercase text-white/30 tracking-widest pl-2">Root Global Policy (Affects all members)</div>
                                    )}
                                </div>
                            </div>

                            {/* AI Tool Access Rules Dashboard */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Active AI Governance Rules</p>
                                    <button onClick={() => setShowAdvancedTarget(!showAdvancedTarget)} className="text-[9px] font-black uppercase text-blue-400 hover:text-blue-300">{showAdvancedTarget ? "Close Builder" : "+ New Rule"}</button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {currentPolicy.map(rule => {
                                        const toolId = parseRuleTarget(rule.target).toolId;
                                        const tool = AI_TOOL_REGISTRY[toolId as ToolId];
                                        return (
                                            <div key={rule.rule_id} className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 group hover:border-white/20 transition-all">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1.5 bg-white/5 rounded-lg"><Bot className="w-3.5 h-3.5 text-white/40" /></div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white/90">{tool?.display_name || rule.target}</p>
                                                        <p className="text-[9px] font-black uppercase text-white/20">{rule.type.replace("_", " ")}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${ACTION_BADGE[rule.action]}`}>{rule.action.replace("_only", "")}</span>
                                                    <button onClick={() => handleRemoveRule(rule.rule_id)} className="opacity-0 group-hover:opacity-100 text-red-400/40 hover:text-red-400 transition-all"><Trash2 className="w-3 h-3" /></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {currentPolicy.length === 0 && (
                                        <div className="col-span-full py-12 border border-dashed border-white/5 rounded-2xl text-center">
                                            <p className="text-[10px] font-black text-white/10 uppercase tracking-[0.2em]">No custom policy rules active for this target.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Rule Builder */}
                                {(showAdvancedTarget || currentPolicy.length === 0) && (
                                    <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-6 mt-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="flex flex-wrap gap-4 items-end">
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest pl-1">Tool Target</label>
                                                <select value={selectedTool} onChange={e => setSelectedTool(e.target.value as ToolId)}
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none w-48">
                                                    {Object.values(AI_TOOL_REGISTRY).map(t => <option key={t.id} value={t.id} className="bg-zinc-900">{t.display_name}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1.5 flex-1 min-w-[200px]">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest pl-1">Action</label>
                                                <div className="flex gap-1 overflow-x-auto pb-1">
                                                    {(["block", "warn", "allow", "audit_only", "redact"] as const).map(act => (
                                                        <button key={act} onClick={() => setNewRule({ ...newRule, action: act })}
                                                            className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap ${newRule.action === act ? "bg-[var(--brand-color)] text-white" : "bg-white/5 text-white/40 hover:text-white border border-white/5"}`}>
                                                            {act.replace("_only", "")}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <button onClick={handleAddRule} className="px-6 py-2 bg-[var(--brand-color)] rounded-lg text-[10px] font-black uppercase h-[37px]">Add Rule</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {
                tab === "plan" && (
                    <div className="space-y-10 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center border-b border-white/10 pb-6">
                            <div>
                                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">License & Plan</h2>
                                <p className="text-sm text-white/60 mt-2">Manage your organization's subscription and seat allocations.</p>
                            </div>
                            {isSuperAdmin && (
                                <button className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase hover:border-white/20 transition-all">Upgrade Plan</button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 space-y-8">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-[var(--brand-color)]/20 rounded-2xl"><Building2 className="w-8 h-8 text-[var(--brand-color)]" /></div>
                                    <div>
                                        <h3 className="text-xl font-black">{plan?.name || "Starter"} Plan</h3>
                                        <p className="text-xs text-white/30 font-black uppercase tracking-widest">Active Subscription</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-white/30">User Seats</span>
                                            <span>{plan?.usage.seats_used || 0} / {plan?.usage.seats_total || 5}</span>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-[var(--brand-color)] rounded-full transition-all" style={{ width: `${((plan?.usage.seats_used || 0) / (plan?.usage.seats_total || 5)) * 100}%` }} />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-white/30">Group Allowance</span>
                                            <span>{plan?.usage.groups_used || 0} / {plan?.usage.groups_total || 2}</span>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${((plan?.usage.groups_used || 0) / (plan?.usage.groups_total || 2)) * 100}%` }} />
                                        </div>
                                    </div>
                                </div>

                                {plan?.usage && plan.usage.seats_used >= plan.usage.seats_total && (
                                    <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center gap-3">
                                        <SlidingAlertIcon className="w-4 h-4 text-orange-400" />
                                        <span className="text-[10px] font-black uppercase text-orange-400">Seat limit reached. Future invites will be blocked.</span>
                                    </div>
                                )}
                            </div>

                            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 space-y-6">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">Plan Entitlements</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: "Custom Policy Rules", enabled: plan?.entitlements.features.custom_policy },
                                        { label: "Audit Logs", enabled: plan?.entitlements.features.audit_log },
                                        { label: "SAML SSO", enabled: plan?.entitlements.features.saml },
                                        { label: "Advanced Reporting", enabled: plan?.entitlements.features.advanced_reporting },
                                    ].map(f => (
                                        <div key={f.label} className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white/80">{f.label}</span>
                                            {f.enabled ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-white/10" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                tab === "deploy" && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="border-b border-white/10 pb-6 text-center max-w-2xl mx-auto">
                            <h2 className="text-2xl font-black tracking-tight mb-2">Deploy Shield to Users</h2>
                            <p className="text-sm text-white/40">Complyze is installed via a Chrome extension. Use the tokens below to automate enrollment via MDM or manual setup.</p>
                        </div>

                        <div className="max-w-3xl mx-auto space-y-8">
                            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white/60">Enrollment Tokens</h3>
                                    <button onClick={handleGenerateToken} className="px-6 py-2 bg-[var(--brand-color)] rounded-lg text-[10px] font-black uppercase">Create Token</button>
                                </div>

                                <div className="space-y-3">
                                    {tokens.map(t => (
                                        <div key={t.id} className="flex items-center justify-between bg-black/20 rounded-xl px-5 py-4 border border-white/5">
                                            <div className="space-y-1">
                                                <p className="text-xs font-mono text-white/80">{t.token.substring(0, 12)}...</p>
                                                <p className="text-[9px] font-black uppercase text-white/20">Uses: {t.uses_count} {t.max_uses ? `/ ${t.max_uses}` : '(Infinite)'} • {t.status}</p>
                                            </div>
                                            <button onClick={() => handleRevokeToken(t.id)} className="text-[9px] font-black uppercase text-red-400/60 hover:text-red-400">Revoke</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
                                    <Monitor className="w-6 h-6 text-blue-400" />
                                    <h3 className="text-sm font-bold">Local MDM Setup</h3>
                                    <p className="text-xs text-white/40 leading-relaxed">Download the configuration profile for mass deployment across managed Google Workspace accounts.</p>
                                    <button className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 hover:border-white/20 transition-all"><Download className="w-3.5 h-3.5" /> MDM JSON</button>
                                </div>
                                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
                                    <Globe className="w-6 h-6 text-emerald-400" />
                                    <h3 className="text-sm font-bold">Web Store Install</h3>
                                    <p className="text-xs text-white/40 leading-relaxed">Users can install the extension directly from the Chrome Web Store and enroll with a license key.</p>
                                    <a href="https://chromewebstore.google.com/detail/complyze-zero-trust-shiel/beifcbbcemhnggelihdijjmbhefnljkd" target="_blank" className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 hover:border-white/20 transition-all"><Plus className="w-3.5 h-3.5" /> Complyze Extension</a>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

// Sub-components used within Tabs are defined at top or above for clarity.

