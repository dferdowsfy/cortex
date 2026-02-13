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
    const initialLoadDone = useRef(false);

    const checkSetupStatus = useCallback(async () => {
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
        } catch {
            // Silent fail
        }
    }, []);

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
            checkSetupStatus();
            initialLoadDone.current = true;
        }
    }, [checkSetupStatus]);

    // Poll setup status every 5 seconds when proxy is enabled
    useEffect(() => {
        if (!settings?.proxy_enabled) return;
        const interval = setInterval(checkSetupStatus, 5000);
        return () => clearInterval(interval);
    }, [settings?.proxy_enabled, checkSetupStatus]);

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
                setSetupMessage({
                    type: "info",
                    text: data.message,
                    command: data.command,
                });
            } else if (data.success || res.ok) {
                setSetupMessage({ type: "success", text: data.message || "Done!" });
                // Refresh status
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

                <Toggle
                    enabled={settings.proxy_enabled}
                    onChange={(val) => saveSettings({ proxy_enabled: val })}
                    label="Enable AI Proxy Monitoring"
                    description="When enabled, all AI tool traffic routed through the proxy will be analyzed for sensitive data and policy compliance."
                />

                {settings.proxy_enabled && (
                    <div className="mt-4 space-y-4">
                        {/* System Status */}
                        {setupStatus && (
                            <div className={`rounded-lg border p-4 ${allReady ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <p className={`text-xs font-bold ${allReady ? "text-green-800" : "text-amber-800"}`}>
                                        {allReady ? "✅ All Systems Ready" : "⚙️ Setup Required"}
                                    </p>
                                    <button
                                        onClick={checkSetupStatus}
                                        className="text-[10px] text-gray-500 hover:text-gray-700 underline"
                                    >
                                        Refresh
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="relative">
                                        <StatusDot ok={!!setupStatus.proxy_server_running} label="Proxy Server" />
                                    </div>
                                    <div className="relative">
                                        <StatusDot ok={!!setupStatus.ca_trusted} label="CA Trusted" />
                                    </div>
                                    <div className="relative">
                                        <StatusDot ok={!!setupStatus.proxy_configured} label="System Proxy" />
                                    </div>
                                </div>
                                {setupStatus.interface && (
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        Network: <strong>{setupStatus.interface}</strong>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Setup Message */}
                        {setupMessage && (
                            <div className={`rounded-lg border p-3 text-xs ${setupMessage.type === "success" ? "border-green-200 bg-green-50 text-green-800" :
                                setupMessage.type === "error" ? "border-red-200 bg-red-50 text-red-800" :
                                    "border-blue-200 bg-blue-50 text-blue-800"
                                }`}>
                                <p>{setupMessage.text}</p>
                                {setupMessage.command && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <code className="flex-1 rounded bg-white/80 px-2 py-1 font-mono text-[10px] break-all">
                                            {setupMessage.command}
                                        </code>
                                        <button
                                            className="text-[10px] font-medium underline shrink-0"
                                            onClick={() => {
                                                navigator.clipboard.writeText(setupMessage.command!);
                                            }}
                                        >
                                            Copy
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Quick Setup Actions */}
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                            <p className="text-sm font-bold text-gray-900 mb-3">🚀 Quick Setup</p>
                            <div className="space-y-3">
                                {/* Step 1: Proxy Server */}
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${setupStatus?.proxy_server_running ? "bg-green-100 text-green-700" : "bg-brand-600 text-white"}`}>
                                            {setupStatus?.proxy_server_running ? "✓" : "1"}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-gray-800">Proxy Server</p>
                                            <p className="text-[10px] text-gray-500">
                                                {setupStatus?.proxy_server_running ? "Running on 127.0.0.1:8080" : "Run: npm run proxy"}
                                            </p>
                                        </div>
                                    </div>
                                    {!setupStatus?.proxy_server_running && (
                                        <button
                                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
                                            onClick={() => navigator.clipboard.writeText("cd web && npm run proxy")}
                                        >
                                            Copy Command
                                        </button>
                                    )}
                                </div>

                                {/* Step 2: Trust CA */}
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${setupStatus?.ca_trusted ? "bg-green-100 text-green-700" : "bg-brand-600 text-white"}`}>
                                            {setupStatus?.ca_trusted ? "✓" : "2"}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-gray-800">Trust CA Certificate</p>
                                            <p className="text-[10px] text-gray-500">
                                                {setupStatus?.ca_trusted ? "Complyze CA is trusted" :
                                                    setupStatus?.ca_exists ? "Needs admin password" : "Start proxy first to generate CA"}
                                            </p>
                                        </div>
                                    </div>
                                    {!setupStatus?.ca_trusted && setupStatus?.ca_exists && (
                                        <button
                                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
                                            onClick={() => navigator.clipboard.writeText("cd web && sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca-cert.pem")}
                                        >
                                            Copy Command
                                        </button>
                                    )}
                                </div>

                                {/* Step 3: System Proxy */}
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${setupStatus?.proxy_configured ? "bg-green-100 text-green-700" : "bg-brand-600 text-white"}`}>
                                            {setupStatus?.proxy_configured ? "✓" : "3"}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-gray-800">System HTTPS Proxy</p>
                                            <p className="text-[10px] text-gray-500">
                                                {setupStatus?.proxy_configured
                                                    ? `Connected via ${setupStatus.interface}`
                                                    : `Route ${setupStatus?.interface || "Wi-Fi"} traffic through proxy`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {!setupStatus?.proxy_configured ? (
                                            <button
                                                onClick={() => runSetupAction("enable-proxy")}
                                                disabled={setupLoading === "enable-proxy"}
                                                className="rounded-md bg-brand-600 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                                            >
                                                {setupLoading === "enable-proxy" ? "Enabling..." : "Enable Proxy"}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => runSetupAction("disable-proxy")}
                                                disabled={setupLoading === "disable-proxy"}
                                                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-[10px] font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                                            >
                                                {setupLoading === "disable-proxy" ? "Disabling..." : "Disable Proxy"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Proxy Address */}
                        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                            <p className="text-xs font-semibold text-brand-800 mb-1">Local Proxy Address</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm text-brand-700 border border-brand-200">
                                    127.0.0.1:8080
                                </code>
                                <button
                                    className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 transition-colors"
                                    onClick={() => navigator.clipboard.writeText("127.0.0.1:8080")}
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Monitored Domains */}
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                            <p className="text-xs font-semibold text-gray-800 mb-2">Monitored AI Providers</p>
                            <p className="text-[10px] text-gray-500 mb-3">
                                All AI domains are deep-inspected by default. Full prompt and response content is captured for risk analysis.
                            </p>

                            {/* All AI Domains */}
                            <div className="mb-3">
                                <p className="text-[10px] font-medium text-brand-700 mb-1.5 flex items-center gap-1">
                                    <span>🔍</span> Deep Inspection (all AI traffic)
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

                            {/* Desktop Bypass Notice */}
                            {settings.desktop_bypass && (
                                <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 mt-2">
                                    <p className="text-[10px] font-medium text-amber-800 flex items-center gap-1 mb-1">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                        </svg>
                                        Desktop App Bypass Active
                                    </p>
                                    <p className="text-[10px] text-amber-700">
                                        <strong>chatgpt.com</strong>, <strong>chat.openai.com</strong>, and <strong>claude.ai</strong> are
                                        using metadata-only logging to support desktop apps with certificate pinning.
                                        Browser prompts to these domains will <strong>not</strong> be inspected.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Policy Controls ── */}
            <div className="card">
                <h2 className="text-base font-bold text-gray-900 mb-2">Policy Controls</h2>
                <p className="text-xs text-gray-500 mb-4">
                    Automated enforcement actions applied to monitored traffic.
                </p>

                <Toggle
                    enabled={settings.block_high_risk}
                    onChange={(val) => saveSettings({ block_high_risk: val })}
                    label="Block Critical-Risk Prompts"
                    description="Automatically block any prompt classified as critical sensitivity level (PII, PHI, trade secrets combined)."
                    warning="Blocked prompts will return an error to the user instead of forwarding to the AI provider."
                />

                <Toggle
                    enabled={settings.redact_sensitive}
                    onChange={(val) => saveSettings({ redact_sensitive: val })}
                    label="Redact Sensitive Content"
                    description="Automatically replace detected PII, credentials, and financial data with [REDACTED] markers before forwarding."
                />

                <Toggle
                    enabled={settings.alert_on_violations}
                    onChange={(val) => saveSettings({ alert_on_violations: val })}
                    label="Alert on Policy Violations"
                    description="Generate alerts when sensitive data or policy violations are detected in AI requests."
                />

                <Toggle
                    enabled={settings.desktop_bypass}
                    onChange={(val) => saveSettings({ desktop_bypass: val })}
                    label="Desktop App Bypass"
                    description="Allow certificate-pinned desktop apps (ChatGPT Desktop, Claude Desktop) to bypass deep inspection. When enabled, these apps log metadata only (domain, timestamp) instead of full prompt content."
                    warning="Enabling this creates a monitoring gap — employees can use desktop apps without prompt-level visibility. Recommended: OFF for maximum security."
                />
            </div>

            {/* ── Data & Privacy ── */}
            <div className="card">
                <h2 className="text-base font-bold text-gray-900 mb-2">Data &amp; Privacy</h2>
                <p className="text-xs text-gray-500 mb-4">
                    Controls for data collection, retention, and audit capabilities.
                </p>

                <Toggle
                    enabled={settings.full_audit_mode}
                    onChange={(val) => saveSettings({ full_audit_mode: val })}
                    label="Full Audit Mode"
                    description="Store full prompt text alongside classification metadata. Required for detailed auditing."
                    warning="Full prompt storage increases data sensitivity. Ensure appropriate access controls are in place."
                />

                {/* Retention Period */}
                <div className="py-4 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-800">Data Retention Period</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Activity events older than this threshold are automatically purged.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                        <select
                            value={settings.retention_days}
                            onChange={(e) => saveSettings({ retention_days: parseInt(e.target.value, 10) })}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                            <option value={30}>30 days</option>
                            <option value={60}>60 days</option>
                            <option value={90}>90 days (Default)</option>
                            <option value={180}>180 days</option>
                            <option value={365}>365 days</option>
                        </select>
                        <span className="text-xs text-gray-400">
                            Current: {settings.retention_days} days
                        </span>
                    </div>
                </div>

                {/* Security Measures */}
                <div className="py-4">
                    <p className="text-sm font-semibold text-gray-800 mb-2">Security Measures</p>
                    <div className="space-y-2">
                        {[
                            { label: "Encrypted Logs", desc: "All activity events are encrypted at rest" },
                            { label: "Salted Prompt Hashes", desc: "Prompts are hashed with unique salt, never stored in plaintext (unless Full Audit enabled)" },
                            { label: "Hashed User IDs", desc: "User identifiers are one-way hashed for privacy" },
                            { label: "No Model Training", desc: "Captured data is never used for AI model training" },
                            { label: "Configurable Retention", desc: "Data automatically purged based on retention policy" },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center gap-2 text-xs text-gray-600">
                                <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                                </svg>
                                <span><strong>{item.label}</strong> — {item.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Positioning ── */}
            <div className="card bg-gray-900 text-white">
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500">
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">Usage-Aware Governance</p>
                        <p className="text-xs text-gray-400">Not surveillance. Governance.</p>
                    </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                    Complyze&apos;s proxy monitoring doesn&apos;t watch employees — it watches
                    risk. By analyzing AI traffic patterns, Complyze helps your
                    organization make informed governance decisions based on actual usage,
                    not just vendor policies. Usage-informed risk scores give your board
                    and compliance team the confidence to govern AI tools proactively.
                </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <Link href="/monitoring" className="btn-primary flex-1 text-center">
                    View Monitoring Dashboard
                </Link>
                <Link href="/" className="btn-secondary">
                    ← Dashboard
                </Link>
            </div>
        </div>
    );
}
