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
        <div className="mx-auto max-w-[1100px] p-8 space-y-8 font-sans antialiased text-white pb-32">

            {/* ── Governance Summary Strip ── */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl px-10 py-6 flex items-center justify-between shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <div className="flex items-center gap-14">
                    <div className="group">
                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1 font-mono group-hover:text-zinc-400 transition-colors">AI Shield</p>
                        <span className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            Protected
                        </span>
                    </div>
                    <div className="border-l border-white/5 pl-14">
                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1 font-mono">Policy Version</p>
                        <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">v2.4.19</span>
                    </div>
                    <div className="border-l border-white/5 pl-14">
                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1 font-mono">Last Validation</p>
                        <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">{validationTimestamp}</span>
                    </div>
                </div>
                <div className="flex items-center gap-14">
                    <div className="text-right border-l border-white/5 pl-14 hidden md:block">
                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1 font-mono">Validation Score</p>
                        <span className="text-3xl font-black text-white italic tracking-tighter tabular-nums">
                            {lastReport?.enforcementScore || 0}/100
                        </span>
                    </div>
                </div>
            </div>

            {/* ── ZONE 1: PRIMARY ACTION (Governance Assurance) ── */}
            <section className="bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/40 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                <div className="w-12 h-12 rounded-full border border-blue-500/20 bg-blue-500/5 flex items-center justify-center mb-6 shadow-2xl transition-transform group-hover:scale-110">
                    <Shield className="w-5 h-5 text-blue-400/80" />
                </div>

                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase mb-4">Governance Assurance Scan</h2>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest max-w-lg leading-relaxed mb-10">
                    Initiate an independent validation sequence to verify current endpoint policy enforcement against organizational security standards.
                </p>

                <button
                    onClick={handleRunAudit}
                    disabled={auditRunning}
                    className="bg-white hover:bg-zinc-200 disabled:opacity-30 disabled:grayscale text-black px-12 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-2xl active:scale-95 flex items-center gap-3"
                >
                    {auditRunning ? <span className="animate-spin w-3 h-3 border-2 border-black/20 border-b-black rounded-full" /> : null}
                    Run Independent Validation Scan
                </button>
            </section>

            {/* ── ZONE 2: AUDIT & SCHEDULING (Collapsible) ── */}
            <section className="bg-white/[0.01] border border-white/10 rounded-2xl overflow-hidden shadow-sm transition-all hover:border-white/20">
                <button
                    onClick={() => setAuditCollapsed(!auditCollapsed)}
                    className="w-full px-8 py-6 flex justify-between items-center bg-white/[0.01] hover:bg-white/[0.02] transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <Clock className="w-4 h-4 text-zinc-600" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 italic">Audit & Scheduling Preferences</h3>
                    </div>
                    {auditCollapsed ? <ChevronRight className="w-4 h-4 text-zinc-700" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                </button>
                {!auditCollapsed && (
                    <div className="p-10 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            <div className="space-y-6">
                                <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest block font-mono">Assurance Cadence</label>
                                <div className="flex flex-wrap gap-2">
                                    {(["manual", "daily", "weekly", "monthly"] as const).map(f => (
                                        <button
                                            key={f}
                                            className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${auditConfig.frequency === f ? "bg-white text-black border-white" : "text-zinc-500 border-white/5 hover:border-white/10"}`}
                                            onClick={() => setAuditConfig(prev => ({ ...prev, frequency: f }))}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest block font-mono">Report Recipients</label>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="Add security stakeholder email..." className="flex-1 bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-xs font-bold text-zinc-400 focus:outline-none focus:border-white/20 placeholder:text-zinc-800" />
                                    <button className="bg-white/5 hover:bg-white/10 p-2.5 rounded-lg border border-white/5">
                                        <Plus className="w-4 h-4 text-zinc-400" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* ── ZONE 3: ENROLLMENT PROVISIONS (Collapsible) ── */}
            <section className="bg-white/[0.01] border border-white/10 rounded-2xl overflow-hidden shadow-sm transition-all hover:border-white/20">
                <button
                    onClick={() => setEnrollmentCollapsed(!enrollmentCollapsed)}
                    className="w-full px-8 py-6 flex justify-between items-center bg-white/[0.01] hover:bg-white/[0.02] transition-colors"
                >
                    <div className="flex items-center gap-4">
                        <Plus className="w-4 h-4 text-zinc-600" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 italic">Enrollment Provisions</h3>
                    </div>
                    {enrollmentCollapsed ? <ChevronRight className="w-4 h-4 text-zinc-700" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                </button>
                {!enrollmentCollapsed && (
                    <div className="p-10 border-t border-white/5 animate-in slide-in-from-top-2 duration-300 space-y-12">
                        {/* Organization Selection */}
                        <div className="flex items-center gap-4 border-b border-white/5 pb-8 overflow-x-auto pb-4">
                            {organizations.map(org => (
                                <button
                                    key={org.id}
                                    onClick={() => setActiveOrgId(org.id)}
                                    className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${activeOrgId === org.id ? "bg-white text-black border-white" : "bg-white/5 text-zinc-500 border-transparent hover:border-white/10"}`}
                                >
                                    {org.name}
                                </button>
                            ))}
                            <button className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:bg-white/10 transition-all">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Token List */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest font-mono">Provisioning Tokens</h4>
                                <button className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300">Generate New Token</button>
                            </div>
                            <div className="space-y-2">
                                {tokens.map(token => (
                                    <div key={token.id} className="bg-white/[0.02] border border-white/5 rounded-xl px-6 py-4 flex items-center justify-between group">
                                        <div className="flex items-center gap-6">
                                            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300 transition-colors uppercase">{token.token}</span>
                                            <span className="text-[9px] text-zinc-700 font-black uppercase tracking-widest">{token.os_target || "Global"}</span>
                                        </div>
                                        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-red-900 hover:text-red-500">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* ── ZONE 4: VALIDATION HISTORY (History Table) ── */}
            <section className="bg-white/[0.01] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                <div className="px-10 py-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                    <div className="flex items-center gap-4">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30 italic">Assurance History Log</h3>
                    </div>
                    <Link href="/dashboard/reports" className="flex items-center gap-2 text-[10px] font-black text-zinc-500 hover:text-zinc-200 transition-colors uppercase tracking-[0.2em]">
                        <Download className="w-3.5 h-3.5" />
                        Export Validation Report
                    </Link>
                </div>
                <div className="divide-y divide-white/[0.03]">
                    {auditHistory.length === 0 ? (
                        <div className="p-20 text-center">
                            <p className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.4em]">Historical Ledger Empty</p>
                        </div>
                    ) : (
                        auditHistory.map((report) => (
                            <div key={report.id} className="px-10 py-6 hover:bg-white/[0.01] transition-all flex items-center justify-between group cursor-default">
                                <div className="flex items-center gap-10">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-black text-white/80 tabular-nums">SCAN_{report.id.substring(0, 8).toUpperCase()}</span>
                                        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mt-1">
                                            {new Date(report.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {report.findings?.slice(0, 2).map((f: any, i: number) => (
                                            <span key={i} className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-zinc-900 text-zinc-600 border border-white/5">
                                                {f.title}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-10">
                                    <div className="text-right">
                                        <span className={`text-xl font-black italic tracking-tighter ${report.enforcementScore >= 80 ? 'text-emerald-500' : report.enforcementScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                            {report.enforcementScore}/100
                                        </span>
                                        <p className="text-[8px] font-black text-zinc-700 uppercase tracking-widest mt-0.5">Assured Score</p>
                                    </div>
                                    <div className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${report.overallStatus === 'HEALTHY' ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10' : 'bg-amber-500/5 text-amber-500 border border-amber-500/10'}`}>
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
