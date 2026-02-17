"use client";

import Link from "next/link";

/* ── Discovery Feed (Simplified) ─────────────────────────────────
   Clean alert box: "Unassessed AI Services Detected (N)"
   Single CTA: [ Review & Assess ]
   No dense paragraphs. No long explanations. */

interface DiscoveryFeedProps {
    count: number;
}

export default function DiscoveryFeed({ count }: DiscoveryFeedProps) {
    if (count === 0) return null;

    return (
        <section className="bg-white border border-amber-200 rounded-lg p-6 mb-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
                    <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                </div>
                <div>
                    <p className="text-sm font-semibold text-gray-900">
                        Unassessed AI Services Detected ({count})
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">New services require governance classification</p>
                </div>
            </div>
            <Link
                href="/scan"
                className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
            >
                Review &amp; Assess
            </Link>
        </section>
    );
}
