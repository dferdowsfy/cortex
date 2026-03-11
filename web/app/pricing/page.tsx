"use client";

import { useState } from "react";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import { PRICING } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default function PricingPage() {
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

    const handleCheckout = async (plan: string, defaultHref: string) => {
        if (plan === "ENTERPRISE") {
            window.location.href = defaultHref;
            return;
        }

        setLoadingPlan(plan);
        try {
            const config = plan === "SHIELD" ? PRICING.SHIELD : PRICING.STARTER;
            const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: plan,
                    quantity: config.minSeats
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert("Checkout failed: " + (data.error || "Unknown"));
            }
        } catch (err: any) {
            alert("Error initiating checkout: " + err.message);
        } finally {
            setLoadingPlan(null);
        }
    };

    const tiers = [
        {
            name: "STARTER",
            tagline: "Essential Visibility",
            displayPrice: `$${PRICING.STARTER.totalMonthly.toLocaleString()}`,
            priceDetails: `$${PRICING.STARTER.pricePerSeat} per seat · Minimum ${PRICING.STARTER.minSeats} seats · Billed annually`,
            description: "Understand your team's AI usage and uncover hidden risks.",
            features: [
                "AI app detection (desktop + browser)",
                "Prompt monitoring (read-only)",
                "Sensitive data exposure detection",
                "Real-time AI Risk Score (0–100)",
                "High-risk event flagging",
                "Executive dashboard",
                "Monthly risk summary report",
            ],
            cta: "Start Monitoring",
            href: "/signup",
            buttonStyle: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
        },
        {
            name: "SHIELD",
            tagline: "Total AI Protection",
            displayPrice: `$${PRICING.SHIELD.totalMonthly.toLocaleString()}`,
            priceDetails: `$${PRICING.SHIELD.pricePerSeat} per seat · Minimum ${PRICING.SHIELD.minSeats} seats · Billed annually`,
            description: "Real-time enforcement and deep attachment scanning.",
            features: [
                "All Visibility features included",
                "Attachment scanning (local-first)",
                "Real-time blocking at configurable thresholds",
                "Interceptor toggle (on/off by policy)",
                "Monitor all desktop and browser AI tools",
                "Audit logs of blocked activity",
                "Trend reporting",
                "Role-based admin controls",
            ],
            cta: "Enable Control",
            href: "/signup",
            featured: true,
            buttonStyle: "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20"
        },
        {
            name: "ENTERPRISE",
            tagline: "Advanced Organization Safety",
            displayPrice: "Custom",
            priceDetails: "Tailored for organization-wide scale",
            description: "Comprehensive control and support for large teams.",
            features: [
                "Unlimited endpoints",
                "SSO integration",
                "Custom risk scoring logic",
                "API access",
                "Dedicated onboarding",
                "SLA-backed support",
                "Board-ready reporting",
            ],
            cta: "Contact Sales",
            href: "/request-demo",
            buttonStyle: "bg-white/10 text-white hover:bg-white/20 border border-white/20"
        },
    ];

    const faqs = [
        {
            question: "How is pricing calculated?",
            answer: `Pricing is seat-based with a minimum requirement of ${PRICING.STARTER.minSeats} seats to ensure complete organization-wide coverage and effective risk analysis.`,
        },
        {
            question: "Does this slow down employees?",
            answer: "No. Our visibility agents are lightweight and do not interfere with AI performance. Control features only trigger when high-risk policy violations occur.",
        },
        {
            question: "Do you store our prompts?",
            answer: "No. Specifically for Shield customers, all sensitive data detection and redaction happens locally before data ever leaves the employee's browser.",
        },
    ];

    return (
        <div className="bg-[#020617] text-white font-sans antialiased min-h-screen">
            <MarketingNav />

            <main className="pt-24 pb-20">
                {/* Hero Section */}
                <div className="max-w-4xl mx-auto px-6 text-center mb-20">
                    <h1 className="text-5xl md:text-[5rem] font-black tracking-tighter mb-8 text-white leading-[0.9]">
                        SECURE YOUR <br /><span className="text-blue-500">AI FOOTPRINT.</span>
                    </h1>
                    <p className="text-xl text-white/50 font-medium max-w-2xl mx-auto leading-relaxed">
                        Scale AI usage without the data risk. Choose a plan that fits your organization's security posture.
                    </p>
                </div>

                {/* Pricing Tiers */}
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="grid md:grid-cols-3 gap-8">
                        {tiers.map((tier) => (
                            <div
                                key={tier.name}
                                className={`relative flex flex-col h-full p-8 rounded-2xl border transition-all duration-300 ${tier.featured
                                    ? "bg-white/[0.03] border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.1)] -translate-y-2 z-10"
                                    : "bg-white/[0.01] border-white/10 hover:border-white/20"
                                    }`}
                            >
                                {tier.featured && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-purple-600 text-white text-[10px] font-black tracking-[0.2em] px-4 py-1.5 rounded-full uppercase shadow-lg">
                                        RECOMMENDED
                                    </div>
                                )}

                                <div className="mb-8">
                                    <h3 className="text-xs font-black tracking-[0.3em] uppercase text-white/40 mb-4">
                                        {tier.name}
                                    </h3>
                                    <div className="flex flex-col gap-1 mb-6">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-5xl font-black tracking-tighter text-white">{tier.displayPrice}</span>
                                            {tier.displayPrice !== "Custom" && <span className="text-white/40 text-sm font-bold uppercase">/mo</span>}
                                        </div>
                                        <p className="text-[11px] font-black uppercase tracking-widest text-blue-400 mt-2">
                                            {tier.priceDetails}
                                        </p>
                                    </div>
                                    <p className="text-sm text-white/60 font-medium leading-relaxed">
                                        {tier.description}
                                    </p>
                                </div>

                                <ul className="space-y-4 mb-10 flex-grow border-t border-white/5 pt-8">
                                    {tier.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-3 text-sm font-bold text-white/80">
                                            <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                                <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => handleCheckout(tier.name, tier.href)}
                                    disabled={loadingPlan === tier.name}
                                    className={`w-full py-4 px-6 rounded-xl text-center font-black uppercase tracking-widest text-xs transition-all active:scale-[0.98] disabled:opacity-50 ${tier.buttonStyle}`}
                                >
                                    {loadingPlan === tier.name ? "Redirecting..." : tier.cta}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* FAQ Section */}
                <div className="max-w-4xl mx-auto px-6 mt-32 border-t border-white/5 pt-20">
                    <div className="text-center mb-16 space-y-2">
                        <h2 className="text-xs font-black tracking-[0.3em] uppercase text-blue-500">Infrastructure</h2>
                        <h3 className="text-3xl font-black tracking-tight text-white">Common Questions</h3>
                    </div>

                    <div className="grid gap-12 md:grid-cols-1">
                        {faqs.map((faq, index) => (
                            <div key={index} className="bg-white/[0.02] p-8 rounded-2xl border border-white/5">
                                <h4 className="text-lg font-black text-white mb-4">
                                    {faq.question}
                                </h4>
                                <p className="text-white/40 font-medium leading-relaxed">
                                    {faq.answer}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <MarketingFooter />
        </div>
    );
}
