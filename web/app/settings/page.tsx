"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useUserSettings } from "@/lib/hooks/use-user-settings";

/* ═══════════════════════════════════════════════════════════════
   Types (kept for agent/setup status — not user settings)
   ═══════════════════════════════════════════════════════════════ */

interface ExtensionStatus {
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
    disabled,
}: {
    enabled: boolean;
    onChange: (val: boolean) => void;
    label: string;
    description: string;
    warning?: string;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-4 py-5 border-b border-white/10 last:border-0">
            <div className="min-w-0">
                <p className="text-sm font-bold text-white">{label}</p>
                <p className="text-xs text-white/40 mt-0.5">{description}</p>
                {warning && enabled && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
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
                disabled={disabled}
                onClick={() => !disabled && onChange(!enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                    } ${enabled ? "bg-blue-600" : "bg-white/10"}`}
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
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
    const [setupLoading, setSetupLoading] = useState<string | null>(null);
    const [setupMessage, setSetupMessage] = useState<{ type: "success" | "error" | "info"; text: string; command?: string } | null>(null);
    const [isCloud, setIsCloud] = useState(false);
    const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);
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

    const checkExtensionStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/agent/heartbeat");
            if (res.ok) {
                const data = await res.json();
                setExtensionStatus(data);
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
        checkExtensionStatus();
        if (!isCloud) checkSetupStatus();
    }, [checkSetupStatus, checkExtensionStatus, isCloud]);

    useEffect(() => {
        const interval = setInterval(() => {
            checkExtensionStatus();
            if (!isCloud) checkSetupStatus();
        }, 5000);
        return () => clearInterval(interval);
    }, [checkExtensionStatus, checkSetupStatus, isCloud]);

    // ── Save handler: Bridge sync between User Settings & Proxy Agent ──
    async function handleSave(partial: Partial<typeof settings>) {
        if (isSaving) return;
        setIsSaving(true);
        setError("");
        try {
            // 1. Save to Firestore (Realtime UI logic)
            await saveSettings(partial);

            // 2. Map to Proxy Backend (snake_case)
            const proxyMap: Record<string, any> = {};
            if ("proxyEnabled" in partial) proxyMap.proxy_enabled = partial.proxyEnabled;
            if ("fullAuditMode" in partial) proxyMap.full_audit_mode = partial.fullAuditMode;
            if ("blockHighRisk" in partial) proxyMap.block_high_risk = partial.blockHighRisk;
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
        } finally {
            setIsSaving(false);
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
        <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-black text-white tracking-tighter">Settings</h1>
                <p className="mt-1 text-sm text-white/40">
                    Global AI governance controls for your organization.
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
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white">AI Monitoring Controls</h2>
                        <p className="text-xs text-white/40">Master controls for AI governance and visibility</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <Toggle
                        enabled={settings.proxyEnabled}
                        onChange={(val) => handleSave({ proxyEnabled: val })}
                        label="Enable AI Security Shield"
                        description="Activate the browser extension to classify and secure AI interactions."
                        disabled={isSaving}
                    />
                    <Toggle
                        enabled={settings.blockHighRisk}
                        onChange={(val) => handleSave({ blockHighRisk: val })}
                        label="Block High Risk Prompts"
                        description="Automatically prevent prompts with high risk scores from being sent to AI providers."
                        warning="This may intercept and block valid user requests if threshold is too low."
                        disabled={isSaving}
                    />
                    <Toggle
                        enabled={settings.inspectAttachments}
                        onChange={(val) => handleSave({ inspectAttachments: val })}
                        label="Scan Attachments"
                        description="Deep scan file uploads and documents for sensitive data leakage."
                        disabled={isSaving}
                    />
                    <Toggle
                        enabled={settings.userAttributionEnabled}
                        onChange={(val) => handleSave({ userAttributionEnabled: val })}
                        label="User Attribution"
                        description="Link intercepted events to specific user identities for audit trails."
                        disabled={isSaving}
                    />

                    {/* Risk Posture Selector */}
                    <div className="py-6 border-t border-white/10 mt-2">
                        <div className="flex justify-between items-end mb-4">
                            <div>
                                <p className="text-sm font-bold text-white">Risk Posture</p>
                                <p className="text-xs text-white/40 mt-0.5">Define your organization's tolerance for AI risk.</p>
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
                                        className={`py-2 px-3 rounded-lg text-sm font-bold transition-all duration-150 border ${isActive
                                            ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                                            : "bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Dynamic Description */}
                        <div className="bg-white/5 rounded-lg p-3 text-xs text-white/50 border border-white/10 transition-all duration-200 min-h-[60px] flex flex-col justify-center">
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
                                        <p className="font-bold text-white mb-1">{title}</p>
                                        <p className="text-white/40 leading-relaxed">{desc}</p>
                                    </>
                                );
                            })()}
                        </div>

                        <div className="mt-3 flex items-center justify-end px-1">
                            <p className="text-[10px] uppercase tracking-wider font-medium text-white/30">
                                Numeric Threshold: <span className="font-mono text-white/60">{settings.riskThreshold}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Divider */}
            <hr className="border-white/10" />

            {/* 3. Browser Security Shield */}
            <div className="card">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.856.12-1.685.344-2.469" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white">Browser Security Shield</h2>
                            <p className="text-xs text-white/40">Managed browser extension for real-time AI governance</p>
                        </div>
                    </div>
                    {/* Live status indicator */}
                    <div className="flex items-center gap-2">
                        <span className={`relative flex h-2.5 w-2.5 rounded-full ${extensionStatus?.connected ? "bg-green-500" : "bg-white/20"
                            }`}>
                            {extensionStatus?.connected && (
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            )}
                        </span>
                        <span className="text-xs font-bold text-white/50 uppercase tracking-tight">
                            {extensionStatus?.connected ? "ACTIVE" : "INACTIVE"}
                        </span>
                    </div>
                </div>

                {/* 3-dot status checklist */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-5 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5">
                        <span className={`flex h-2.5 w-2.5 rounded-full ${extensionStatus !== null ? "bg-green-500" : "bg-white/20"
                            }`} />
                        <span className={`text-xs font-medium ${extensionStatus !== null ? "text-green-400" : "text-white/30"
                            }`}>Extension Installed</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className={`flex h-2.5 w-2.5 rounded-full ${extensionStatus?.connected ? "bg-green-500" : "bg-white/20"
                            }`} />
                        <span className={`text-xs font-medium ${extensionStatus?.connected ? "text-green-400" : "text-white/30"
                            }`}>Connection Active</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className={`flex h-2.5 w-2.5 rounded-full ${extensionStatus?.connected && settings.proxyEnabled ? "bg-green-500" : "bg-white/20"
                            }`} />
                        <span className={`text-xs font-medium ${extensionStatus?.connected && settings.proxyEnabled ? "text-green-400" : "text-white/30"
                            }`}>Shield Enabled</span>
                    </div>
                    {extensionStatus?.connected && (
                        <div className="pt-1 border-t border-white/10 mt-1 text-[10px] text-white/30 font-mono">
                            Last seen: {extensionStatus.minutes_ago === 0 ? "just now" : `${extensionStatus.minutes_ago}m ago`}
                            {extensionStatus.hostname && <> · Host: <strong className="text-white/50">{extensionStatus.hostname}</strong></>}
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                        href="/install"
                        className="flex-1 btn-primary py-3 px-4 flex items-center justify-center gap-2"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        {extensionStatus?.connected ? "Manage Extension" : "Activate Extension"}
                    </Link>
                    {/* Check Connection: always visible, uses heartbeat (works on cloud + local) */}
                    <button
                        onClick={async () => {
                            setSetupLoading("check-connection");
                            await checkExtensionStatus();
                            setSetupLoading(null);
                        }}
                        disabled={setupLoading === "check-connection"}
                        className="btn-secondary py-3 px-4 flex items-center justify-center gap-2"
                    >
                        <svg className={`h-4 w-4 ${setupLoading === "check-connection" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        {setupLoading === "check-connection" ? "Checking..." : "Check Connection"}
                    </button>
                </div>
            </div>

            {/* 4. Divider */}
            <hr className="border-gray-100" />

            {/* 5. Advanced Settings */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-white/40">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white">Advanced Governance</h2>
                        <p className="text-xs text-white/40">Fine-grained configuration and data policies</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <Toggle
                        enabled={settings.redactSensitive}
                        onChange={(val) => handleSave({ redactSensitive: val })}
                        label="Auto-Redaction"
                        description="Sanitize PII and credentials before they leave the browser."
                        disabled={isSaving}
                    />
                    <Toggle
                        enabled={settings.fullAuditMode}
                        onChange={(val) => handleSave({ fullAuditMode: val })}
                        label="Full Audit Mode"
                        description="Store complete prompt and response bodies for regulatory compliance."
                        warning="Significantly increases stored data volume and sensitivity."
                        disabled={isSaving}
                    />
                    <Toggle
                        enabled={settings.desktopBypass}
                        onChange={(val) => handleSave({ desktopBypass: val })}
                        label="Desktop App Bypass"
                        description="Allow native desktop apps with pinned certificates to skip deep inspection."
                        disabled={isSaving}
                    />

                    <div className="py-6 border-t border-white/10 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-white">Retention Period</p>
                            <p className="text-xs text-white/40 mt-0.5">Duration for storing audit logs before auto-purging.</p>
                        </div>
                        <select
                            value={settings.retentionDays}
                            onChange={(e) => handleSave({ retentionDays: parseInt(e.target.value, 10) })}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
