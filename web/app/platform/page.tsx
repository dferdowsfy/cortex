"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

function ScrollIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(entry.target);
                }
            },
            { threshold: 0.1 }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out transform ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                }`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
        </div>
    );
}

function StatCounter({ value, label, startAnimation }: { value: number; label: string; startAnimation: boolean }) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!startAnimation) return;

        let startTime: number;
        const duration = 1500;

        const animate = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);
            setCount(Math.floor(progress * value));

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, startAnimation]);

    return (
        <div className="text-center p-6 border border-white/10 rounded-xl bg-white/[0.02]">
            <div className="text-4xl font-bold text-[#3B36DB] mb-2">{count}</div>
            <div className="text-sm text-white/50 uppercase tracking-widest">{label}</div>
        </div>
    );
}

export default function PlatformPage() {
    const [showStats, setShowStats] = useState(false);
    const statsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShowStats(true);
                    observer.unobserve(entry.target);
                }
            },
            { threshold: 0.5 }
        );

        if (statsRef.current) {
            observer.observe(statsRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div className="bg-[#111121] text-white font-sans antialiased overflow-x-hidden min-h-screen">
            <MarketingNav />

            <main>
                {/* Hero Section */}
                <section className="relative pt-32 pb-24 overflow-hidden">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            <ScrollIn>
                                <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-white mb-8 leading-tight">
                                    AI Usage Monitoring <br />
                                    and Risk Control — <br />
                                    <span className="text-[#3B36DB]">In Real Time</span>
                                </h1>
                                <p className="text-xl text-white/70 max-w-xl mb-10 leading-relaxed">
                                    Complyze detects AI usage across desktop and browser apps, scores exposure risk, and optionally blocks high-risk activity — without slowing teams down.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <Link
                                        href="/request-demo"
                                        className="inline-flex justify-center items-center px-8 py-4 bg-[#3B36DB] text-white font-bold rounded-lg hover:bg-[#4d48ef] transition-all text-lg"
                                    >
                                        Request Demo
                                    </Link>
                                    <button
                                        onClick={() => document.getElementById('detect')?.scrollIntoView({ behavior: 'smooth' })}
                                        className="inline-flex justify-center items-center px-8 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-lg hover:bg-white/10 transition-all text-lg"
                                    >
                                        See Platform Overview
                                    </button>
                                </div>
                            </ScrollIn>

                            <ScrollIn delay={200}>
                                <div className="relative group">
                                    <div className="absolute -inset-1 bg-[#3B36DB]/20 rounded-2xl blur-2xl group-hover:bg-[#3B36DB]/30 transition duration-1000"></div>
                                    <div className="relative rounded-2xl border border-white/10 bg-[#111121] shadow-2xl overflow-hidden">
                                        <Image
                                            src="/assets/platform_hero_dashboard.png"
                                            alt="Complyze Dashboard Mockup"
                                            width={1200}
                                            height={800}
                                            className="w-full h-auto"
                                        />
                                    </div>
                                </div>
                            </ScrollIn>
                        </div>
                    </div>
                </section>

                {/* Section 2: Detect */}
                <section id="detect" className="py-24 border-t border-white/5">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-20 items-center">
                            <div className="lg:order-2">
                                <ScrollIn>
                                    <h2 className="text-4xl font-bold text-white mb-6">Detect AI Usage Across Your Organization</h2>
                                    <p className="text-lg text-white/70 leading-relaxed mb-8">
                                        Gain instant visibility into which AI tools are being used on every endpoint. Complyze identifies desktop applications and browser extensions, ensuring no platform goes unmonitored.
                                    </p>
                                    <div className="space-y-4">
                                        {[
                                            "Monitor desktop + browser AI tools",
                                            "Real-time endpoint coverage status",
                                            "Automated app classification",
                                            "Zero-latency detection engine"
                                        ].map((item, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded-full bg-[#3B36DB]/20 flex items-center justify-center">
                                                    <div className="w-2 h-2 rounded-full bg-[#3B36DB]"></div>
                                                </div>
                                                <span className="text-white/80">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollIn>
                            </div>
                            <div className="lg:order-1">
                                <ScrollIn delay={200}>
                                    <div className="relative p-2 rounded-2xl border border-white/10 bg-white/[0.02] shadow-2xl transform lg:-rotate-2">
                                        <Image
                                            src="/assets/platform_detect_list.png"
                                            alt="AI Application Detection"
                                            width={800}
                                            height={600}
                                            className="rounded-xl"
                                        />
                                    </div>
                                </ScrollIn>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 3: Score */}
                <section className="py-24 bg-white/[0.01] border-y border-white/5">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-20 items-center">
                            <div>
                                <ScrollIn>
                                    <h2 className="text-4xl font-bold text-white mb-6">Understand Your AI Exposure in One Number</h2>
                                    <p className="text-lg text-white/70 leading-relaxed mb-8">
                                        Our AI Risk Score aggregates sensitive data hits, prompt severity, and attachment risks into a single, board-ready metric. Track trends and identify outliers before they become incidents.
                                    </p>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                            <div className="text-sm text-white/50 mb-1">Exposure Level</div>
                                            <div className="text-2xl font-bold text-[#3B36DB]">High Risk</div>
                                        </div>
                                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                            <div className="text-sm text-white/50 mb-1">Trend</div>
                                            <div className="text-2xl font-bold text-emerald-400">Stable</div>
                                        </div>
                                    </div>
                                </ScrollIn>
                            </div>
                            <div>
                                <ScrollIn delay={200}>
                                    <div className="relative p-2 rounded-2xl border border-white/10 bg-white/[0.02] shadow-2xl transform lg:rotate-2">
                                        <Image
                                            src="/assets/platform_score_panel.png"
                                            alt="AI Risk Scoring Panel"
                                            width={800}
                                            height={600}
                                            className="rounded-xl"
                                        />
                                    </div>
                                </ScrollIn>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 4: Control */}
                <section className="py-24 border-b border-white/5">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-20 items-center">
                            <div className="lg:order-2">
                                <ScrollIn>
                                    <h2 className="text-4xl font-bold text-white mb-6">Stop High-Risk Activity Automatically</h2>
                                    <p className="text-lg text-white/70 leading-relaxed mb-8">
                                        Enable active enforcement with our network-level interceptor. Define risk thresholds that trigger automated blocking of sensitive prompts and file uploads without human intervention.
                                    </p>
                                    <ul className="space-y-6">
                                        <li className="flex gap-4">
                                            <div className="shrink-0 w-12 h-12 bg-[#3B36DB]/10 rounded-lg flex items-center justify-center">
                                                <svg className="w-6 h-6 text-[#3B36DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white">Active Enforcement</h4>
                                                <p className="text-sm text-white/60">Stop PII and PHI exfiltration in real-time.</p>
                                            </div>
                                        </li>
                                        <li className="flex gap-4">
                                            <div className="shrink-0 w-12 h-12 bg-[#3B36DB]/10 rounded-lg flex items-center justify-center">
                                                <svg className="w-6 h-6 text-[#3B36DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white">Policy Thresholds</h4>
                                                <p className="text-sm text-white/60">Customize blocking alerts based on department-specific risk appetites.</p>
                                            </div>
                                        </li>
                                    </ul>
                                </ScrollIn>
                            </div>
                            <div className="lg:order-1">
                                <ScrollIn delay={200}>
                                    <div className="relative p-2 rounded-2xl border border-white/10 bg-white/[0.02] shadow-2xl transform lg:-rotate-2">
                                        <Image
                                            src="/assets/platform_control_view.png"
                                            alt="AI Risk Control Enforcement"
                                            width={800}
                                            height={600}
                                            className="rounded-xl"
                                        />
                                    </div>
                                </ScrollIn>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 5: Executive View */}
                <section className="py-24 bg-gradient-to-b from-[#111121] to-[#0a0a14]">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <ScrollIn>
                                <h2 className="text-4xl font-bold text-white mb-6">Board-Level Visibility</h2>
                                <p className="text-lg text-white/70 max-w-2xl mx-auto">
                                    Export board-ready summaries that demonstrate risk reduction over time. Prove the value of your AI governance program with hard data and trend analysis.
                                </p>
                            </ScrollIn>
                        </div>

                        <div ref={statsRef} className="grid sm:grid-cols-3 gap-8 mb-20">
                            <StatCounter value={27} label="AI Tools Detected" startAnimation={showStats} />
                            <StatCounter value={14} label="High-Risk Events" startAnimation={showStats} />
                            <StatCounter value={6} label="Blocked Prompts" startAnimation={showStats} />
                        </div>

                        <ScrollIn delay={300}>
                            <div className="relative p-4 rounded-3xl border border-white/10 bg-white/[0.02] shadow-2xl max-w-5xl mx-auto">
                                <Image
                                    src="/assets/platform_exec_view.png"
                                    alt="Executive Summary Dashboard"
                                    width={1200}
                                    height={900}
                                    className="rounded-2xl"
                                />
                                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a0a14] to-transparent rounded-b-3xl pointer-events-none"></div>
                            </div>
                        </ScrollIn>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="py-24 text-center">
                    <div className="max-w-4xl mx-auto px-6">
                        <ScrollIn>
                            <h2 className="text-4xl font-bold text-white mb-8">Ready to Secure Your AI Environment?</h2>
                            <p className="text-xl text-white/70 mb-12 leading-relaxed">
                                Join hundreds of mid-market teams using Complyze to gain visibility, manage risk, and enable safe AI adoption.
                            </p>
                            <Link
                                href="/request-demo"
                                className="inline-flex px-10 py-5 bg-[#3B36DB] text-white font-bold rounded-xl hover:bg-[#4d48ef] transition-all text-xl shadow-lg shadow-[#3B36DB]/20"
                            >
                                Get Started Today
                            </Link>
                        </ScrollIn>
                    </div>
                </section>
            </main>

            <MarketingFooter />
        </div>
    );
}
