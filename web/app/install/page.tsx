"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";

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
                    <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter italic">
                        Activate Complyze Shield
                    </h1>
                    <p className="text-white/75 text-sm max-w-md mx-auto font-bold uppercase tracking-widest text-[10px] opacity-60">
                        Deploy the browser extension to monitor and secure AI interactions across your organization.
                    </p>
                </div>

                {/* Steps */}
                <div className="space-y-4">
                    {/* Step 1 – Install Extension */}
                    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-40" />
                        <div className="flex items-start gap-6">
                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg font-black italic">
                                01
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-black text-white mb-1 uppercase tracking-tight">Add to Browser</h3>
                                <p className="text-sm text-white/50 mb-6 font-bold uppercase tracking-widest text-[10px]">Chrome &middot; Edge &middot; Brave</p>
                                <button
                                    onClick={() => window.open('https://chrome.google.com/webstore', '_blank')}
                                    className="inline-flex items-center gap-3 rounded-xl bg-indigo-500 px-6 py-3 text-xs font-black text-white hover:bg-indigo-400 transition-all uppercase tracking-widest shadow-lg shadow-indigo-900/20 active:scale-95"
                                >
                                    <Globe className="h-4 w-4" />
                                    Add to Chrome
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Step 2 – Configure Enrollment */}
                    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-40" />
                        <div className="flex items-start gap-6">
                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg font-black italic">
                                02
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-black text-white mb-1 uppercase tracking-tight">Enter License Key</h3>
                                <p className="text-sm text-white/50 mb-4 font-bold uppercase tracking-widest text-[10px]">
                                    Click the Complyze icon in your browser toolbar and paste your organization token.
                                </p>
                                <div className="bg-black/40 border border-white/5 rounded-xl px-5 py-4 flex items-center justify-between group">
                                    <code className="text-xs font-mono text-emerald-400/80 font-bold uppercase tracking-widest truncate mr-4">
                                        COM-9B2-A4F-7X1
                                    </code>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText('COM-9B2-A4F-7X1');
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                        className="text-[10px] font-black uppercase text-white/40 hover:text-white transition-colors shrink-0"
                                    >
                                        {copied ? "Copied" : "Copy"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Step 3 – Verify Shield */}
                    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-40" />
                        <div className="flex items-start gap-6">
                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-lg font-black italic">
                                03
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-black text-white mb-1 uppercase tracking-tight">Ready for AI</h3>
                                <p className="text-sm text-white/50 font-bold uppercase tracking-widest text-[10px] leading-relaxed">
                                    Refresh your AI tabs (ChatGPT, Gemini, etc). Complyze will now monitor for sensitive data and policy violations in real-time.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Managed Deployment */}
                <div className="mt-8 rounded-2xl bg-black/20 border border-white/5 p-6 text-center">
                    <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-3 font-mono">Managed Infrastructure?</h4>
                    <p className="text-xs text-white/50 font-medium leading-relaxed">
                        For bulk deployment via MDM (Jamf, Intune, InTune), visit the <Link href="/admin" className="text-indigo-400 hover:text-indigo-300 underline font-bold">Admin Hub</Link> to download the Managed Storage JSON configuration.
                    </p>
                </div>

                {/* Back link */}
                <div className="mt-8 text-center">
                    <Link href="/dashboard" className="text-sm text-white/75 hover:text-white transition-colors">
                        ← Back to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
