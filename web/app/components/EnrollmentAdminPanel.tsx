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

    useEffect(() => {
        fetchOrgs();
    }, [workspaceId]);

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

    return (
        <section className="bg-transparent">
            <div className="flex gap-8">
                {/* Left Side: Orgs */}
                <div className="w-[280px] shrink-0 border-r border-zinc-800 pr-6">
                    <h4 className="font-bold text-zinc-400 mb-4 uppercase text-[10px] tracking-widest">Active Organizations</h4>
                    <div className="flex gap-2 mb-4 whitespace-nowrap">
                        <input
                            type="text"
                            placeholder="Org Name"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            className="bg-black border border-zinc-800 rounded-md px-3 py-1.5 text-sm text-zinc-50 w-full placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                        />
                        <button onClick={handleCreateOrg} className="bg-zinc-100 hover:bg-white text-zinc-900 rounded-md px-3 py-1.5 text-xs font-bold transition">
                            Create
                        </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        {orgs.map((org) => (
                            <button
                                key={org.org_id}
                                onClick={() => selectOrg(org)}
                                className={`text-left px-3 py-2.5 rounded-md text-sm transition font-medium ${selectedOrg?.org_id === org.org_id ? 'bg-[#18181b] border border-[#27272a] text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'}`}
                            >
                                {org.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Side: details */}
                <div className="flex-1 flex flex-col gap-6">
                    {!selectedOrg ? (
                        <p className="text-zinc-500 text-sm mt-4">Select or create an organization to manage policies and tokens.</p>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {/* Org Info */}
                            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-lg text-zinc-50">
                                            {selectedOrg.name}
                                            <span className="text-xs ml-3 text-zinc-500 font-normal tracking-wide">
                                                Created: {new Date(selectedOrg.created_at).toLocaleDateString()}
                                            </span>
                                        </h4>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Organization ID:</span>
                                            <span className="text-xs font-mono text-zinc-300 bg-black/50 px-2.5 py-1 rounded border border-zinc-800 select-all">
                                                {selectedOrg.org_id}
                                            </span>
                                            <button onClick={() => copyToClipboard(selectedOrg.org_id)} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1 rounded transition font-medium">
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                    <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3.5 py-1 rounded-full font-bold uppercase tracking-wider">
                                        v{selectedOrg.policy_version}
                                    </span>
                                </div>
                            </div>

                            {/* Grid below Org Info */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                {/* Left Column: Policy */}
                                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 shadow-sm flex flex-col">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-sm text-zinc-300 uppercase tracking-widest">Policy Configuration Tracker</h4>
                                    </div>
                                    <textarea
                                        className={`w-full bg-black/50 border rounded-lg p-3 text-[13px] font-mono leading-relaxed text-zinc-300 mb-2 h-96 focus:outline-none focus:border-zinc-600 ${policyError ? 'border-red-500/50' : 'border-zinc-800'}`}
                                        value={policyJson}
                                        onChange={(e) => setPolicyJson(e.target.value)}
                                        spellCheck={false}
                                    />
                                    {policyError && (
                                        <p className="text-red-400 text-xs font-bold mb-3">{policyError}</p>
                                    )}
                                    <div className="flex justify-end mt-2">
                                        <button onClick={handleUpdatePolicy} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-xs font-bold transition shadow-sm">
                                            Validate & Save Policy
                                        </button>
                                    </div>
                                </div>

                                {/* Right Column: Tokens & Devices */}
                                <div className="flex flex-col gap-6">
                                    {/* Tokens */}
                                    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 shadow-sm">
                                        <h4 className="font-bold text-sm text-zinc-300 uppercase tracking-widest mb-4">Enrollment Tokens</h4>

                                        <div className="flex gap-2 mb-4 items-center">
                                            <span className="text-xs text-zinc-500 font-medium">Expire (hrs):</span>
                                            <input type="number" value={tokenExpiresIn} onChange={(e) => setTokenExpiresIn(Number(e.target.value))} className="bg-black/50 border border-zinc-800 rounded w-16 px-2 py-1 text-sm text-zinc-50 focus:outline-none focus:border-zinc-600" />
                                            <span className="text-xs text-zinc-500 font-medium ml-2">Max Uses:</span>
                                            <input type="number" placeholder="unlimited" value={tokenMaxUses} onChange={(e) => setTokenMaxUses(e.target.value ? Number(e.target.value) : "")} className="bg-black/50 border border-zinc-800 rounded w-20 px-2 py-1 text-sm text-zinc-50 focus:outline-none focus:border-zinc-600 placeholder:text-zinc-600" />
                                            <button onClick={handleGenerateToken} className="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 text-xs font-bold transition">
                                                Generate Token
                                            </button>
                                        </div>

                                        {newlyGeneratedToken && (
                                            <div className="mb-4 bg-orange-500/5 border border-orange-500/20 p-4 rounded-xl flex flex-col gap-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-orange-400 text-[10px] font-bold uppercase tracking-widest">⚠️ This token will not be shown again</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <input type="text" readOnly value={newlyGeneratedToken} className="flex-1 bg-black/50 border border-orange-500/20 text-zinc-50 font-mono text-sm px-3 py-2 rounded focus:outline-none select-all" />
                                                    <button onClick={() => copyToClipboard(newlyGeneratedToken)} className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded transition">Copy Token</button>
                                                </div>

                                                <div className="bg-black/30 border border-zinc-800 rounded-lg p-4 mt-1">
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">CLI Deployment Instructions</p>

                                                    <div className="flex flex-col gap-4">
                                                        <div>
                                                            <div className="flex justify-between items-end mb-1.5">
                                                                <span className="text-[10px] text-zinc-400 font-medium">Production Environment</span>
                                                                <button
                                                                    onClick={() => copyToClipboard(`node cli-agent.mjs --enroll-token ${newlyGeneratedToken} --env production --reset`)}
                                                                    className="text-[9px] text-orange-400 hover:text-orange-300 uppercase tracking-widest font-bold select-none cursor-pointer"
                                                                >
                                                                    Copy Command
                                                                </button>
                                                            </div>
                                                            <code className="block bg-black/80 border border-zinc-800/50 text-emerald-400 font-mono text-[11px] p-2.5 rounded-lg break-all select-all">
                                                                node cli-agent.mjs --enroll-token {newlyGeneratedToken} --env production --reset
                                                            </code>
                                                        </div>

                                                        <div>
                                                            <div className="flex justify-between items-end mb-1.5">
                                                                <span className="text-[10px] text-zinc-400 font-medium">Local Development Environment</span>
                                                                <button
                                                                    onClick={() => copyToClipboard(`node cli-agent.mjs --enroll-token ${newlyGeneratedToken} --env local --reset`)}
                                                                    className="text-[9px] text-emerald-400 hover:text-emerald-300 uppercase tracking-widest font-bold select-none cursor-pointer"
                                                                >
                                                                    Copy Command
                                                                </button>
                                                            </div>
                                                            <code className="block bg-black/80 border border-zinc-800/50 text-emerald-400 font-mono text-[11px] p-2.5 rounded-lg break-all select-all">
                                                                node cli-agent.mjs --enroll-token {newlyGeneratedToken} --env local --reset
                                                            </code>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto pr-1">
                                            {tokens.map(t => {
                                                const status = getTokenStatus(t);
                                                return (
                                                    <div key={t.token_id} className="flex justify-between items-center bg-black/20 border border-[#27272a] hover:bg-black/40 transition-colors rounded-lg p-3.5 text-xs group">
                                                        <div className="flex flex-col gap-1.5 w-full">
                                                            <div className="flex justify-between items-center pr-2">
                                                                <span className="font-mono text-zinc-500 text-[11px] select-all">ID: {t.token_id}</span>
                                                                <span className={`px-2.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-widest ${status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                                    {status}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center mt-0.5">
                                                                <span className="text-[10px] text-zinc-500">Created: {new Date(t.created_at).toLocaleDateString()} | Expires: {new Date(t.expires_at).toLocaleDateString()}</span>
                                                                <span className="text-[10px] text-zinc-500 pr-2">Uses: {t.uses_count} / {t.max_uses ?? '∞'}</span>
                                                            </div>
                                                        </div>
                                                        {status === 'Active' && (
                                                            <button onClick={() => handleRevokeToken(t.token_id)} className="ml-2 text-red-400 hover:text-red-300 font-bold border border-red-500/20 px-3.5 py-1.5 rounded-md transition bg-red-500/5 hover:bg-red-500/10 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100">Revoke</button>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                            {tokens.length === 0 && <span className="text-xs text-zinc-600 font-medium py-2">No tokens found.</span>}
                                        </div>
                                    </div>

                                    {/* Devices */}
                                    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 shadow-sm">
                                        <h4 className="font-bold text-sm text-zinc-300 uppercase tracking-widest mb-4">Enrolled Devices</h4>
                                        <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
                                            {devices.map(d => {
                                                const status = getDeviceStatus(d);
                                                return (
                                                    <div key={d.device_id} className="flex items-center bg-black/20 border border-[#27272a] hover:bg-black/40 transition-colors rounded-lg p-3.5 text-xs group">
                                                        <div className="flex flex-col gap-1.5 flex-1 w-full min-w-0 pr-4">
                                                            <div className="flex justify-between items-center">
                                                                <span className="font-medium text-zinc-50 truncate">
                                                                    {d.device_name || 'Unnamed Device'}
                                                                    <span className="font-normal text-zinc-500 font-mono text-[10px] ml-2 tracking-tight">({d.device_id})</span>
                                                                </span>
                                                                <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-widest shrink-0 ${status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : status === 'Offline' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                                    {status}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center mt-0.5">
                                                                <span className="text-[10px] text-zinc-500">OS: <span className="text-zinc-400">{d.os_type}</span> | Agent: <span className="text-zinc-400">v{d.agent_version}</span></span>
                                                                <span className="text-[10px] text-zinc-500">Last Heartbeat: {new Date(d.last_heartbeat).toLocaleString()}</span>
                                                            </div>
                                                        </div>

                                                        {status !== 'Revoked' ? (
                                                            <button onClick={() => handleRevokeDevice(d.device_id)} className="shrink-0 text-red-400 hover:text-red-300 font-bold border border-red-500/20 px-3.5 py-1.5 rounded-md transition bg-red-500/5 hover:bg-red-500/10 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                                Revoke
                                                            </button>
                                                        ) : (
                                                            <div className="w-[84px] shrink-0" /> /* Spacer for alignment */
                                                        )}
                                                    </div>
                                                )
                                            })}
                                            {devices.length === 0 && <span className="text-xs text-zinc-600 font-medium py-2">No active devices.</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
