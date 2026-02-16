"use client";

import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export default function PricingPage() {
    const tiers = [
        {
            name: "Starter",
            price: "$2,500",
            description: "For organizations starting their AI governance journey.",
            features: [
                "Up to 25 AI tools",
                "Structured assessments",
                "Governance registry",
                "Basic reporting",
                "Email support",
            ],
        },
        {
            name: "Growth",
            price: "$5,000",
            description: "Comprehensive governance for scaling AI environments.",
            features: [
                "Up to 100 AI tools",
                "Automated reassessments",
                "Governance gap tracking",
                "Audit trail history",
                "Role-based access controls",
                "Priority support",
            ],
            featured: true,
        },
        {
            name: "Enterprise",
            price: "Custom",
            description: "Full-scale governance automation for the enterprise.",
            features: [
                "Unlimited AI tools",
                "Advanced governance automation",
                "Custom control frameworks",
                "Dedicated onboarding",
                "Executive reporting suite",
                "SLA support",
            ],
        },
    ];

    return (
        <div className="bg-background-light dark:bg-background-dark text-neutral-800 dark:text-white font-display antialiased overflow-x-hidden min-h-screen">
            <MarketingNav />

            <main className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-20">
                        <h1 className="text-4xl font-bold mb-4">Enterprise AI Governance Pricing</h1>
                        <p className="text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
                            Choose the plan that fits your organization's governance needs.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {tiers.map((tier) => (
                            <div
                                key={tier.name}
                                className={`relative p-8 rounded-2xl border ${tier.featured
                                        ? "border-primary bg-primary/5 shadow-xl shadow-primary/5"
                                        : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50"
                                    } flex flex-col`}
                            >
                                {tier.featured && (
                                    <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full uppercase">
                                        Most Popular
                                    </div>
                                )}
                                <div className="mb-8">
                                    <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-bold">{tier.price}</span>
                                        {tier.price !== "Custom" && <span className="text-neutral-500 text-sm">/ month</span>}
                                    </div>
                                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-4 leading-relaxed">
                                        {tier.description}
                                    </p>
                                </div>
                                <ul className="space-y-4 mb-10 flex-grow">
                                    {tier.features.map((feature) => (
                                        <li key={feature} className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-300">
                                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href="/request-demo"
                                    className={`w-full py-3 px-4 rounded-lg text-center font-semibold transition-all ${tier.featured
                                            ? "bg-primary text-white hover:bg-primary/90"
                                            : "bg-neutral-800 dark:bg-neutral-700 text-white hover:bg-neutral-700 dark:hover:bg-neutral-600"
                                        }`}
                                >
                                    Request Demo
                                </Link>
                            </div>
                        ))}
                    </div>

                    <div className="mt-16 text-center">
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-center gap-2">
                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            All plans include secure data handling and structured audit records.
                        </p>
                    </div>
                </div>
            </main>

            <MarketingFooter />
        </div>
    );
}
