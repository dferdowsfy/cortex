"use client";

import React from "react";
import Link from "next/link";
import { Shield, ChevronLeft, Lock, Eye, Server, UserCheck, Scale, RefreshCw } from "lucide-react";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#030712] text-white selection:bg-blue-500/30">
            {/* Header / Navigation */}
            <div className="sticky top-0 z-50 border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl">
                <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 group transition-all">
                        <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20 group-hover:bg-blue-600/20">
                            <Shield className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="font-bold tracking-tight text-lg">Complyze</span>
                    </Link>
                    <Link href="/login" className="text-sm font-semibold text-white/40 hover:text-white transition-colors">
                        Admin Login
                    </Link>
                </div>
            </div>

            <main className="max-w-4xl mx-auto px-6 py-16 md:py-24">
                {/* Hero Section */}
                <div className="mb-16">
                    <div className="flex items-center gap-2 text-blue-400 mb-4 animate-in fade-in slide-in-from-bottom-4">
                        <Lock className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-[0.2em]">Security & Governance</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight leading-[1.1]">
                        Privacy <span className="text-blue-500">Policy</span>
                    </h1>
                    <p className="text-white/40 text-lg font-medium leading-relaxed max-w-2xl">
                        Our commitment to transparency and data protection for organizations safely adopting AI tools.
                        <br /><span className="text-white/60 text-sm mt-4 inline-block font-mono">Effective Date: March 10, 2026</span>
                    </p>
                </div>

                {/* Content Section */}
                <div className="space-y-12 text-white/70 leading-relaxed font-medium">

                    <section className="bg-white/[0.02] border border-white/10 rounded-3xl p-8 md:p-12 hover:border-white/20 transition-all">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-blue-600/10 p-3 rounded-2xl border border-blue-500/20">
                                <Eye className="w-6 h-6 text-blue-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white uppercase tracking-tight">1. Purpose of the Extension</h2>
                        </div>
                        <p>
                            The Complyze browser extension monitors user interactions with AI tools (such as ChatGPT and other AI assistants) in order to:
                        </p>
                        <ul className="mt-4 grid md:grid-cols-2 gap-3">
                            <li className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                                Detect potential exposure of sensitive data
                            </li>
                            <li className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                                Enforce organizational security policies
                            </li>
                            <li className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                                Provide risk alerts and security notifications
                            </li>
                            <li className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                                Help organizations safely adopt AI tools
                            </li>
                        </ul>
                        <p className="mt-6 text-white/40 italic text-sm">
                            The extension is intended for use within organizations that choose to deploy Complyze as part of their AI security practices.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                            <div className="bg-emerald-600/10 p-2 rounded-xl border border-emerald-500/20">
                                <Server className="w-5 h-5 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white uppercase tracking-wider">2. Information We Process</h2>
                        </div>
                        <p>
                            The extension may temporarily inspect content entered into AI tools in order to evaluate potential security risks.
                            This may include:
                        </p>
                        <ul className="list-none space-y-3">
                            {["Prompt text entered into AI applications", "File attachment metadata when attachments are inspected", "Security risk indicators (such as detection of credentials or personal data)", "Policy enforcement events (blocked, warned, or redacted prompts)"].map((item, i) => (
                                <li key={i} className="flex items-start gap-4">
                                    <span className="text-emerald-500 font-bold">0{i + 1}</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl text-blue-400 text-sm font-bold">
                            Complyze does not use this information for advertising, tracking, or marketing purposes.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                            <div className="bg-amber-600/10 p-2 rounded-xl border border-amber-500/20">
                                <Shield className="w-5 h-5 text-amber-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white uppercase tracking-wider">3. Sensitive Data Detection</h2>
                        </div>
                        <p>Detection is performed to prevent accidental disclosure of sensitive information, including API keys, tokens, credentials, PII, SSNs, and cloud provider credentials.</p>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                            <div className="bg-purple-600/10 p-2 rounded-xl border border-purple-500/20">
                                <Lock className="w-5 h-5 text-purple-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white uppercase tracking-wider">4. Data Storage</h2>
                        </div>
                        <p>Complyze follows a minimal data collection model. We store only required risk events, security alerts, and health information. </p>
                        <div className="border-l-2 border-purple-500/50 pl-6 py-2">
                            <p className="font-bold text-white underline decoration-purple-500/30 underline-offset-4">Complyze does not store full prompts unless required by the organization’s configured policy.</p>
                        </div>
                    </section>

                    <div className="grid md:grid-cols-2 gap-8">
                        <section className="bg-white/[0.01] border border-white/5 rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4">5. How Information Is Used</h3>
                            <p className="text-sm">Processed information is used solely for preventing data leaks, enforcing policy, and maintaining extension health. We never sell or share data with marketers.</p>
                        </section>
                        <section className="bg-white/[0.01] border border-white/5 rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4">6. Data Sharing</h3>
                            <p className="text-sm">Information is shared only with the Complyze dashboard used by your organization and infrastructure necessary to maintain security functionality.</p>
                        </section>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <section className="space-y-4">
                            <h3 className="text-lg font-bold text-white">7. Security</h3>
                            <p className="text-sm">We implement encryption in transit, secure authentication, and strict access controls to protect all processed data.</p>
                        </section>
                        <section className="space-y-4">
                            <h3 className="text-lg font-bold text-white">8. Organizational Use</h3>
                            <p className="text-sm">Organizations configure the policies. Employees should refer to internal policies regarding AI usage and monitoring.</p>
                        </section>
                    </div>

                    <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row gap-12 text-sm">
                        <div className="flex-1">
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-blue-400" />
                                9. User Control
                            </h3>
                            <p>Users can uninstall the extension at any time. Organizations manage settings through the administrative dashboard.</p>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 text-blue-400" />
                                10. Policy Changes
                            </h3>
                            <p>We may update this policy. Updates will be posted on this page with a new effective date.</p>
                        </div>
                    </div>

                    <div className="bg-blue-600/10 border border-blue-500/20 rounded-3xl p-8 md:p-12 text-center">
                        <h2 className="text-2xl font-bold text-white mb-4">11. Contact Us</h2>
                        <p className="text-blue-400 font-bold mb-6">Complyze Security Team</p>
                        <div className="flex flex-col items-center gap-2 text-sm">
                            <a href="mailto:support@complyze.com" className="text-blue-400 hover:underline">support@complyze.com</a>
                            <a href="https://complyze.com" className="text-white/40 hover:text-white transition-colors">https://complyze.com</a>
                        </div>
                    </div>
                </div>

                {/* Footer Link */}
                <div className="mt-24 pt-12 border-t border-white/5 text-center">
                    <Link href="/" className="text-white/30 hover:text-white transition-colors flex items-center justify-center gap-2 group">
                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Back to Dashboard
                    </Link>
                    <p className="mt-8 text-[10px] text-white/10 uppercase tracking-[0.4em] font-black">
                        © 2026 Complyze Security. All Rights Reserved.
                    </p>
                </div>
            </main>
        </div>
    );
}
