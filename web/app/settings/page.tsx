"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface ProxySettings {
    proxy_enabled: boolean;
    full_audit_mode: boolean;
    block_high_risk: boolean;
    redact_sensitive: boolean;
    alert_on_violations: boolean;
    desktop_bypass: boolean;
    retention_days: number;
    proxy_endpoint: string;
    updated_at: string;
    agent_last_seen?: string;
    agent_hostname?: string;
}

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
    const [settings, setSettings] = useState<ProxySettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
    const [setupLoading, setSetupLoading] = useState<string | null>(null);
    const [setupMessage, setSetupMessage] = useState<{ type: "success" | "error" | "info"; text: string; command?: string } | null>(null);
    const [isCloud, setIsCloud] = useState(false);
    const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
    const initialLoadDone = useRef(false);

    useEffect(() => {
        setIsCloud(isCloudDeployment());
    }, []);

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
        if (!initialLoadDone.current) {
            fetch("/api/proxy/settings")
                .then((r) => r.json())
                .then((data) => {
                    setSettings(data);
                    setLoading(false);
                })
                .catch(() => {
                    setError("Failed to load settings");
                    setLoading(false);
                });
            checkAgentStatus();
            if (!isCloud) checkSetupStatus();
            initialLoadDone.current = true;
        }
    }, [checkSetupStatus, checkAgentStatus, isCloud]);

    useEffect(() => {
        const interval = setInterval(() => {
            checkAgentStatus();
            if (!isCloud) checkSetupStatus();
        }, 5000);
        return () => clearInterval(interval);
    }, [checkAgentStatus, checkSetupStatus, isCloud]);

    async function saveSettings(partial: Partial<ProxySettings>) {
        if (!settings) return;
        const updated = { ...settings, ...partial };
        setSettings(updated);
        setSaving(true);
        setSaved(false);
        setError("");

        try {
            const res = await fetch("/api/proxy/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(partial),
            });
            if (!res.ok) throw new Error("Failed to save");
            const data = await res.json();
            setSettings(data);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            setError("Failed to save settings. Please try again.");
        } finally {
            setSaving(false);
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

    if (loading) {
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

    if (!settings) return null;

    const allReady = setupStatus?.proxy_server_running && setupStatus?.ca_trusted && setupStatus?.proxy_configured;

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Configure AI Proxy Monitoring, data retention, and policy enforcement.
                </p>
            </div>

            {/* Status Banner */}
            {saved && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Settings saved successfully.
                </div>
            )}
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                </div>
            )}

            {/* ── AI Proxy Monitoring ── */}
            <div className="card">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
                        <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-gray-900">AI Proxy Monitoring</h2>
                        <p className="text-xs text-gray-500">
                            Route AI tool traffic through Complyze for classification and risk analysis
                        </p>
                    </div>
                </div>

                <div className="mt-4 space-y-4">
                    {/* Agent Status Card */}
                    <div className={`rounded-xl border p-5 transition-all duration-300 ${agentStatus?.connected ? "border-green-200 bg-green-50/50" : "border-red-100 bg-red-50/30"}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ${agentStatus?.connected ? "bg-green-600" : "bg-red-500"}`}>
                                    {agentStatus?.connected ? (
                                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.3} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303" />
                                        </svg>
                                    ) : (
                                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.3} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                        </svg>
                                    )}
                                    {agentStatus?.connected && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" /></span>}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">
                                        {agentStatus?.connected ? "Management Agent Connected" : "Agent Offline"}
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {agentStatus?.connected ? (
                                            <>Live monitoring active on <strong>{agentStatus.hostname}</strong></>
                                        ) : (
                                            "No active agents detected for this workspace"
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                {agentStatus?.connected ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold text-green-700">
                                        LIVE POD
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold text-red-700 uppercase">
                                        Disconnected
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Deployment Actions */}
                    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Deploy Monitoring Agent</h3>
                                <p className="text-[10px] text-gray-500">Enable deep inspection on your local machine</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-xs text-gray-600 leading-relaxed max-w-md">
                                The lightweight management agent handles WiFi proxy configuration automatically.
                                It intercepts, cleans, and analyzes AI traffic before it reaches providers.
                            </p>

                            <div className="flex items-center gap-4">
                                <a
                                    href="/api/agent/installer"
                                    className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-brand-600 px-6 py-4 text-base font-bold text-white shadow-xl transition-all hover:bg-brand-700 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                    Download & Run Complyze Agent (macOS)
                                </a>
                            </div>

                            <div className="flex items-center gap-6 pt-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">🍏</span>
                                    <div className="text-[10px] text-gray-400 font-medium">
                                        <p>macOS 12+</p>
                                        <p>Intel & Silicon</p>
                                    </div>
                                </div>
                                <div className="h-8 w-px bg-gray-100" />
                                <div className="text-[10px] text-gray-500 italic">
                                    Once downloaded, double-click the <strong>.command</strong> file to start.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Monitored Domains Block */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-semibold text-gray-800 mb-2">Monitored AI Providers</p>
                        <p className="text-[10px] text-gray-500 mb-3">
                            All AI domains are deep-inspected by default. Full prompt and response content is captured for risk analysis.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                "api.openai.com", "api.anthropic.com", "api.cohere.com",
                                "api.mistral.ai", "api.together.ai", "openrouter.ai",
                                "api.perplexity.ai", "api.groq.com", "api.fireworks.ai",
                                "api.replicate.com", "generativelanguage.googleapis.com",
                                "chatgpt.com", "chat.openai.com", "claude.ai"
                            ].map((d) => (
                                <span key={d} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${["chatgpt.com", "chat.openai.com", "claude.ai"].includes(d) && settings.desktop_bypass
                                    ? "bg-amber-50 border border-amber-200 text-amber-700"
                                    : "bg-brand-50 border border-brand-200 text-brand-700"
                                    }`}>
                                    {d}
                                    {["chatgpt.com", "chat.openai.com", "claude.ai"].includes(d) && settings.desktop_bypass && (
                                        <span className="ml-1 text-amber-500">📊</span>
                                    )}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Local Setup Actions (Visible only in local dev) */}
            {!isCloud && setupStatus && (
                <div className="card">
                    <h2 className="text-base font-bold text-gray-900 mb-4">Local Proxy Engine</h2>
                    <div className={`rounded-xl border p-4 mb-4 ${allReady ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-gray-800">System Integration Status</p>
                            <button onClick={checkSetupStatus} className="text-[10px] underline">Refresh</button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <StatusDot ok={!!setupStatus.proxy_server_running} label="Server" />
                            <StatusDot ok={!!setupStatus.ca_trusted} label="CA Trust" />
                            <StatusDot ok={!!setupStatus.proxy_configured} label="Network" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                            <div className="text-xs font-semibold">System Proxy Control</div>
                            <div className="flex gap-2">
                                {!setupStatus.proxy_configured ? (
                                    <button onClick={() => runSetupAction("enable-proxy")} className="btn-primary py-1 px-3 text-[10px]">Enable</button>
                                ) : (
                                    <button onClick={() => runSetupAction("disable-proxy")} className="btn-secondary py-1 px-3 text-[10px] text-red-600">Disable</button>
                                )}
                            </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded text-[11px] font-mono break-all">
                            {setupStatus.interface || "Searching for interface..."}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Policy Controls ── */}
            <div className="card">
                <h2 className="text-base font-bold text-gray-900 mb-2">Policy Controls</h2>
                <p className="text-xs text-gray-500 mb-4">Automated enforcement actions applied to monitored traffic.</p>

                <Toggle
                    enabled={settings.proxy_enabled}
                    onChange={(val) => saveSettings({ proxy_enabled: val })}
                    label="Enable Global AI Monitoring"
                    description="When enabled, all traffic through the Complyze Agents will be classified and logged."
                />

                <Toggle
                    enabled={settings.block_high_risk}
                    onChange={(val) => saveSettings({ block_high_risk: val })}
                    label="Block Critical-Risk Prompts"
                    description="Automatically block any prompt classified as critical sensitivity level."
                    warning="Blocked prompts return an error to the user."
                />
                <Toggle
                    enabled={settings.redact_sensitive}
                    onChange={(val) => saveSettings({ redact_sensitive: val })}
                    label="Redact Sensitive Content"
                    description="Automatically replace detected PII, credentials, and financial data with [REDACTED]."
                />
                <Toggle
                    enabled={settings.alert_on_violations}
                    onChange={(val) => saveSettings({ alert_on_violations: val })}
                    label="Alert on Policy Violations"
                    description="Generate alerts when sensitive data or policy violations are detected."
                />
                <Toggle
                    enabled={settings.desktop_bypass}
                    onChange={(val) => saveSettings({ desktop_bypass: val })}
                    label="Desktop App Bypass"
                    description="Allow certificate-pinned desktop apps (ChatGPT, Claude) to bypass deep inspection."
                    warning="Enabling this creates a monitoring gap. Recommended: OFF."
                />
            </div>

            {/* ── Data & Privacy ── */}
            <div className="card">
                <h2 className="text-base font-bold text-gray-900 mb-2">Data &amp; Privacy</h2>
                <p className="text-xs text-gray-500 mb-4">Controls for data collection, retention, and audit capabilities.</p>

                <Toggle
                    enabled={settings.full_audit_mode}
                    onChange={(val) => saveSettings({ full_audit_mode: val })}
                    label="Full Audit Mode"
                    description="Store full prompt text alongside classification metadata."
                    warning="Increases data sensitivity. Ensure access controls are in place."
                />

                <div className="py-4 last:border-0">
                    <p className="text-sm font-semibold text-gray-800">Data Retention Period</p>
                    <div className="mt-3 flex items-center gap-3">
                        <select
                            value={settings.retention_days}
                            onChange={(e) => saveSettings({ retention_days: parseInt(e.target.value, 10) })}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                            {[30, 60, 90, 180, 365].map((d) => (
                                <option key={d} value={d}>{d} days</option>
                            ))}
                        </select>
                        <span className="text-xs text-gray-400">Activity older than this threshold is purged.</span>
                    </div>
                </div>

                <div className="pt-4 space-y-2">
                    {[
                        { label: "Encrypted Logs", desc: "All activity events are encrypted at rest" },
                        { label: "Salted Prompt Hashes", desc: "Prompts are hashed with unique salt" },
                        { label: "No Model Training", desc: "Captured data is never used for training" },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="text-green-500">✓</span>
                            <span><strong>{item.label}</strong> — {item.desc}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Branding Card */}
            <div className="card bg-gray-900 text-white">
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500">
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold">Usage-Aware Governance</p>
                        <p className="text-[10px] text-gray-400">Not surveillance. Governance.</p>
                    </div>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                    Complyze helps your organization make informed decisions based on actual AI usage, protecting sensitive intellectual property while enabling innovation.
                </p>
            </div>

            {/* Setup Messages */}
            {setupMessage && (
                <div className={`fixed bottom-6 right-6 z-50 rounded-xl border p-4 shadow-2xl max-w-sm ${setupMessage.type === "success" ? "border-green-200 bg-white" : "border-blue-200 bg-white"}`}>
                    <p className="text-xs font-bold text-gray-900 mb-1">{setupMessage.type === "success" ? "Success" : "Notification"}</p>
                    <p className="text-[11px] text-gray-600">{setupMessage.text}</p>
                    {setupMessage.command && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-[10px] font-mono break-all border border-gray-100">
                            {setupMessage.command}
                        </div>
                    )}
                </div>
            )}

            {/* Footer Actions */}
            <div className="flex gap-3">
                <Link href="/monitoring" className="btn-primary flex-1 text-center py-3">View Monitoring Dashboard</Link>
                <Link href="/" className="btn-secondary py-3 px-6">← Home</Link>
            </div>
        </div>
    );
}
