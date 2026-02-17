"use client";

import { useState, useEffect } from "react";
import DeploymentGuideModal from "./DeploymentGuideModal";

const AGENT_VERSION = "1.2.0";

type Status = "Healthy" | "Offline" | "Outdated" | "Connecting";

interface Platform {
    label: string;
}

const platforms: Record<string, Platform> = {
    macOS: { label: "macOS" },
    windows: { label: "Windows" },
};

function detectPlatform(): string {
    if (typeof navigator === "undefined") return "macOS";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "windows";
    return "macOS";
}

interface DesktopAgentLauncherProps {
    status?: Status;
    lastSeen?: string;
}

export default function DesktopAgentLauncher({ status = "Offline", lastSeen = "Never" }: DesktopAgentLauncherProps) {
    const [platform, setPlatform] = useState<string>("macOS");
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => setPlatform(detectPlatform()), []);

    const statusColors: Record<Status, string> = {
        Healthy: "bg-green-100 text-green-700",
        Offline: "bg-gray-100 text-gray-600",
        Outdated: "bg-amber-100 text-amber-700",
        Connecting: "bg-blue-100 text-blue-700 animate-pulse",
    };

    const handleInstall = async () => {
        setIsDownloading(true);
        try {
            // Log the attempt (don't let it block the download if it fails)
            fetch("/api/agent/installation-log", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    os_type: platform,
                    version: AGENT_VERSION,
                    user_id: "current_user",
                }),
            }).catch(err => {
                console.warn("Installation logging failed:", err);
            });

            // Trigger download immediately
            window.location.href = "/api/agent/installer";
        } catch (err) {
            console.error("Installation process failed:", err);
        } finally {
            setTimeout(() => setIsDownloading(false), 2000);
        }
    };

    return (
        <>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm transition-all duration-200">
                {/* ── Header Area ── */}
                <div className="px-8 py-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 21h6l-.75-4M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Desktop Monitoring Agent</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusColors[status]}`}>
                                    Status: {status}
                                </span>
                                <span className="text-[11px] text-gray-400 font-mono">v{AGENT_VERSION}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-0.5">Last Sync</p>
                            <p className="text-sm font-semibold text-gray-700">
                                {lastSeen !== "Never" ? new Date(lastSeen).toLocaleTimeString() : "Never"}
                            </p>
                        </div>
                        <div className="h-10 w-px bg-gray-100 hidden md:block" />
                        <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-200">
                            {Object.entries(platforms).map(([key, val]) => (
                                <button
                                    key={key}
                                    onClick={() => setPlatform(key)}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${platform === key
                                        ? "bg-white text-gray-901 shadow-sm border border-gray-200 ring-1 ring-black/5"
                                        : "text-gray-400 hover:text-gray-600"
                                        }`}
                                >
                                    {val.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Content Area ── */}
                <div className="p-8">
                    <div className="grid lg:grid-cols-12 gap-10">
                        <div className="lg:col-span-8">
                            <p className="text-gray-600 text-base leading-relaxed mb-8 max-w-2xl">
                                Routes AI traffic through structured governance controls and synchronizes usage signals with this dashboard.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 mb-10">
                                {[
                                    "Proxy auto-configuration",
                                    "Certificate trust validation",
                                    "Prompt inspection pipeline",
                                    "Live governance sync",
                                    "Background execution"
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-5 h-5 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
                                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">{item}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-4">
                                {!isDownloading ? (
                                    <button
                                        onClick={handleInstall}
                                        className="bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 rounded-lg text-sm font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 ring-offset-2"
                                    >
                                        Download Installer
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-3 px-8 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 text-sm font-bold">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Downloading...
                                    </div>
                                )}

                                <button
                                    onClick={() => {
                                        // Try to open the desktop app via custom protocol
                                        const iframe = document.createElement('iframe');
                                        iframe.style.display = 'none';
                                        iframe.src = 'complyze://open';
                                        document.body.appendChild(iframe);
                                        setTimeout(() => document.body.removeChild(iframe), 500);
                                    }}
                                    className="bg-brand-50 hover:bg-brand-100 text-brand-700 px-8 py-3 rounded-lg text-sm font-bold border border-brand-200 shadow-sm transition-all"
                                >
                                    Launch Complyze
                                </button>

                                <button
                                    onClick={() => setIsGuideOpen(true)}
                                    className="bg-white hover:bg-gray-50 text-gray-700 px-8 py-3 rounded-lg text-sm font-bold border border-gray-300 shadow-sm transition-all"
                                >
                                    Deployment Guide
                                </button>
                            </div>

                            {/* ── macOS Instructions ── */}
                            {platform === 'macOS' && (
                                <div className="mt-8 p-5 bg-blue-50/50 border border-blue-100 rounded-xl">
                                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-3">Next Steps for macOS</h4>
                                    <ol className="text-sm text-blue-800 space-y-3 list-decimal list-inside">
                                        <li>Open the <strong>Complyze-1.0.0-arm64.dmg</strong> from your downloads.</li>
                                        <li>Drag <strong>Complyze</strong> into your <strong>Applications</strong> folder.</li>
                                        <li>If you see <strong>&quot;damaged&quot;</strong> or a security warning, open <strong>Terminal</strong> and run:<br />
                                            <code className="mt-1 inline-block bg-gray-900 text-white px-3 py-1.5 rounded text-xs font-mono select-all">
                                                xattr -cr /Applications/Complyze.app
                                            </code>
                                        </li>
                                        <li>Then open the app from <strong>Applications</strong>. Look for the <strong>green circle</strong> in your top menu bar.</li>
                                    </ol>
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-4 bg-gray-50 border border-gray-100 rounded-xl p-6">
                            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-6">Agent Operational Health</h4>
                            <div className="space-y-5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-500">Service Connectivity</span>
                                    <span className={`text-xs font-bold uppercase ${status === "Healthy" ? "text-green-600" : "text-gray-400"}`}>
                                        {status === "Healthy" ? "Operational" : "Offline"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-500">Traffic Routing</span>
                                    <span className={`text-xs font-bold uppercase ${status === "Healthy" ? "text-green-600" : "text-gray-400"}`}>
                                        {status === "Healthy" ? "Active" : "Inactive"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-500">OS Integration</span>
                                    <span className={`text-xs font-bold uppercase ${status === "Healthy" ? "text-green-600" : "text-gray-400"}`}>
                                        {status === "Healthy" ? "Verified" : "Pending"}
                                    </span>
                                </div>
                                <div className="pt-6 mt-6 border-t border-gray-200">
                                    <p className="text-[11px] text-gray-400 leading-relaxed font-medium italic">
                                        Agent must be operational on the host system to enforce corporate governance policies for browser and IDE sessions.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <DeploymentGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
        </>
    );
}
