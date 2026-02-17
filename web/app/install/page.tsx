"use client";

import { useState } from "react";
import Link from "next/link";

export default function InstallPage() {
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const xattrCommand = 'xattr -cr ~/Downloads/Complyze-1.0.0-arm64.dmg';

    function copyCommand() {
        navigator.clipboard.writeText(xattrCommand);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function handleDownload() {
        setDownloading(true);
        // Trigger the actual download
        window.location.href = "/api/agent/installer";
        setTimeout(() => setDownloading(false), 3000);
    }

    return (
        <div className="min-h-screen bg-[#0f0d1f] flex items-center justify-center px-4 py-16">
            <div className="w-full max-w-xl">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-white/10 mb-5">
                        <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-semibold text-white mb-2">
                        Install Complyze Desktop Agent
                    </h1>
                    <p className="text-white/50 text-sm max-w-md mx-auto">
                        The desktop agent runs locally to discover and monitor AI tools across your environment.
                    </p>
                </div>

                {/* Steps */}
                <div className="space-y-4">
                    {/* Step 1 – Download */}
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-semibold">
                                1
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[15px] font-medium text-white mb-1">Download the installer</h3>
                                <p className="text-sm text-white/40 mb-4">macOS (Apple Silicon) &middot; ~150 MB</p>
                                <button
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400 transition-colors disabled:opacity-60"
                                >
                                    {downloading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Downloading…
                                        </>
                                    ) : (
                                        <>
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                            Download Complyze.dmg
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Step 2 – Remove quarantine */}
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-semibold">
                                2
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[15px] font-medium text-white mb-1">
                                    Remove macOS quarantine flag
                                </h3>
                                <p className="text-sm text-white/40 mb-3">
                                    macOS blocks apps downloaded outside the App Store. Open <strong className="text-white/60">Terminal</strong> and run:
                                </p>
                                <div className="relative group">
                                    <pre className="rounded-lg bg-black/40 border border-white/[0.06] px-4 py-3 text-[13px] font-mono text-emerald-400 overflow-x-auto">
                                        {xattrCommand}
                                    </pre>
                                    <button
                                        onClick={copyCommand}
                                        className="absolute top-2 right-2 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        {copied ? "Copied!" : "Copy"}
                                    </button>
                                </div>
                                <p className="text-xs text-white/25 mt-2">
                                    This removes the quarantine extended attribute that macOS applies to downloaded files.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Step 3 – Open DMG */}
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-semibold">
                                3
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[15px] font-medium text-white mb-1">
                                    Open the DMG and install
                                </h3>
                                <p className="text-sm text-white/40">
                                    Double-click the <strong className="text-white/60">.dmg</strong> file, then drag <strong className="text-white/60">Complyze.app</strong> to your Applications folder.
                                    Launch it from Applications — the agent will connect to your Complyze dashboard automatically.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Troubleshooting */}
                <div className="mt-8 rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
                    <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Still seeing &ldquo;damaged&rdquo;?</h4>
                    <div className="space-y-2 text-sm text-white/35">
                        <p>If the error persists after Step 2, try clearing the attribute on the mounted app directly:</p>
                        <pre className="rounded-lg bg-black/30 px-3 py-2 text-[12px] font-mono text-emerald-400/80 overflow-x-auto">
                            sudo xattr -cr /Applications/Complyze.app
                        </pre>
                        <p className="text-xs">
                            Or right-click the app → <strong className="text-white/50">Open</strong> to bypass Gatekeeper for a single launch.
                        </p>
                    </div>
                </div>

                {/* Back link */}
                <div className="mt-8 text-center">
                    <Link href="/dashboard" className="text-sm text-white/30 hover:text-white/60 transition-colors">
                        ← Back to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
