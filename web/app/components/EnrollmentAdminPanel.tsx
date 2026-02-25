"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const DEFAULT_POLICY_SCHEMA = {
    risk_threshold: 60,
    block_high_risk: true,
    auto_redaction: true,
    audit_mode: false,
    scan_attachments: false,
    retention_days: 90
};

export default function EnrollmentAdminPanel() {
    const { user } = useAuth();
    const workspaceId = user?.uid || "default";

    const [orgs, setOrgs] = useState<any[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<any | null>(null);
    const [tokens, setTokens] = useState<any[]>([]);
    const [devices, setDevices] = useState<any[]>([]);

    const [newOrgName, setNewOrgName] = useState("");
    const [policyJson, setPolicyJson] = useState("");
    const [policyError, setPolicyError] = useState("");
    const [tokenExpiresIn, setTokenExpiresIn] = useState(24);
    const [tokenMaxUses, setTokenMaxUses] = useState<number | "">("");

    const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string | null>(null);
    const [auditStatus, setAuditStatus] = useState<string>("");
    const [auditConfig, setAuditConfig] = useState<{ scheduleHour: number, emailRecipient: string }>({ scheduleHour: 13, emailRecipient: "" });
    const [auditHistory, setAuditHistory] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedReport, setSelectedReport] = useState<any | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);

    useEffect(() => {
        fetchOrgs();
        fetchAuditConfig();
        fetchAuditHistory();
    }, [workspaceId]);

    const fetchAuditConfig = async () => {
        const res = await fetch("/api/admin/audit/config");
        const data = await res.json();
        if (data && !data.error) setAuditConfig(data);
    };

    const fetchAuditHistory = async () => {
        const res = await fetch("/api/admin/audit/history");
        const data = await res.json();
        if (data && data.reports) setAuditHistory(data.reports);
    };

    const fetchOrgs = async () => {
        const res = await fetch(`/api/orgs?workspaceId=${workspaceId}`);
        const data = await res.json();
        setOrgs(data.orgs || []);
        if (data.orgs?.length > 0 && !selectedOrg) {
            selectOrg(data.orgs[0]);
        }
    };

    const selectOrg = async (org: any) => {
        setNewlyGeneratedToken(null);
        setSelectedOrg(org);

        let configToDisplay = org.policy_config;
        if (!configToDisplay || Object.keys(configToDisplay).length === 0) {
            configToDisplay = DEFAULT_POLICY_SCHEMA;
        }
        setPolicyJson(JSON.stringify(configToDisplay, null, 2));
        setPolicyError("");

        fetchTokens(org.org_id);
        fetchDevices(org.org_id);
    };

    const fetchTokens = async (org_id: string) => {
        const res = await fetch(`/api/orgs/${org_id}/tokens?workspaceId=${workspaceId}`);
        const data = await res.json();
        setTokens(data.tokens || []);
    };

    const fetchDevices = async (org_id: string) => {
        const res = await fetch(`/api/orgs/${org_id}/devices?workspaceId=${workspaceId}&_t=${Date.now()}`);
        const data = await res.json();

        if (process.env.NODE_ENV === "development") {
            console.log(`[Dev Mode Payload Data] Devices for Org ${org_id}:`, data);
        }

        setDevices(data.devices || []);
    };

    const handleCreateOrg = async () => {
        if (!newOrgName) return;
        const res = await fetch(`/api/orgs?workspaceId=${workspaceId}`, {
            method: "POST",
            body: JSON.stringify({ name: newOrgName }),
        });
        const data = await res.json();
        if (data.org_id) {
            setNewOrgName("");
            fetchOrgs();
            selectOrg(data);
        }
    };

    const handleUpdatePolicy = async () => {
        if (!selectedOrg) return;
        setPolicyError("");
        try {
            const parsed = JSON.parse(policyJson);

            // Basic Schema Validation
            const allowedKeys = Object.keys(DEFAULT_POLICY_SCHEMA);
            const extraKeys = Object.keys(parsed).filter(k => !allowedKeys.includes(k));
            if (extraKeys.length > 0) {
                setPolicyError(`Invalid keys found: ${extraKeys.join(", ")}`);
                return;
            }
            if (typeof parsed.risk_threshold !== "number" || parsed.risk_threshold < 0 || parsed.risk_threshold > 100) {
                setPolicyError("risk_threshold must be a number between 0 and 100");
                return;
            }
            if (typeof parsed.block_high_risk !== "boolean") {
                setPolicyError("block_high_risk must be a boolean");
                return;
            }
            if (typeof parsed.retention_days !== "number" || parsed.retention_days < 1) {
                setPolicyError("retention_days must be a positive number");
                return;
            }

            const res = await fetch(`/api/orgs/${selectedOrg.org_id}/policy?workspaceId=${workspaceId}`, {
                method: "POST",
                body: JSON.stringify({ policy_config: parsed }),
            });
            const data = await res.json();
            if (data.status === "ok") {
                fetchOrgs();
                setSelectedOrg({ ...selectedOrg, policy_version: data.policy_version, policy_config: data.policy_config });
                alert("Policy successfully validated and saving. New version: " + data.policy_version);
            } else {
                setPolicyError(data.error || "Failed to update policy");
            }
        } catch (e) {
            setPolicyError("Invalid JSON structure");
        }
    };

    const handleGenerateToken = async () => {
        if (!selectedOrg) return;
        const res = await fetch(`/api/orgs/${selectedOrg.org_id}/tokens?workspaceId=${workspaceId}`, {
            method: "POST",
            body: JSON.stringify({
                expires_in_hours: tokenExpiresIn,
                max_uses: tokenMaxUses === "" ? null : Number(tokenMaxUses),
            }),
        });
        const data = await res.json();
        if (data.status === "ok") {
            setNewlyGeneratedToken(data.token);
            fetchTokens(selectedOrg.org_id);
        }
    };

    const handleRunAudit = async () => {
        setAuditStatus("Triggering independent governance scan...");
        setIsAuditing(true);
        const startTime = new Date().toISOString();

        try {
            const res = await fetch("/api/admin/audit/trigger", { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                setAuditStatus("Scan triggered. Evaluation in progress (usually takes 30-60s)...");

                // Start polling for the new report
                let attempts = 0;
                const maxAttempts = 24; // 2 minutes (24 * 5s)

                const pollInterval = setInterval(async () => {
                    attempts++;
                    const historyRes = await fetch("/api/admin/audit/history");
                    const historyData = await historyRes.json();

                    if (historyData?.reports?.length > 0) {
                        const newestReport = historyData.reports[0];
                        // If the newest report is newer than when we started the trigger
                        if (new Date(newestReport.created_at) > new Date(startTime)) {
                            setAuditHistory(historyData.reports);
                            setAuditStatus("Success: New audit report generated and saved to history.");
                            setIsAuditing(false);
                            setShowHistory(true);
                            clearInterval(pollInterval);
                            return;
                        }
                    }

                    if (attempts >= maxAttempts) {
                        setAuditStatus("Scan triggered, but taking longer than expected to appear in history. Please check back in a minute.");
                        setIsAuditing(false);
                        clearInterval(pollInterval);
                    }
                }, 5000);

            } else {
                setAuditStatus("Failed to trigger audit: " + data.error);
                setIsAuditing(false);
            }
        } catch (e: any) {
            setAuditStatus("Error triggering audit.");
            setIsAuditing(false);
        }
    };

    const handleUpdateAuditConfig = async () => {
        setAuditStatus("Updating configuration...");
        try {
            const res = await fetch("/api/admin/audit/config", {
                method: "POST",
                body: JSON.stringify(auditConfig)
            });
            if (res.ok) {
                setAuditStatus("Audit configuration updated successfully.");
            } else {
                setAuditStatus("Failed to update configuration.");
            }
        } catch (e) {
            setAuditStatus("Error updating configuration.");
        }
    };

    const handleRevokeToken = async (token_id: string) => {
        if (!selectedOrg) return;
        const res = await fetch(`/api/orgs/${selectedOrg.org_id}/tokens/revoke?workspaceId=${workspaceId}`, {
            method: "POST",
            body: JSON.stringify({ token_id }),
        });
        const data = await res.json();
        if (data.status === "ok") {
            fetchTokens(selectedOrg.org_id);
        }
    };

    const handleRevokeDevice = async (device_id: string) => {
        if (!selectedOrg) return;
        const res = await fetch(`/api/orgs/${selectedOrg.org_id}/devices/revoke?workspaceId=${workspaceId}`, {
            method: "POST",
            body: JSON.stringify({ device_id }),
        });
        const data = await res.json();
        if (data.status === "ok") {
            fetchDevices(selectedOrg.org_id);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
    };

    const getTokenStatus = (t: any) => {
        if (t.revoked) return "Revoked";
        if (new Date() > new Date(t.expires_at)) return "Expired";
        if (t.max_uses !== null && t.uses_count >= t.max_uses) return "Depleted";
        return "Active";
    };

    const getDeviceStatus = (d: any) => {
        if (d.status === 'revoked') return 'Revoked';
        const lastSeen = new Date(d.last_heartbeat).getTime();
        if (Date.now() - lastSeen > 5 * 60 * 1000) return 'Offline'; // 5 mins
        return 'Active';
    };

    // Calculate Summary Metrics
    const avgScore = auditHistory.length > 0
        ? Math.round(auditHistory.reduce((acc, r) => acc + (r.enforcementScore || 0), 0) / auditHistory.length)
        : 0;
    const lastRunTime = auditHistory.length > 0
        ? new Date(auditHistory[0].timestamp || auditHistory[0].created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
        : "Never";

    return (
        <div className="flex flex-col gap-6">
            {/* Header & Org Badge */}
            <div className="flex flex-col gap-1.5 mb-2 text-left">
                <div className="flex items-baseline gap-3">
                    <h2 className="text-3xl font-bold text-zinc-50 tracking-tight">Governance Console</h2>
                    <div className="px-2.5 py-1 rounded-md bg-zinc-900 border border-white/5 flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Organization</span>
                        <span className="text-xs font-semibold text-zinc-300">{selectedOrg?.name || "None Selected"}</span>
                        {orgs.length > 1 && (
                            <div className="ml-2 flex gap-1">
                                {orgs.filter(o => o.org_id !== selectedOrg?.org_id).map(o => (
                                    <button
                                        key={o.org_id}
                                        onClick={() => selectOrg(o)}
                                        className="text-[10px] text-zinc-600 hover:text-zinc-400 font-bold underline"
                                    >
                                        Switch
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Compact Summary Bar */}
            <div className="flex items-center gap-8 py-3 px-1 border-y border-white/5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                <div className="flex gap-2">
                    <span>AI Shield:</span>
                    <span className="text-emerald-400 font-black">Active</span>
                </div>
                <div className="flex gap-2 border-l border-white/10 pl-8">
                    <span>Last Validation:</span>
                    <span className="text-zinc-300">{lastRunTime}</span>
                </div>
                <div className="flex gap-2 border-l border-white/10 pl-8">
                    <span>Avg Score:</span>
                    <span className="text-zinc-300">{avgScore}/100</span>
                </div>
            </div>

            {!selectedOrg ? (
                <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl">
                    <p className="text-zinc-500 text-sm">Select or create an organization to manage governance profiles.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* ZONE 1 — Primary Action */}
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-sm text-left">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <button
                                    onClick={handleRunAudit}
                                    disabled={isAuditing}
                                    className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all ${isAuditing ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'}`}
                                >
                                    {isAuditing ? (
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    )}
                                    {isAuditing ? "Auditing System..." : "Run Independent Validation Scan"}
                                </button>
                                {auditStatus && (
                                    <p className={`text-sm font-medium ${auditStatus.includes('Failed') || auditStatus.includes('Error') ? 'text-red-400' : 'text-zinc-400'}`}>
                                        {auditStatus}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ZONE 2 — Audit & Scheduling Preferences */}
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-sm text-left">
                        <div className="flex items-center justify-between mb-5">
                            <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest text-[#71717a]">Audit & Scheduling Preferences</h4>
                            <button
                                onClick={handleUpdateAuditConfig}
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/5 rounded-lg px-4 py-1.5 text-[11px] font-bold transition"
                            >
                                Save Preferences
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-1.5">
                                <label className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider block">Daily Audit Hour (UTC 0-23)</label>
                                <input
                                    type="number"
                                    min="0" max="23"
                                    value={auditConfig.scheduleHour}
                                    onChange={(e) => setAuditConfig({ ...auditConfig, scheduleHour: parseInt(e.target.value) })}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-100 focus:outline-none focus:border-zinc-700 transition"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider block">Report Recipient Email</label>
                                <input
                                    type="email"
                                    placeholder="compliance@enterprise.com"
                                    value={auditConfig.emailRecipient}
                                    onChange={(e) => setAuditConfig({ ...auditConfig, emailRecipient: e.target.value })}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-100 focus:outline-none focus:border-zinc-700 transition"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ZONE 3 — Independent Validation History */}
                    <div className={`bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-sm min-h-[300px] text-left`}>
                        <div className="flex items-center justify-between mb-6">
                            <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest text-[#71717a]">Validation History</h4>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => fetchAuditHistory()}
                                    disabled={isAuditing}
                                    className="text-[10px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/5"
                                >
                                    <svg className={`w-3 h-3 ${isAuditing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Refresh
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            {auditHistory.length > 0 ? (
                                auditHistory.map((report) => (
                                    <div
                                        key={report.id}
                                        onClick={() => setSelectedReport(report)}
                                        className="group flex items-center justify-between bg-zinc-900/40 border border-white/5 hover:bg-zinc-900/80 hover:border-white/10 rounded-xl p-4 cursor-pointer transition-all active:scale-[0.99]"
                                    >
                                        <div className="flex flex-col gap-0.5 text-left">
                                            <span className="text-sm font-bold text-zinc-100">{new Date(report.timestamp || report.created_at).toLocaleString()}</span>
                                            <span className="text-[10px] text-zinc-500 font-mono tracking-tight uppercase">Artifact: {report.id.substring(0, 16)}</span>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-2xl font-black text-zinc-50 leading-none">{report.enforcementScore}/100</span>
                                                <span className={`text-[9px] font-black uppercase tracking-[0.15em] opacity-80 ${report.overallStatus === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {report.overallStatus}
                                                </span>
                                            </div>
                                            <span className="text-zinc-700 group-hover:text-zinc-400 transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                            </span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/5 rounded-2xl">
                                    <p className="text-xs text-zinc-600 font-medium tracking-wide">Artifact history clear. Generate a scan to begin validation.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SECONDARY — Administrative Tools */}
                    <div className="mt-8 border-t border-white/5 pt-10 text-left">
                        <div className="flex items-baseline gap-3 mb-8 px-1">
                            <h4 className="text-xl font-bold text-zinc-300">Infrastructure & Enrollment</h4>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Administrative Tools</span>
                        </div>
                        <div className="grid grid-cols-1 gap-8">
                            {/* Policy Card */}
                            <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Global Policy Descriptor</h4>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-md font-bold">VER {selectedOrg.policy_version}</span>
                                        <button onClick={handleUpdatePolicy} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-1.5 text-[11px] font-bold transition">
                                            Apply Changes
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    className={`w-full bg-black/40 border rounded-xl p-4 text-xs font-mono leading-relaxed text-zinc-400 h-64 focus:outline-none focus:border-zinc-700 transition ${policyError ? 'border-red-500/30' : 'border-white/5'}`}
                                    value={policyJson}
                                    onChange={(e) => setPolicyJson(e.target.value)}
                                    spellCheck={false}
                                />
                                {policyError && (
                                    <p className="text-red-400 text-[10px] font-bold mt-3 uppercase tracking-wider">{policyError}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Tokens Card */}
                                <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-sm">
                                    <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-6">Enrollment Provisions</h4>
                                    <div className="flex gap-4 mb-6 border-t border-white/5 pt-6">
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[9px] text-zinc-500 font-bold uppercase block">TTL (Hrs)</span>
                                            <input type="number" value={tokenExpiresIn} onChange={(e) => setTokenExpiresIn(Number(e.target.value))} className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none" />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-[9px] text-zinc-500 font-bold uppercase block">Cap</span>
                                            <input type="number" value={tokenMaxUses} onChange={(e) => setTokenMaxUses(e.target.value ? Number(e.target.value) : "")} className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none placeholder:text-zinc-800" placeholder="∞" />
                                        </div>
                                        <div className="flex items-end">
                                            <button onClick={handleGenerateToken} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-[11px] font-bold transition">Provision</button>
                                        </div>
                                    </div>

                                    {newlyGeneratedToken && (
                                        <div className="mb-6 bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl flex flex-col gap-4">
                                            <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">New Deployment Token</p>
                                            <div className="flex gap-2">
                                                <input type="text" readOnly value={newlyGeneratedToken} className="flex-1 bg-black/50 border border-blue-500/20 text-zinc-50 font-mono text-[10px] px-3 py-2 rounded focus:outline-none select-all" />
                                                <button onClick={() => copyToClipboard(newlyGeneratedToken)} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-4 py-2 rounded transition">Copy</button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                        {tokens.map(t => {
                                            const status = getTokenStatus(t);
                                            return (
                                                <div key={t.token_id} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg p-3 group">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-mono text-zinc-400">{t.token_id.substring(0, 16)}...</span>
                                                        <span className="text-[9px] text-zinc-600 mt-0.5">Used: {t.uses_count}/{t.max_uses || '∞'} | {status}</span>
                                                    </div>
                                                    <button onClick={() => handleRevokeToken(t.token_id)} className="text-[9px] font-black text-red-400/50 hover:text-red-400 uppercase tracking-widest transition opacity-0 group-hover:opacity-100">Revoke</button>
                                                </div>
                                            )
                                        })}
                                        {tokens.length === 0 && <p className="text-[10px] text-zinc-700 italic">No active tokens found.</p>}
                                    </div>
                                </div>

                                {/* Devices Card */}
                                <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-sm">
                                    <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-6 text-[#71717a]">Agent Constellation</h4>
                                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                                        {devices.map(d => {
                                            const status = getDeviceStatus(d);
                                            return (
                                                <div key={d.device_id} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg p-3 group text-left">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-bold text-zinc-100">{d.device_name || 'Unnamed Agent'}</span>
                                                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest">{d.os_type} — v{d.agent_version}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${status === 'Active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`} />
                                                        <button onClick={() => handleRevokeDevice(d.device_id)} className="text-[9px] font-black text-red-400/50 hover:text-red-400 uppercase tracking-widest transition opacity-0 group-hover:opacity-100">Revoke</button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {devices.length === 0 && <p className="text-[10px] text-zinc-700 italic">No agents enrolled.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal remains same logic, just refined styles */}
            {selectedReport && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
                    <div className="bg-[#121214] border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between p-7 border-b border-white/5 text-left">
                            <div>
                                <h3 className="font-black text-2xl text-zinc-50 tracking-tight">Audit Insight Report</h3>
                                <p className="text-[10px] text-zinc-500 mt-2 font-bold uppercase tracking-[0.2em]">{new Date(selectedReport.timestamp).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setSelectedReport(null)} className="text-zinc-500 hover:text-white p-2 bg-white/5 rounded-full transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar text-left">
                            <div className="grid grid-cols-4 gap-6">
                                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                                    <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-2">Posture</p>
                                    <p className={`text-lg font-black ${selectedReport.overallStatus === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'}`}>{selectedReport.overallStatus}</p>
                                </div>
                                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl text-center">
                                    <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-2">Enforcement Score</p>
                                    <p className="text-2xl font-black text-white">{selectedReport.enforcementScore}/100</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em]">Enforcement Findings</h4>
                                <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-white/[0.03] border-b border-white/5">
                                            <tr>
                                                <th className="p-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">Validation Target</th>
                                                <th className="p-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">Criticallity</th>
                                                <th className="p-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">Status</th>
                                                <th className="p-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">Observations</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 text-zinc-400">
                                            {selectedReport.findings.map((f: any, i: number) => (
                                                <tr key={i} className="hover:bg-white/[0.02] transition">
                                                    <td className="p-4 font-bold text-zinc-200">{f.test}</td>
                                                    <td className="p-4 font-black text-[10px] uppercase tracking-widest">{f.severity}</td>
                                                    <td className={`p-4 font-black ${f.result === 'PASS' ? 'text-emerald-500' : f.result === 'FAIL' ? 'text-red-500' : 'text-zinc-600'}`}>{f.result}</td>
                                                    <td className="p-4 text-[11px] italic font-medium">{f.notes}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
