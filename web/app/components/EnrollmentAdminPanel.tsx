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
        <section className="mt-8 bg-white/[0.03] border border-white/20 rounded-2xl p-8 shadow-[0_0_25px_rgba(255,255,255,0.05)] backdrop-blur-md">
            <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-wider">
                Enrollment & Organization Governance
            </h3>

            <div className="flex gap-8">
                {/* Left Side: Orgs */}
                <div className="w-1/3 border-r border-white/10 pr-6">
                    <h4 className="font-bold text-white/70 mb-4 uppercase text-xs tracking-widest">Active Organizations</h4>
                    <div className="flex gap-2 mb-4 whitespace-nowrap">
                        <input
                            type="text"
                            placeholder="Org Name"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            className="bg-black/20 border border-white/10 rounded px-3 py-1 text-sm text-white w-full"
                        />
                        <button onClick={handleCreateOrg} className="bg-blue-600 hover:bg-blue-500 rounded px-3 py-1 text-xs font-bold transition">
                            Create
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        {orgs.map((org) => (
                            <button
                                key={org.org_id}
                                onClick={() => selectOrg(org)}
                                className={`text-left px-3 py-2 rounded text-sm transition ${selectedOrg?.org_id === org.org_id ? 'bg-white/10 text-white font-bold' : 'text-white/60 hover:bg-white/5'}`}
                            >
                                {org.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Side: details */}
                <div className="w-2/3 pl-2 flex flex-col gap-6">
                    {!selectedOrg ? (
                        <p className="text-white/40 text-sm">Select or create an organization to manage policies and tokens.</p>
                    ) : (
                        <>
                            {/* Org Info */}
                            <div className="bg-black/20 border border-white/5 rounded-lg p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-lg text-white">
                                            {selectedOrg.name}
                                            <span className="text-xs ml-3 text-white/40 font-normal">
                                                Created: {new Date(selectedOrg.created_at).toLocaleDateString()}
                                            </span>
                                        </h4>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Organization ID:</span>
                                            <span className="text-xs font-mono text-white/80 bg-white/5 px-2 py-0.5 rounded border border-white/10 select-all">
                                                {selectedOrg.org_id}
                                            </span>
                                            <button onClick={() => copyToClipboard(selectedOrg.org_id)} className="text-[10px] bg-white/10 hover:bg-white/20 text-white/80 px-2 py-0.5 rounded transition">
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                    <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full font-bold">
                                        v{selectedOrg.policy_version}
                                    </span>
                                </div>
                            </div>

                            {/* Policy */}
                            <div className="bg-black/20 border border-white/5 rounded-lg p-5">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-sm text-white/80 uppercase tracking-wider">Policy Configuration Tracker</h4>
                                </div>
                                <textarea
                                    className={`w-full bg-black/40 border rounded p-3 text-sm font-mono text-white/80 mb-2 h-44 ${policyError ? 'border-red-500/50' : 'border-white/10'}`}
                                    value={policyJson}
                                    onChange={(e) => setPolicyJson(e.target.value)}
                                />
                                {policyError && (
                                    <p className="text-red-400 text-xs font-bold mb-3">{policyError}</p>
                                )}
                                <div className="flex justify-end mt-1">
                                    <button onClick={handleUpdatePolicy} className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-1.5 text-xs font-bold transition">
                                        Validate & Save Policy
                                    </button>
                                </div>
                            </div>

                            {/* Tokens */}
                            <div className="bg-black/20 border border-white/5 rounded-lg p-5">
                                <h4 className="font-bold text-sm text-white/80 uppercase tracking-wider mb-4">Enrollment Tokens</h4>

                                <div className="flex gap-2 mb-4 items-center">
                                    <span className="text-xs text-white/50">Expire (hrs):</span>
                                    <input type="number" value={tokenExpiresIn} onChange={(e) => setTokenExpiresIn(Number(e.target.value))} className="bg-black/40 border border-white/10 rounded w-16 px-2 py-1 text-sm text-white" />
                                    <span className="text-xs text-white/50 ml-2">Max Uses:</span>
                                    <input type="number" placeholder="unlimited" value={tokenMaxUses} onChange={(e) => setTokenMaxUses(e.target.value ? Number(e.target.value) : "")} className="bg-black/40 border border-white/10 rounded w-20 px-2 py-1 text-sm text-white" />
                                    <button onClick={handleGenerateToken} className="ml-2 bg-indigo-600 hover:bg-indigo-500 rounded px-4 py-1.5 text-xs font-bold transition">
                                        Generate Token
                                    </button>
                                </div>

                                {newlyGeneratedToken && (
                                    <div className="mb-4 bg-orange-500/10 border border-orange-500/30 p-4 rounded flex flex-col gap-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-orange-300 text-xs font-bold uppercase tracking-widest">⚠️ This token will not be shown again</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <input type="text" readOnly value={newlyGeneratedToken} className="flex-1 bg-black/50 border border-orange-500/20 text-white font-mono text-sm px-3 py-2 rounded select-all" />
                                            <button onClick={() => copyToClipboard(newlyGeneratedToken)} className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded transition">Copy Token</button>
                                        </div>

                                        <div className="bg-black/40 border border-white/5 rounded p-3 mt-1">
                                            <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-2">CLI Deployment Instructions</p>

                                            <div className="flex flex-col gap-3">
                                                <div>
                                                    <div className="flex justify-between items-end mb-1">
                                                        <span className="text-[10px] text-white/70">Production Environment</span>
                                                        <button
                                                            onClick={() => copyToClipboard(`node cli-agent.mjs --enroll-token ${newlyGeneratedToken} --env production --reset`)}
                                                            className="text-[9px] text-orange-300 hover:text-orange-200 uppercase tracking-widest font-bold select-none cursor-pointer"
                                                        >
                                                            Copy Command
                                                        </button>
                                                    </div>
                                                    <code className="block bg-black/60 border border-white/10 text-emerald-400 font-mono text-[11px] p-2 rounded break-all select-all">
                                                        node cli-agent.mjs --enroll-token {newlyGeneratedToken} --env production
                                                    </code>
                                                </div>

                                                <div>
                                                    <div className="flex justify-between items-end mb-1">
                                                        <span className="text-[10px] text-white/70">Local Development Environment</span>
                                                        <button
                                                            onClick={() => copyToClipboard(`node cli-agent.mjs --enroll-token ${newlyGeneratedToken} --env local --reset`)}
                                                            className="text-[9px] text-orange-300 hover:text-orange-200 uppercase tracking-widest font-bold select-none cursor-pointer"
                                                        >
                                                            Copy Command
                                                        </button>
                                                    </div>
                                                    <code className="block bg-black/60 border border-white/10 text-emerald-400 font-mono text-[11px] p-2 rounded break-all select-all">
                                                        node cli-agent.mjs --enroll-token {newlyGeneratedToken} --env local
                                                    </code>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2">
                                    {tokens.map(t => {
                                        const status = getTokenStatus(t);
                                        return (
                                            <div key={t.token_id} className="flex justify-between items-center bg-white/5 rounded p-3 text-xs">
                                                <div className="flex flex-col gap-1 w-full">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono text-white/80 text-[11px] bg-black/40 px-2 py-0.5 rounded">ID: {t.token_id}</span>
                                                        <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-widest ${status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                            {status}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-[10px] text-white/40">Created: {new Date(t.created_at).toLocaleDateString()} | Expires: {new Date(t.expires_at).toLocaleDateString()}</span>
                                                        <span className="text-[10px] text-white/40">Uses: {t.uses_count} / {t.max_uses ?? '∞'}</span>
                                                    </div>
                                                </div>
                                                {status === 'Active' && (
                                                    <button onClick={() => handleRevokeToken(t.token_id)} className="ml-4 text-red-400 hover:text-red-300 font-bold border border-red-500/20 px-3 py-1.5 rounded transition bg-red-500/5 hover:bg-red-500/10 whitespace-nowrap">Revoke</button>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {tokens.length === 0 && <span className="text-xs text-white/30">No tokens found.</span>}
                                </div>
                            </div>

                            {/* Devices */}
                            <div className="bg-black/20 border border-white/5 rounded-lg p-5">
                                <h4 className="font-bold text-sm text-white/80 uppercase tracking-wider mb-4">Enrolled Devices</h4>
                                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2">
                                    {devices.map(d => {
                                        const status = getDeviceStatus(d);
                                        return (
                                            <div key={d.device_id} className="flex justify-between items-center bg-white/5 rounded p-3 text-xs">
                                                <div className="flex flex-col gap-1 w-full">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-bold text-white/90">
                                                            {d.device_name || 'Unnamed Device'}
                                                            <span className="font-normal text-white/40 font-mono ml-2">({d.device_id})</span>
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-widest ${status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : status === 'Offline' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                                                            {status}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-[10px] text-white/40">OS: {d.os_type} | Agent: v{d.agent_version}</span>
                                                        <span className="text-[10px] text-white/40">Last Heartbeat: {new Date(d.last_heartbeat).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                {status !== 'Revoked' && (
                                                    <button onClick={() => handleRevokeDevice(d.device_id)} className="ml-4 text-red-400 hover:text-red-300 font-bold border border-red-500/20 px-3 py-1.5 rounded transition bg-red-500/5 hover:bg-red-500/10 whitespace-nowrap">Revoke</button>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {devices.length === 0 && <span className="text-xs text-white/30">No active devices.</span>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}
