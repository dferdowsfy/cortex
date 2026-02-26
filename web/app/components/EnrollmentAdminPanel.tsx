"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Plus, Trash2, CheckCircle, Shield, Clock,
    ChevronDown, ChevronRight, Download, Copy, Eye, EyeOff, RefreshCw, ToggleLeft, ToggleRight
} from "lucide-react";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import { useAuth } from "@/lib/auth-context";

/* ── Types ────────────────────────────────────────────────── */

interface Organization {
    id: string;
    name: string;
    created_at: string;
    policy_version?: number;
}

interface EnrollmentToken {
    id: string;
    token: string;
    status: "active" | "revoked" | "expired";
    created_at: string;
    expires_at: string;
    uses_count: number;
    max_uses: number | null;
    org_id: string;
}

interface GeneratedToken {
    id: string;
    plain_token: string;
    expires_at: string;
}

interface Device {
    device_id: string;
    hostname: string;
    os_type: string;
    agent_version: string;
    last_sync: string;
    status: string;
}

interface AuditReport {
    id: string;
    timestamp: string;
    overallStatus: string;
    enforcementScore: number;
    findings: any[];
}

/* ── Helpers ──────────────────────────────────────────────── */

function tokenStatusBadge(status: string) {
    switch (status) {
        case "active":   return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        case "revoked":  return "bg-red-500/10 text-red-400 border border-red-500/20";
        case "expired":  return "bg-zinc-700/50 text-zinc-400 border border-zinc-600/30";
        default:         return "bg-zinc-700/50 text-zinc-400 border border-zinc-600/30";
    }
}

function deviceStatusDot(status: string) {
    if (status === "Healthy" || status === "active") return "bg-emerald-500";
    if (status === "Offline" || status === "revoked") return "bg-red-500";
    return "bg-yellow-500";
}

/* ── Component ─────────────────────────────────────────────── */

export default function EnrollmentAdminPanel() {
    const { user } = useAuth();
    const { settings: userSettings, loading: settingsLoading, saveSettings } = useUserSettings();
    const workspaceId = user?.uid || "default";

    // Data
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [activeOrgId, setActiveOrgId] = useState<string>("");
    const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [auditHistory, setAuditHistory] = useState<AuditReport[]>([]);

    // UI
    const [loading, setLoading] = useState(true);
    const [auditCollapsed, setAuditCollapsed] = useState(true);
    const [enrollmentCollapsed, setEnrollmentCollapsed] = useState(false);
    const [auditRunning, setAuditRunning] = useState(false);
    const [shieldToggling, setShieldToggling] = useState(false);

    // Token generation
    const [generatedToken, setGeneratedToken] = useState<GeneratedToken | null>(null);
    const [tokenVisible, setTokenVisible] = useState(false);
    const [tokenCopied, setTokenCopied] = useState(false);
    const [generatingToken, setGeneratingToken] = useState(false);

    // Org creation
    const [newOrgName, setNewOrgName] = useState("");
    const [creatingOrg, setCreatingOrg] = useState(false);
    const [showOrgInput, setShowOrgInput] = useState(false);

    /* ── Fetch ─────────────────────────────────────────────── */

    const fetchData = useCallback(async () => {
        try {
            const [orgRes, agentRes, auditRes] = await Promise.all([
                fetch(`/api/admin/organizations?workspaceId=${workspaceId}`),
                fetch(`/api/agent/heartbeat?workspaceId=${workspaceId}`),
                fetch("/api/admin/audit/history").catch(() => null),
            ]);

            if (orgRes.ok) {
                const { organizations: orgs } = await orgRes.json();
                setOrganizations(orgs || []);
                setActiveOrgId(prev => prev || orgs?.[0]?.id || "");
            }
            if (agentRes.ok) {
                const { agents } = await agentRes.json();
                setDevices(agents || []);
            }
            if (auditRes?.ok) {
                const data = await auditRes.json();
                setAuditHistory(data.reports || []);
            }
        } catch (err) {
            console.error("Governance fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    const fetchTokens = useCallback(async () => {
        if (!activeOrgId) return;
        try {
            const res = await fetch(
                `/api/admin/enrollment/tokens?organizationId=${activeOrgId}&workspaceId=${workspaceId}`
            );
            if (res.ok) {
                const { tokens: t } = await res.json();
                setTokens(t || []);
            }
        } catch (err) {
            console.error("Token fetch error:", err);
        }
    }, [activeOrgId, workspaceId]);

    useEffect(() => {
        fetchData();
        const iv = setInterval(fetchData, 15000);
        return () => clearInterval(iv);
    }, [fetchData]);

    useEffect(() => { fetchTokens(); }, [fetchTokens]);

    /* ── Actions ───────────────────────────────────────────── */

    const handleGenerateToken = async () => {
        if (!activeOrgId) return;
        setGeneratingToken(true);
        try {
            const res = await fetch(`/api/admin/enrollment/tokens?workspaceId=${workspaceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId: activeOrgId, expires_in_hours: 168, max_uses: null }),
            });
            if (res.ok) {
                const data = await res.json();
                setGeneratedToken({ id: data.id, plain_token: data.plain_token, expires_at: data.expires_at });
                setTokenVisible(true);
                setTokenCopied(false);
                await fetchTokens();
            } else {
                const err = await res.json();
                alert(`Failed to generate token: ${err.error || "Unknown error"}`);
            }
        } catch {
            alert("Network error generating token.");
        } finally {
            setGeneratingToken(false);
        }
    };

    const handleRevokeToken = async (tokenId: string) => {
        if (!confirm("Revoke this token? No new enrollments will be allowed with it.")) return;
        try {
            const res = await fetch(
                `/api/admin/enrollment/tokens/${tokenId}/revoke?workspaceId=${workspaceId}`,
                { method: "POST" }
            );
            if (res.ok) {
                await fetchTokens();
            } else {
                const err = await res.json();
                alert(`Failed to revoke: ${err.error}`);
            }
        } catch {
            alert("Network error revoking token.");
        }
    };

    const handleCopyToken = async () => {
        if (!generatedToken) return;
        await navigator.clipboard.writeText(generatedToken.plain_token);
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2500);
    };

    const handleCreateOrg = async () => {
        if (!newOrgName.trim()) return;
        setCreatingOrg(true);
        try {
            const res = await fetch(`/api/admin/organizations?workspaceId=${workspaceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newOrgName.trim() }),
            });
            if (res.ok) {
                const org = await res.json();
                setOrganizations(prev => [...prev, org]);
                setActiveOrgId(org.id);
                setNewOrgName("");
                setShowOrgInput(false);
            }
        } catch {
            alert("Network error creating organization.");
        } finally {
            setCreatingOrg(false);
        }
    };

    const handleToggleShield = async () => {
        setShieldToggling(true);
        const next = !userSettings.proxyEnabled;
        try {
            await saveSettings({ proxyEnabled: next });
            await fetch("/api/proxy/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proxy_enabled: next, workspaceId }),
            });
        } catch {
            await saveSettings({ proxyEnabled: !next });
        } finally {
            setShieldToggling(false);
        }
    };

    const handleRunAudit = async () => {
        setAuditRunning(true);
        try {
            const res = await fetch("/api/admin/audit/trigger", { method: "POST" });
            if (res.ok) alert("Validation scan initiated.");
            else alert("Failed to trigger scan.");
        } catch {
            alert("Network error triggering scan.");
        } finally {
            setAuditRunning(false);
        }
    };

    /* ── Computed ──────────────────────────────────────────── */

    const lastReport = auditHistory[0];
    const validationTimestamp = lastReport
        ? new Date(lastReport.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
        : "Never";
    const activeDevices = devices.filter(d => d.status === "Healthy" || d.status === "active");
    const offlineDevices = devices.filter(d => d.status === "Offline" || d.status === "revoked");

    /* ── Loading ──────────────────────────────────────────── */

    if (loading || settingsLoading) {
        return (
            <div className="flex items-center justify-center py-20 min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/10 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Governance Pulse Syncing...</p>
                </div>
            </div>
        );
    }

    /* ── Render ───────────────────────────────────────────── */

    return (
        <div className="mx-auto max-w-[1100px] p-8 space-y-8 font-sans antialiased text-white pb-32">

            {/* ZONE 1: Primary CTA */}
            <section className="card flex flex-col items-center justify-center text-center shadow-xl border-none ring-1 ring-[var(--border-main)] py-16 px-12 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-[var(--brand-color)] opacity-80" />
                <div className="w-16 h-16 rounded-2xl bg-[var(--brand-color)]/10 flex items-center justify-center mb-10 shadow-sm">
                    <Shield className="w-7 h-7 text-[var(--brand-color)]" strokeWidth={2.5} />
                </div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-6">Governance Assurance Scan</h2>
                <p className="text-sm text-secondary font-semibold uppercase tracking-widest max-w-lg leading-relaxed mb-12">
                    Initiate an independent validation sequence to verify current endpoint policy enforcement against organizational security standards.
                </p>
                <button
                    onClick={handleRunAudit}
                    disabled={auditRunning}
                    className="btn-primary px-16 py-4 rounded-xl text-[12px] shadow-2xl transition-all active:scale-95 flex items-center gap-4"
                >
                    {auditRunning && <span className="animate-spin w-4 h-4 border-2 border-white/20 border-b-white rounded-full" />}
                    Run Independent Validation Scan
                </button>
            </section>

            {/* GOVERNANCE SUMMARY STRIP */}
            <div className="card px-10 py-8 flex flex-wrap items-center justify-between gap-8 shadow-2xl backdrop-blur-md">
                {/* AI Shield + Toggle */}
                <div className="flex items-center gap-5">
                    <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">AI Shield</p>
                        <span className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 ${userSettings.proxyEnabled ? "text-emerald-500" : "text-red-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${userSettings.proxyEnabled ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-red-500"}`} />
                            {userSettings.proxyEnabled ? "Protected" : "Inactive"}
                        </span>
                    </div>
                    <button
                        onClick={handleToggleShield}
                        disabled={shieldToggling}
                        className={`ml-2 flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-60 ${userSettings.proxyEnabled
                            ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}
                    >
                        {shieldToggling
                            ? <span className="animate-spin w-3 h-3 border border-current border-b-transparent rounded-full" />
                            : userSettings.proxyEnabled
                                ? <ToggleRight className="w-4 h-4" />
                                : <ToggleLeft className="w-4 h-4" />
                        }
                        {userSettings.proxyEnabled ? "Disable" : "Enable"}
                    </button>
                </div>

                <div className="border-l border-[var(--border-main)] pl-10">
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">Devices Online</p>
                    <span className="text-sm font-black uppercase tracking-widest">
                        <span className="text-emerald-400">{activeDevices.length}</span>
                        <span className="text-white/30 mx-1">/</span>
                        <span className="text-white">{devices.length}</span>
                    </span>
                </div>

                <div className="border-l border-[var(--border-main)] pl-10">
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">Policy Version</p>
                    <span className="text-sm font-black text-white uppercase tracking-widest">
                        v{organizations.find(o => o.id === activeOrgId)?.policy_version ?? "—"}
                    </span>
                </div>

                <div className="border-l border-[var(--border-main)] pl-10">
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">Last Validation</p>
                    <span className="text-sm font-black text-white uppercase tracking-widest">{validationTimestamp}</span>
                </div>

                {lastReport && (
                    <div className="border-l border-[var(--border-main)] pl-10 hidden md:block">
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">Validation Score</p>
                        <span className="text-4xl font-black text-white italic tracking-tighter tabular-nums">
                            {lastReport.enforcementScore}/100
                        </span>
                    </div>
                )}
            </div>

            {/* ZONE 2: Audit & Scheduling (Collapsible) */}
            <section className="card p-0 shadow-sm transition-all hover:border-[var(--border-soft)]">
                <div
                    onClick={() => setAuditCollapsed(prev => !prev)}
                    className="w-full px-8 py-6 flex justify-between items-center cursor-pointer transition-colors hover:bg-white/[0.02]"
                >
                    <div className="flex items-center gap-4">
                        <Clock className="w-5 h-5 text-white" />
                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white italic">Audit &amp; Scheduling Preferences</h3>
                    </div>
                    {auditCollapsed ? <ChevronRight className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
                </div>
                {!auditCollapsed && (
                    <div className="p-10 border-t border-[var(--border-soft)] animate-in slide-in-from-top-2 duration-300">
                        <p className="text-[11px] text-white/40 uppercase tracking-widest font-black">
                            Audit scheduling is managed via GitHub Actions workflow (daily-audit.yml). Schedule and email recipients are configured in the repository settings.
                        </p>
                    </div>
                )}
            </section>

            {/* ZONE 3: Enrollment Provisions (Collapsible) */}
            <section className="card p-0 shadow-sm transition-all hover:border-[var(--border-soft)]">
                <div
                    onClick={() => setEnrollmentCollapsed(prev => !prev)}
                    className="w-full px-8 py-6 flex justify-between items-center cursor-pointer transition-colors hover:bg-white/[0.02]"
                >
                    <div className="flex items-center gap-4">
                        <Plus className="w-5 h-5 text-white" />
                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white italic">Enrollment Provisions</h3>
                    </div>
                    {enrollmentCollapsed ? <ChevronRight className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
                </div>

                {!enrollmentCollapsed && (
                    <div className="p-10 border-t border-[var(--border-soft)] animate-in slide-in-from-top-2 duration-300 space-y-10">

                        {/* Organization Selector */}
                        <div className="flex items-center gap-3 border-b border-[var(--border-soft)] pb-6 overflow-x-auto custom-scrollbar flex-wrap">
                            {organizations.map(org => (
                                <button
                                    key={org.id}
                                    onClick={(e) => { e.stopPropagation(); setActiveOrgId(org.id); }}
                                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${activeOrgId === org.id
                                        ? "bg-[var(--brand-color)] text-white border-[var(--brand-color)] shadow-lg"
                                        : "bg-[var(--bg-card-hover)] text-[var(--text-muted)] border-transparent hover:border-[var(--border-main)]"}`}
                                >
                                    {org.name}
                                </button>
                            ))}

                            {showOrgInput ? (
                                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                    <input
                                        type="text"
                                        value={newOrgName}
                                        onChange={e => setNewOrgName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") handleCreateOrg();
                                            if (e.key === "Escape") { setShowOrgInput(false); setNewOrgName(""); }
                                        }}
                                        placeholder="Organization name..."
                                        autoFocus
                                        className="bg-white/5 border border-[var(--border-main)] rounded-lg px-4 py-2 text-xs font-bold text-white focus:outline-none focus:border-[var(--brand-color)]/50 placeholder:text-zinc-500 w-48"
                                    />
                                    <button
                                        onClick={handleCreateOrg}
                                        disabled={creatingOrg || !newOrgName.trim()}
                                        className="px-4 py-2 rounded-lg bg-[var(--brand-color)] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                    >
                                        {creatingOrg ? "..." : "Add"}
                                    </button>
                                    <button
                                        onClick={() => { setShowOrgInput(false); setNewOrgName(""); }}
                                        className="px-3 py-2 text-white/40 hover:text-white text-[10px]"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowOrgInput(true); }}
                                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--bg-card-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-main)] transition-all"
                                    title="Add organization"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* One-time Token Display */}
                        {generatedToken && (
                            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-6 space-y-4 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.25em]">
                                        New Token Generated — Copy Now (shown once)
                                    </p>
                                    <button
                                        onClick={() => setGeneratedToken(null)}
                                        className="text-white/30 hover:text-white text-xs"
                                    >
                                        ✕ Dismiss
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <code className="flex-1 bg-black/30 rounded-lg px-4 py-3 text-xs font-mono text-emerald-300 break-all select-all">
                                        {tokenVisible ? generatedToken.plain_token : generatedToken.plain_token.replace(/./g, "•")}
                                    </code>
                                    <button
                                        onClick={() => setTokenVisible(v => !v)}
                                        className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                                        title={tokenVisible ? "Hide" : "Reveal"}
                                    >
                                        {tokenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button
                                        onClick={handleCopyToken}
                                        className={`p-2.5 rounded-lg transition-all ${tokenCopied ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 hover:bg-white/10 text-white/40 hover:text-white"}`}
                                        title="Copy to clipboard"
                                    >
                                        {tokenCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">
                                    Expires: {new Date(generatedToken.expires_at).toLocaleString()} · Valid 7 days · Unlimited enrollments
                                </p>
                            </div>
                        )}

                        {/* Token List */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest font-mono">
                                    Provisioning Tokens <span className="ml-2 text-white/20">({tokens.length})</span>
                                </h4>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleGenerateToken(); }}
                                    disabled={generatingToken || !activeOrgId}
                                    className="flex items-center gap-2 text-[10px] font-black text-[var(--brand-color)] uppercase tracking-widest hover:underline decoration-2 underline-offset-4 disabled:opacity-50"
                                >
                                    {generatingToken
                                        ? <span className="animate-spin w-3 h-3 border border-[var(--brand-color)] border-b-transparent rounded-full" />
                                        : <Plus className="w-3 h-3" />
                                    }
                                    Generate New Token
                                </button>
                            </div>

                            {tokens.length === 0 ? (
                                <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-xl p-10 text-center">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest">
                                        No tokens yet — generate one to start enrolling devices.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {tokens.map(token => (
                                        <div key={token.id} className="bg-[var(--bg-card-hover)] border border-[var(--border-soft)] rounded-xl px-6 py-4 flex items-center justify-between group hover:border-[var(--border-main)] transition-all">
                                            <div className="flex items-center gap-5 min-w-0">
                                                <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${tokenStatusBadge(token.status)}`}>
                                                    {token.status}
                                                </span>
                                                <span className="text-[11px] font-mono font-bold text-[var(--text-secondary)] truncate">{token.token}</span>
                                                <span className="text-[9px] text-white/30 font-black uppercase tracking-widest flex-shrink-0">
                                                    {token.uses_count} enrolled{token.max_uses ? ` / ${token.max_uses} max` : ""}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <span className="text-[9px] text-white/20 font-bold font-mono hidden md:block">
                                                    exp {new Date(token.expires_at).toLocaleDateString()}
                                                </span>
                                                {token.status === "active" && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleRevokeToken(token.id); }}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-500/20"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                        Revoke
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Enrolled Device List */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest font-mono">
                                    Enrolled Devices
                                    <span className="ml-3 text-emerald-400">{activeDevices.length} online</span>
                                    {offlineDevices.length > 0 && (
                                        <span className="ml-3 text-red-400">{offlineDevices.length} offline</span>
                                    )}
                                </h4>
                                <button
                                    onClick={(e) => { e.stopPropagation(); fetchData(); }}
                                    className="flex items-center gap-1.5 text-[9px] font-black text-white/30 hover:text-white uppercase tracking-widest"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    Refresh
                                </button>
                            </div>

                            {devices.length === 0 ? (
                                <div className="bg-white/[0.01] border border-dashed border-white/10 rounded-xl p-10 text-center">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest">
                                        No devices enrolled yet — distribute a provisioning token to your endpoints.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[9px] font-black text-white/20 uppercase tracking-widest border-b border-white/5">
                                                <th className="pb-3 pr-6">Endpoint</th>
                                                <th className="pb-3 pr-6">OS</th>
                                                <th className="pb-3 pr-6">Agent</th>
                                                <th className="pb-3 pr-6">Last Seen</th>
                                                <th className="pb-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.03]">
                                            {devices.map(device => (
                                                <tr key={device.device_id} className="hover:bg-white/[0.01] transition-colors">
                                                    <td className="py-3.5 pr-6">
                                                        <p className="text-xs font-black text-white/80 uppercase tracking-tight">{device.hostname}</p>
                                                        <p className="text-[9px] text-white/20 font-mono mt-0.5">{device.device_id.substring(0, 12)}</p>
                                                    </td>
                                                    <td className="py-3.5 pr-6">
                                                        <span className="text-xs font-bold text-white/50 uppercase">{device.os_type || "—"}</span>
                                                    </td>
                                                    <td className="py-3.5 pr-6">
                                                        <span className="text-xs font-mono text-white/40">v{device.agent_version || "—"}</span>
                                                    </td>
                                                    <td className="py-3.5 pr-6">
                                                        <span className="text-xs text-white/30 font-bold">
                                                            {new Date(device.last_sync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-1.5 h-1.5 rounded-full ${deviceStatusDot(device.status)}`} />
                                                            <span className="text-[9px] font-black uppercase tracking-wider text-white/50">{device.status}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                    </div>
                )}
            </section>

            {/* ZONE 4: Assurance History Log */}
            <section id="history-ledger" className="card p-0 shadow-xl overflow-hidden border-none ring-1 ring-[var(--border-main)]">
                <div className="px-10 py-8 border-b border-[var(--border-soft)] flex justify-between items-center bg-[var(--bg-sidebar)]/30">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-primary italic">Assurance History Log</h3>
                    <button
                        onClick={() => document.getElementById("history-ledger")?.scrollIntoView({ behavior: "smooth" })}
                        className="flex items-center gap-3 text-[10px] font-black text-[var(--brand-color)] hover:underline uppercase tracking-[0.2em] decoration-2 underline-offset-4"
                    >
                        <Download className="w-4 h-4" />
                        View Audit Ledger
                    </button>
                </div>
                <div className="divide-y divide-[var(--border-soft)]">
                    {auditHistory.length === 0 ? (
                        <div className="p-24 text-center">
                            <p className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.4em]">Historical Ledger Empty</p>
                        </div>
                    ) : (
                        auditHistory.map((report) => (
                            <div key={report.id} className="px-10 py-7 hover:bg-[var(--bg-card-hover)] transition-all flex items-center justify-between cursor-default">
                                <div className="flex items-center gap-12">
                                    <div className="flex flex-col">
                                        <span className="text-base font-black text-[var(--text-primary)] tabular-nums tracking-tight">SIG_{report.id.substring(0, 8).toUpperCase()}</span>
                                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mt-1.5 font-mono">
                                            {new Date(report.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2.5">
                                        {report.findings?.slice(0, 2).map((f: any, i: number) => (
                                            <span key={i} className="px-3 py-1 rounded-md text-[9px] font-black uppercase bg-[var(--bg-page)] text-[var(--text-secondary)] border border-[var(--border-main)]">
                                                {f.title}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-12">
                                    <div className="text-right">
                                        <span className={`text-2xl font-black italic tracking-tighter ${report.enforcementScore >= 80 ? "text-emerald-500" : report.enforcementScore >= 50 ? "text-amber-500" : "text-red-500"}`}>
                                            {report.enforcementScore}/100
                                        </span>
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1">Audit Score</p>
                                    </div>
                                    <div className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] shadow-sm ${report.overallStatus === "HEALTHY" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>
                                        {report.overallStatus}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
