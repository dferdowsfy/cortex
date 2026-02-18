"use client";

import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export default function PricingPage() {
    const tiers = [
        {
            name: "VISIBILITY",
            tagline: "See Your AI Exposure",
            displayPrice: "$700",
            priceDetails: "$7 per employee / month · Minimum 100 employees · Billed annually",
            description: "Monitor AI usage and understand your exposure risk.",
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
            href: "/request-demo",
        },
        {
            name: "CONTROL",
            tagline: "See It. Score It. Stop It.",
            displayPrice: "$1,200",
            priceDetails: "$12 per employee / month · Minimum 100 employees · Billed annually",
            description: "Full monitoring plus real-time enforcement.",
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
            href: "/request-demo",
            featured: true,
        },
        {
            name: "ENTERPRISE",
            tagline: "Institutional AI Governance",
            displayPrice: "Custom",
            priceDetails: "Tailored for organization-wide scale",
            description: "Institutional AI governance for complex organizations.",
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
        },
    ];

    const faqs = [
        {
            question: "How is pricing calculated?",
            answer: "Pricing is based on total employees to ensure complete coverage.",
        },
        {
            question: "Does this slow down employees?",
            answer: "Visibility does not interfere. Control only blocks high-risk activity.",
        },
        {
            question: "Do you store our prompts?",
            answer: "No. Sensitive data detection is processed securely and locally when possible.",
        },
    ];

    return (
        <div className="bg-[#111121] text-white font-sans antialiased min-h-screen">
            <MarketingNav />

            <main className="pt-16 pb-12">
                {/* Hero Section */}
                <div className="max-w-4xl mx-auto px-6 text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-white">
                        Simple AI Risk Monitoring for Mid-Market Teams
                    </h1>
                    <p className="text-xl text-white/70 leading-relaxed">
                        Complyze monitors AI usage across desktop and browser apps, scores exposure risk, and optionally blocks sensitive activity — without slowing teams down.
                    </p>
                </div>

                {/* Pricing Tiers */}
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="grid md:grid-cols-3 gap-8">
                        {tiers.map((tier) => (
                            <div
                                key={tier.name}
                                className={`relative flex flex-col h-full p-6 rounded-xl border border-white/10 transition-all duration-200 ${tier.featured
                                    ? "bg-white/[0.02] shadow-2xl ring-1 ring-white/20 -translate-y-2 z-10"
                                    : "bg-transparent hover:border-white/20"
                                    }`}
                            >
                                {tier.featured && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#3B36DB] text-white text-[10px] font-bold tracking-widest px-3 py-1 rounded-full uppercase">
                                        Most Popular
                                    </div>
                                )}

                                <div className="mb-5 text-center sm:text-left">
                                    <h3 className="text-sm font-bold tracking-widest uppercase text-white/50 mb-2">
                                        {tier.name}
                                    </h3>
                                    <p className="text-lg font-medium text-white mb-6">
                                        {tier.tagline}
                                    </p>
                                    <div className="flex flex-col">
                                        <div className="flex items-baseline gap-2 justify-center sm:justify-start">
                                            <span className="text-5xl font-bold tracking-tight">{tier.displayPrice}</span>
                                            {tier.displayPrice !== "Custom" && <span className="text-white/50 text-sm">/ month</span>}
                                        </div>
                                        <p className="text-[13px] text-white/40 mt-1 leading-relaxed">
                                            {tier.priceDetails}
                                        </p>
                                    </div>
                                    <p className="text-sm text-white/70 mt-4 font-medium">
                                        {tier.description}
                                    </p>
                                </div>

                                <ul className="space-y-3 mb-8 flex-grow border-t border-white/5 pt-5">
                                    {tier.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-3 text-sm text-white/80">
                                            <svg className="w-5 h-5 text-[#3B36DB] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href={tier.href}
                                    className="w-full py-3 px-6 rounded-lg text-center font-bold tracking-wide bg-[#3B36DB] text-white hover:bg-[#4d48ef] transition-all duration-200"
                                >
                                    {tier.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>

                {/* FAQ Section */}
                <div className="max-w-3xl mx-auto px-6 mt-16 border-t border-white/5 pt-12">
                    <h2 className="text-2xl font-bold text-center mb-8 text-white">Frequently Asked Questions</h2>
                    <div className="grid gap-12 sm:grid-cols-1">
                        {faqs.map((faq, index) => (
                            <div key={index}>
                                <h4 className="text-lg font-bold text-white mb-2">
                                    {index + 1}. {faq.question}
                                </h4>
                                <p className="text-white/70 leading-relaxed">
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
