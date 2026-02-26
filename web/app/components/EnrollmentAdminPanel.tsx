"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Send, CheckCircle, AlertTriangle, Shield, Clock, Search, ChevronDown, ChevronRight, Download } from "lucide-react";
import Link from "next/link";

interface Organization {
    id: string;
    name: string;
    created_at: string;
}

interface EnrollmentToken {
    id: string;
    token: string;
    created_at: string;
    expires_at: string;
    os_target?: string;
}

interface Agent {
    device_id: string;
    hostname: string;
    os_type: string;
    agent_version: string;
    last_sync: string;
    status: string;
}

interface AuditConfig {
    frequency: "daily" | "weekly" | "monthly" | "manual";
    recipients: string[];
    last_run: string | null;
}

interface AuditReport {
    id: string;
    timestamp: string;
    overallStatus: string;
    enforcementScore: number;
    findings: any[];
}

export default function EnrollmentAdminPanel() {
    // ── DATA STATE ───────────────────────────────────────────
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [activeOrgId, setActiveOrgId] = useState<string>("default");
    const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
    const [devices, setDevices] = useState<Agent[]>([]);
    const [auditConfig, setAuditConfig] = useState<AuditConfig>({
        frequency: "weekly",
        recipients: [],
        last_run: null
    });
    const [auditHistory, setAuditHistory] = useState<AuditReport[]>([]);

    // ── UI STATE ─────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [auditCollapsed, setAuditCollapsed] = useState(true);
    const [enrollmentCollapsed, setEnrollmentCollapsed] = useState(true);
    const [auditRunning, setAuditRunning] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [orgRes, tokenRes, agentRes, auditRes, configRes] = await Promise.all([
                fetch("/api/admin/organizations"),
                fetch(`/api/admin/enrollment/tokens?organizationId=${activeOrgId}`),
                fetch(`/api/agent/heartbeat?workspaceId=${activeOrgId}`),
                fetch("/api/admin/audit/history"),
                fetch("/api/admin/audit/config")
            ]);

            if (orgRes.ok) setOrganizations((await orgRes.json()).organizations);
            if (tokenRes.ok) setTokens((await tokenRes.json()).tokens);
            if (agentRes.ok) setDevices((await agentRes.json()).agents);
            if (auditRes.ok) setAuditHistory((await auditRes.json()).reports);
            if (configRes.ok) setAuditConfig((await configRes.json()).config);
        } catch (err) {
            console.error("Governance fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [activeOrgId]);

    useEffect(() => {
        fetchData();
        const iv = setInterval(fetchData, 15000);
        return () => clearInterval(iv);
    }, [fetchData]);

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

    const lastReport = auditHistory[0];
    const validationTimestamp = lastReport ? new Date(lastReport.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Never';

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/10 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Governance Pulse Syncing...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1100px] p-4 md:p-8 space-y-8 font-sans antialiased text-white pb-32 w-full min-w-0">

            {/* ── ZONE 1: PRIMARY ACTION (Governance Assurance) ── */}
            <section className="card flex flex-col items-center justify-center text-center shadow-xl border-none ring-1 ring-[var(--border-main)] py-10 md:py-16 px-4 md:px-12 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-2 bg-[var(--brand-color)] opacity-80" />

                <div className="w-16 h-16 rounded-2xl bg-[var(--brand-color)]/10 flex items-center justify-center mb-8 md:mb-10 shadow-sm">
                    <Shield className="w-7 h-7 text-[var(--brand-color)]" strokeWidth={2.5} />
                </div>

                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase mb-4 md:mb-6">Governance Assurance Scan</h2>
                <p className="text-sm text-secondary font-semibold uppercase tracking-widest max-w-lg leading-relaxed mb-8 md:mb-12">
                    Initiate an independent validation sequence to verify current endpoint policy enforcement against organizational security standards.
                </p>

                <button
                    onClick={handleRunAudit}
                    disabled={auditRunning}
                    className="btn-primary w-full md:w-auto px-8 md:px-16 py-3 md:py-4 rounded-xl text-[12px] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                    {auditRunning && <span className="animate-spin w-4 h-4 border-2 border-white/20 border-b-white rounded-full" />}
                    Run Independent Validation Scan
                </button>
            </section>

            {/* ── Governance Summary Strip ── */}
            <div className="card px-4 md:px-10 py-6 md:py-8 flex flex-wrap gap-6 items-center justify-between shadow-2xl backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-6 md:gap-14">
                    <div className="group">
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">AI Shield</p>
                        <span className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            Protected
                        </span>
                    </div>
                    <div className="border-l border-[var(--border-main)] pl-4 md:pl-14">
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">Policy Version</p>
                        <span className="text-sm font-black text-white uppercase tracking-widest">v2.4.19</span>
                    </div>
                    <div className="border-l border-[var(--border-main)] pl-4 md:pl-14">
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">Last Validation</p>
                        <span className="text-sm font-black text-white uppercase tracking-widest">{validationTimestamp}</span>
                    </div>
                </div>
                <div className="flex items-center gap-6 md:gap-14">
                    <div className="text-right border-l border-[var(--border-main)] pl-4 md:pl-14">
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1 font-mono">Validation Score</p>
                        <span className="text-3xl md:text-4xl font-black text-white italic tracking-tighter tabular-nums">
                            {lastReport?.enforcementScore || 0}/100
                        </span>
                    </div>
                </div>
            </div>

            {/* ── ZONE 2: AUDIT & SCHEDULING (Collapsible) ── */}
            <section className="card p-0 overflow-hidden shadow-sm transition-all hover:border-[var(--border-soft)]">
                <button
                    onClick={() => setAuditCollapsed(!auditCollapsed)}
                    className="w-full px-8 py-6 flex justify-between items-center transition-colors hover:bg-white/[0.02]"
                >
                    <div className="flex items-center gap-4">
                        <Clock className="w-5 h-5 text-white" />
                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white italic">Audit & Scheduling Preferences</h3>
                    </div>
                    {auditCollapsed ? <ChevronRight className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
                </button>
                {!auditCollapsed && (
                    <div className="p-4 md:p-10 border-t border-[var(--border-soft)] animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                            <div className="space-y-6">
                                <label className="text-[10px] font-black text-muted uppercase tracking-widest block font-mono">Assurance Cadence</label>
                                <div className="flex flex-wrap gap-3">
                                    {(["manual", "daily", "weekly", "monthly"] as const).map(f => (
                                        <button
                                            key={f}
                                            className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${auditConfig.frequency === f ? "bg-[var(--brand-color)] text-white border-[var(--brand-color)]" : "text-secondary border-[var(--border-main)] hover:border-primary/30"}`}
                                            onClick={() => setAuditConfig(prev => ({ ...prev, frequency: f }))}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-muted uppercase tracking-widest block font-mono">Report Recipients</label>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="Add security stakeholder email..." className="flex-1 bg-white/5 dark:bg-white/[0.03] border border-[var(--border-main)] rounded-lg px-4 py-2.5 text-xs font-bold text-primary focus:outline-none focus:border-[var(--brand-color)]/50 placeholder:text-zinc-500" />
                                    <button className="bg-white/5 dark:bg-white/[0.05] hover:bg-white/10 p-2.5 rounded-lg border border-[var(--border-main)] transition-colors">
                                        <Plus className="w-4 h-4 text-primary" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* ── ZONE 3: ENROLLMENT PROVISIONS (Collapsible) ── */}
            <section className="card p-0 overflow-hidden shadow-sm transition-all hover:border-[var(--border-soft)]">
                <button
                    onClick={() => setEnrollmentCollapsed(!enrollmentCollapsed)}
                    className="w-full px-8 py-6 flex justify-between items-center transition-colors hover:bg-white/[0.02]"
                >
                    <div className="flex items-center gap-4">
                        <Plus className="w-5 h-5 text-white" />
                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white italic">Enrollment Provisions</h3>
                    </div>
                    {enrollmentCollapsed ? <ChevronRight className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
                </button>
                {!enrollmentCollapsed && (
                    <div className="p-4 md:p-10 border-t border-[var(--border-soft)] animate-in slide-in-from-top-2 duration-300 space-y-8 md:space-y-12">
                        {/* Organization Selection */}
                        <div className="flex items-center gap-4 border-b border-[var(--border-soft)] pb-8 overflow-x-auto">
                            {organizations.map(org => (
                                <button
                                    key={org.id}
                                    onClick={() => setActiveOrgId(org.id)}
                                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${activeOrgId === org.id
                                        ? "bg-[var(--brand-color)] text-white border-[var(--brand-color)] shadow-lg"
                                        : "bg-[var(--bg-card-hover)] text-[var(--text-muted)] border-transparent hover:border-[var(--border-main)]"}`}
                                >
                                    {org.name}
                                </button>
                            ))}
                            <button className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--bg-card-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-main)] border border-transparent transition-all">
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Token List */}
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest font-mono">Provisioning Tokens</h4>
                                <button className="text-[10px] font-black text-[var(--brand-color)] uppercase tracking-widest hover:underline decoration-2 underline-offset-4">Generate New Token</button>
                            </div>
                            <div className="space-y-3">
                                {tokens.map(token => (
                                    <div key={token.id} className="bg-[var(--bg-card-hover)] border border-[var(--border-soft)] rounded-xl px-4 md:px-8 py-4 md:py-5 flex items-center justify-between group transition-all hover:border-[var(--border-main)] shadow-sm min-w-0">
                                        <div className="flex flex-wrap items-center gap-3 md:gap-10 min-w-0">
                                            <span className="text-[11px] font-mono font-bold text-[var(--text-secondary)] uppercase tracking-tight truncate">{token.token}</span>
                                            <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest bg-[var(--bg-page)] px-3 py-1 rounded-md shrink-0">{token.os_target || "Global"}</span>
                                        </div>
                                        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-2.5 text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-950/30">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* ── ZONE 4: VALIDATION HISTORY (History Table) ── */}
            <section id="history-ledger" className="card p-0 shadow-xl overflow-hidden border-none ring-1 ring-[var(--border-main)]">
                <div className="px-4 md:px-10 py-6 md:py-8 border-b border-[var(--border-soft)] flex justify-between items-center bg-[var(--bg-sidebar)]/30">
                    <div className="flex items-center gap-4">
                        <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-primary italic">Assurance History Log</h3>
                    </div>
                    <button
                        onClick={() => document.getElementById('history-ledger')?.scrollIntoView({ behavior: 'smooth' })}
                        className="flex items-center gap-3 text-[10px] font-black text-[var(--brand-color)] hover:underline uppercase tracking-[0.2em] decoration-2 underline-offset-4 shrink-0"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">View Audit Ledger</span>
                    </button>
                </div>
                <div className="divide-y divide-[var(--border-soft)]">
                    {auditHistory.length === 0 ? (
                        <div className="p-12 md:p-24 text-center">
                            <p className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.4em]">Historical Ledger Empty</p>
                        </div>
                    ) : (
                        auditHistory.map((report) => (
                            <div key={report.id} className="px-4 md:px-10 py-5 md:py-7 hover:bg-[var(--bg-card-hover)] transition-all flex flex-wrap items-start md:items-center justify-between gap-4 group cursor-default">
                                <div className="flex flex-col gap-2 min-w-0">
                                    <span className="text-base font-black text-[var(--text-primary)] tabular-nums tracking-tight truncate">SIG_{report.id.substring(0, 8).toUpperCase()}</span>
                                    <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider font-mono">
                                        {new Date(report.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {report.findings?.slice(0, 2).map((f: any, i: number) => (
                                            <span key={i} className="px-3 py-1 rounded-md text-[9px] font-black uppercase bg-[var(--bg-page)] text-[var(--text-secondary)] border border-[var(--border-main)]">
                                                {f.title}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                        <span className={`text-xl md:text-2xl font-black italic tracking-tighter ${report.enforcementScore >= 80 ? 'text-emerald-500' : report.enforcementScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                            {report.enforcementScore}/100
                                        </span>
                                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1">Audit Score</p>
                                    </div>
                                    <div className={`px-3 md:px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] shadow-sm ${report.overallStatus === 'HEALTHY' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
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
