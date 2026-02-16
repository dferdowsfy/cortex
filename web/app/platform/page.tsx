"use client";

import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export default function PlatformPage() {
    return (
        <div className="bg-background-light dark:bg-background-dark text-neutral-800 dark:text-white font-display antialiased overflow-x-hidden min-h-screen">
            <MarketingNav />

            <main>
                {/* Hero Section */}
                <section className="relative pt-24 pb-32 overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-neutral-800 dark:text-white mb-8">
                            The AI Governance <br />
                            <span className="text-primary font-medium">Control Platform</span>
                        </h1>
                        <p className="text-xl text-neutral-500 dark:text-neutral-300 max-w-2xl mx-auto leading-relaxed">
                            Complyze provides structured visibility and governance automation for enterprise AI environments.
                        </p>
                    </div>
                </section>

                {/* Section 1: Centralized AI Registry */}
                <section className="py-24 border-b border-neutral-200 dark:border-neutral-800">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            <div>
                                <h2 className="text-3xl font-bold mb-6">Centralized AI Registry</h2>
                                <p className="text-lg text-neutral-500 dark:text-neutral-400 leading-relaxed mb-8">
                                    Track AI tools, owners, versions, assessment status, and governance coverage in a single control plane.
                                </p>
                                <Link href="/request-demo" className="text-primary font-semibold hover:underline">
                                    See how it works →
                                </Link>
                            </div>
                            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xl overflow-hidden aspect-video flex items-center justify-center">
                                <div className="text-xs text-neutral-400 font-mono">[Dashboard Screenshot Mockup]</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 2: Assessment & Review Workflows */}
                <section className="py-24 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-800">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            <div className="lg:order-2">
                                <h2 className="text-3xl font-bold mb-6">Assessment & Review Workflows</h2>
                                <p className="text-lg text-neutral-500 dark:text-neutral-400 leading-relaxed mb-8">
                                    Initiate structured reassessments, assign ownership, track overdue controls, and maintain version history.
                                </p>
                                <Link href="/request-demo" className="text-primary font-semibold hover:underline">
                                    Explore workflows →
                                </Link>
                            </div>
                            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xl overflow-hidden aspect-video flex items-center justify-center lg:order-1">
                                <div className="text-xs text-neutral-400 font-mono">[Assessment Detail Mockup]</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 3: Governance Gap Management */}
                <section className="py-24 border-b border-neutral-200 dark:border-neutral-800">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            <div>
                                <h2 className="text-3xl font-bold mb-6">Governance Gap Management</h2>
                                <p className="text-lg text-neutral-500 dark:text-neutral-400 leading-relaxed mb-8">
                                    Identify policy gaps, expired controls, and high-risk AI usage with severity-based tracking.
                                </p>
                                <Link href="/request-demo" className="text-primary font-semibold hover:underline">
                                    Manage risks →
                                </Link>
                            </div>
                            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xl overflow-hidden aspect-video flex items-center justify-center">
                                <div className="text-xs text-neutral-400 font-mono">[Governance Checklist Mockup]</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 4: Audit-Ready Reporting */}
                <section className="py-24 bg-neutral-50 dark:bg-neutral-900/50">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            <div className="lg:order-2">
                                <h2 className="text-3xl font-bold mb-6">Audit-Ready Reporting</h2>
                                <p className="text-lg text-neutral-500 dark:text-neutral-400 leading-relaxed mb-8">
                                    Generate structured governance summaries and compliance reports for executives and audit teams.
                                </p>
                                <Link href="/request-demo" className="text-primary font-semibold hover:underline">
                                    View report samples →
                                </Link>
                            </div>
                            <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xl overflow-hidden aspect-video flex items-center justify-center lg:order-1">
                                <div className="text-xs text-neutral-400 font-mono">[Board Report Mockup]</div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <MarketingFooter />
        </div>
    );
}
