"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useUserSettings } from "@/lib/hooks/use-user-settings";

/* ═══════════════════════════════════════════════════════════════
   Types (kept for agent/setup status — not user settings)
   ═══════════════════════════════════════════════════════════════ */

interface AgentStatus {
    connected: boolean;
    last_seen: string | null;
    hostname: string | null;
    minutes_ago: number;
}

interface SetupStatus {
    interface: string;
    proxy_configured: boolean;
    proxy_enabled: boolean;
    proxy_server: string;
    proxy_port: string;
    ca_trusted: boolean;
    ca_exists: boolean;
    proxy_server_running: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   Toggle Component
   ═══════════════════════════════════════════════════════════════ */

function Toggle({
    enabled,
    onChange,
    label,
    description,
    warning,
}: {
    enabled: boolean;
    onChange: (val: boolean) => void;
    label: string;
    description: string;
    warning?: string;
}) {
    return (
        <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 last:border-0">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                {warning && enabled && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        {warning}
                    </p>
                )}
            </div>
            <button
                role="switch"
                aria-checked={enabled}
                onClick={() => onChange(!enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${enabled ? "bg-brand-600" : "bg-gray-200"
                    }`}
            >
                <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                />
            </button>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Status Indicator
   ═══════════════════════════════════════════════════════════════ */

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className={`flex h-2.5 w-2.5 rounded-full ${ok ? "bg-green-500" : "bg-gray-300"}`}>
                {ok && <span className="animate-ping absolute h-2.5 w-2.5 rounded-full bg-green-400 opacity-75" />}
            </span>
            <span className={`text-xs ${ok ? "text-green-700 font-medium" : "text-gray-500"}`}>{label}</span>
        </div>
    );
}

// Detect if running on Vercel (cloud) vs. localhost
function isCloudDeployment(): boolean {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return !host.includes("localhost") && !host.includes("127.0.0.1");
}

/* ═══════════════════════════════════════════════════════════════
   Main Settings Page
   ═══════════════════════════════════════════════════════════════ */

export default function SettingsPage() {
    // ── Firestore-backed user settings (realtime sync) ──────────
    const { settings, loading, error: settingsError, saveSettings, user } = useUserSettings();

    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
    const [setupLoading, setSetupLoading] = useState<string | null>(null);
    const [setupMessage, setSetupMessage] = useState<{ type: "success" | "error" | "info"; text: string; command?: string } | null>(null);
    const [isCloud, setIsCloud] = useState(false);
    const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
    const [mounted, setMounted] = useState(false);
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsCloud(isCloudDeployment());
    }, []);

    useEffect(() => {
        if (loading && mounted) {
            const timer = setTimeout(() => {
                setTimedOut(true);
                setError("Settings fetch timed out. Proxy may be blocking the connection.");
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [loading, mounted]);

    useEffect(() => {
        if (settingsError) setError(settingsError);
    }, [settingsError]);

    const checkAgentStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/agent/heartbeat");
            if (res.ok) {
                const data = await res.json();
                setAgentStatus(data);
            }
        } catch { /* silent */ }
    }, []);

    const checkSetupStatus = useCallback(async () => {
        if (isCloud) return;
        try {
            const res = await fetch("/api/proxy/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "check-status" }),
            });
            if (res.ok) {
                const data = await res.json();
                setSetupStatus(data);
            }
        } catch { /* silent */ }
    }, [isCloud]);

    useEffect(() => {
        checkAgentStatus();
        if (!isCloud) checkSetupStatus();
    }, [checkSetupStatus, checkAgentStatus, isCloud]);

    useEffect(() => {
        const interval = setInterval(() => {
            checkAgentStatus();
            if (!isCloud) checkSetupStatus();
        }, 5000);
        return () => clearInterval(interval);
    }, [checkAgentStatus, checkSetupStatus, isCloud]);

    // ── Save handler: Bridge sync between User Settings & Proxy Agent ──
    async function handleSave(partial: Partial<typeof settings>) {
        setError("");
        try {
            // 1. Save to Firestore (Realtime UI logic)
            await saveSettings(partial);

            // 2. Map to Proxy Backend (snake_case)
            const proxyMap: Record<string, any> = {};
            if ("proxyEnabled" in partial) proxyMap.proxy_enabled = partial.proxyEnabled;
            if ("fullAuditMode" in partial) proxyMap.full_audit_mode = partial.fullAuditMode;
            if ("blockHighRisk" in partial) proxyMap.block_high_risk = partial.blockHighRisk;
            if ("riskThreshold" in partial) proxyMap.risk_threshold = partial.riskThreshold;
            if ("redactSensitive" in partial) proxyMap.redact_sensitive = partial.redactSensitive;
            if ("alertOnViolations" in partial) proxyMap.alert_on_violations = partial.alertOnViolations;
            if ("desktopBypass" in partial) proxyMap.desktop_bypass = partial.desktopBypass;
            if ("retentionDays" in partial) proxyMap.retention_days = partial.retentionDays;
            if ("inspectAttachments" in partial) proxyMap.inspect_attachments = partial.inspectAttachments;

            // 3. Push to Local Agent API (The "Sync Bridge")
            if (Object.keys(proxyMap).length > 0) {
                const res = await fetch("/api/proxy/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...proxyMap, workspaceId: user?.uid || "default" }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    if (data.code === "SYSTEM_PROXY_FAILURE") {
                        throw new Error(data.error || "Failed to update system proxy. Check permissions.");
                    }
                    throw new Error(data.error || "Failed to sync to local agent.");
                }
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err: any) {
            console.error("[settings] Sync failure:", err);
            if (err.message && err.message.includes("permissions")) {
                setError("Failed to update system proxy. Check permissions.");
            } else {
                setError(err.message || "Settings saved to cloud, but failed to sync to local agent.");
            }
        }
    }

    async function runSetupAction(action: string) {
        setSetupLoading(action);
        setSetupMessage(null);
        try {
            const res = await fetch("/api/proxy/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (data.needs_sudo) {
                setSetupMessage({ type: "info", text: data.message, command: data.command });
            } else if (data.success || res.ok) {
                setSetupMessage({ type: "success", text: data.message || "Done!" });
                await checkSetupStatus();
            } else {
                setSetupMessage({ type: "error", text: data.error || data.message || "Failed" });
            }
        } catch {
            setSetupMessage({ type: "error", text: "Failed to connect to setup API" });
        } finally {
            setSetupLoading(null);
        }
    }

    if ((loading && !timedOut) || !mounted) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <div className="relative flex h-16 w-16 items-center justify-center mx-auto">
                        <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
                    </div>
                    <p className="mt-4 text-sm text-gray-500">Loading settings...</p>
                </div>
            </div>
        );
    }

    const allReady = setupStatus?.proxy_server_running && setupStatus?.ca_trusted && setupStatus?.proxy_configured;

    return (
        <div className="mx-auto max-w-2xl space-y-8">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-white/90">Governance Settings</h1>
                <p className="mt-1 text-sm text-white/60">
                    Control how AI traffic is monitored, classified, and enforced across your organization.
                </p>
            </div>

            {/* Notification Banners */}
            {saved && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Settings updated successfully.
                </div>
            )}
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                </div>
            )}

            {/* 1. AI Monitoring Controls (Primary Section) */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-gray-900">AI Monitoring Controls</h2>
                        <p className="text-xs text-gray-500">Master controls for AI governance and visibility</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <Toggle
                        enabled={settings.proxyEnabled}
                        onChange={(val) => handleSave({ proxyEnabled: val })}
                        label="Enable AI Monitoring"
                        description="Route AI traffic through the Complyze engine for risk analysis."
                    />
                    <Toggle
                        enabled={settings.blockHighRisk}
                        onChange={(val) => handleSave({ blockHighRisk: val })}
                        label="Block High Risk Prompts"
                        description="Automatically prevent prompts with high risk scores from being sent to AI providers."
                        warning="This may intercept and block valid user requests if threshold is too low."
                    />
                    <Toggle
                        enabled={settings.inspectAttachments}
                        onChange={(val) => handleSave({ inspectAttachments: val })}
                        label="Scan Attachments"
                        description="Deep scan file uploads and documents for sensitive data leakage."
                    />
                    <Toggle
                        enabled={settings.userAttributionEnabled}
                        onChange={(val) => handleSave({ userAttributionEnabled: val })}
                        label="User Attribution"
                        description="Link intercepted events to specific user identities for audit trails."
                    />

                    {/* Risk Posture Selector */}
                    <div className="py-6 border-t border-gray-100 mt-2">
                        <div className="flex justify-between items-end mb-4">
                            <div>
                                <p className="text-sm font-semibold text-gray-800">Risk Posture</p>
                                <p className="text-xs text-gray-500 mt-0.5">Define your organization's tolerance for AI risk.</p>
                            </div>
                        </div>

                        {/* Posture Segments */}
                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {[
                                { id: "minimal", label: "Minimal", val: 80 },
                                { id: "balanced", label: "Balanced", val: 50 },
                                { id: "strict", label: "Strict", val: 35 },
                                { id: "maximum", label: "Maximum", val: 20 }
                            ].map((option) => {
                                // Determine active state based on proximity to threshold
                                // We find the closest option to the current numeric setting
                                const currentVal = settings.riskThreshold;
                                const isActive =
                                    (option.id === "minimal" && currentVal >= 65) ||
                                    (option.id === "balanced" && currentVal >= 45 && currentVal < 65) ||
                                    (option.id === "strict" && currentVal >= 25 && currentVal < 45) ||
                                    (option.id === "maximum" && currentVal < 25);

                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => handleSave({ riskThreshold: option.val })}
                                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-all duration-150 border ${isActive
                                                ? "bg-brand-50 border-brand-200 text-brand-700 shadow-sm ring-1 ring-brand-200"
                                                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Dynamic Description */}
                        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 border border-gray-100 transition-all duration-200 min-h-[60px] flex flex-col justify-center">
                            {(() => {
                                const val = settings.riskThreshold;
                                let title = "";
                                let desc = "";

                                if (val >= 65) {
                                    title = "Minimal Posture";
                                    desc = "Only blocks clearly malicious or critical violations. Prioritizes workflow continuity.";
                                } else if (val >= 45) {
                                    title = "Balanced Posture (Default)";
                                    desc = "Blocks high-risk prompts involving sensitive data while minimizing false positives.";
                                } else if (val >= 25) {
                                    title = "Strict Posture";
                                    desc = "Blocks moderate and high-risk prompts to reduce accidental data exposure.";
                                } else {
                                    title = "Maximum Posture";
                                    desc = "Blocks all medium-to-high risk activity. Designed for high-security environments.";
                                }

                                return (
                                    <>
                                        <p className="font-semibold text-gray-900 mb-1">{title}</p>
                                        <p className="text-gray-500 leading-relaxed">{desc}</p>
                                    </>
                                );
                            })()}
                        </div>

                        <div className="mt-3 flex items-center justify-end px-1">
                            <p className="text-[10px] uppercase tracking-wider font-medium text-gray-400">
                                Numeric Threshold: <span className="font-mono text-gray-600">{settings.riskThreshold}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Divider */}
            <hr className="border-gray-100" />

            {/* 3. Monitoring Agent Deployment */}
            <div className="card">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Local Monitoring Agent</h2>
                            <p className="text-xs text-gray-500">The lightweight agent that handles local traffic interception</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${agentStatus?.connected ? "bg-green-500" : "bg-gray-300"}`} />
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-tight">
                            {agentStatus?.connected ? "INSTALLED" : "NOT INSTALLED"}
                        </span>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 mb-6">
                    <p className="text-sm text-gray-700 leading-relaxed">
                        To enable deep inspection on this device, the Complyze Agent must be running. It automatically configures system proxy settings to ensure all AI interactions are governed.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <a
                        href="/api/agent/installer"
                        className="flex-1 btn-primary py-3 px-4 flex items-center justify-center gap-2"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        {agentStatus?.connected ? "Reinstall Agent" : "Deploy Monitoring Agent"}
                    </a>
                    {!isCloud && (
                        <button
                            onClick={checkSetupStatus}
                            disabled={setupLoading === "check-status"}
                            className="btn-secondary py-3 px-4 flex items-center justify-center gap-2"
                        >
                            <svg className={`h-4 w-4 ${setupLoading === "check-status" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            Check Connection
                        </button>
                    )}
                </div>

                {agentStatus?.connected && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                        <div className="flex items-center gap-4">
                            <span>Host: <strong>{agentStatus.hostname}</strong></span>
                            <span>Seen: <strong>{agentStatus.minutes_ago === 0 ? "Just now" : `${agentStatus.minutes_ago}m ago`}</strong></span>
                        </div>
                        <span className="text-gray-300">v1.2.0</span>
                    </div>
                )}
            </div>

            {/* 4. Divider */}
            <hr className="border-gray-100" />

            {/* 5. Advanced Settings */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Advanced Governance</h2>
                        <p className="text-xs text-gray-500">Fine-grained configuration and data policies</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <Toggle
                        enabled={settings.redactSensitive}
                        onChange={(val) => handleSave({ redactSensitive: val })}
                        label="Auto-Redaction"
                        description="Sanitize PII and credentials before they leave the browser."
                    />
                    <Toggle
                        enabled={settings.fullAuditMode}
                        onChange={(val) => handleSave({ fullAuditMode: val })}
                        label="Full Audit Mode"
                        description="Store complete prompt and response bodies for regulatory compliance."
                        warning="Significantly increases stored data volume and sensitivity."
                    />
                    <Toggle
                        enabled={settings.desktopBypass}
                        onChange={(val) => handleSave({ desktopBypass: val })}
                        label="Desktop App Bypass"
                        description="Allow native desktop apps with pinned certificates to skip deep inspection."
                    />

                    <div className="py-6 border-t border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Retention Period</p>
                            <p className="text-xs text-gray-500 mt-0.5">Duration for storing audit logs before auto-purging.</p>
                        </div>
                        <select
                            value={settings.retentionDays}
                            onChange={(e) => handleSave({ retentionDays: parseInt(e.target.value, 10) })}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                            {[30, 90, 180, 365].map((d) => (
                                <option key={d} value={d}>{d} Days</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center py-10 opacity-40">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-gray-400 rounded flex items-center justify-center text-white">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                    </div>
                    <span className="text-xs font-bold tracking-widest uppercase">Complyze Enterprise</span>
                </div>
            </div>

            {/* Setup Messages Popup */}
            {setupMessage && (
                <div className={`fixed bottom-8 right-8 z-50 rounded-2xl border p-5 shadow-2xl max-w-sm animate-in slide-in-from-bottom-4 ${setupMessage.type === "success" ? "border-green-200 bg-white" : "border-blue-200 bg-white"}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2 h-2 rounded-full ${setupMessage.type === "success" ? "bg-green-500" : "bg-blue-500"}`} />
                        <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">{setupMessage.type === "success" ? "Action Complete" : "System Message"}</p>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed font-medium">{setupMessage.text}</p>
                    {setupMessage.command && (
                        <div className="mt-3 p-2 bg-gray-50 rounded-lg text-[10px] font-mono break-all border border-gray-100 text-indigo-600">
                            {setupMessage.command}
                        </div>
                    )}
                    <button
                        onClick={() => setSetupMessage(null)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
