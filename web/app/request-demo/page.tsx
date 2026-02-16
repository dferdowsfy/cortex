"use client";

import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import { useState } from "react";

export default function RequestDemoPage() {
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-neutral-800 dark:text-white font-display antialiased overflow-x-hidden min-h-screen">
            <MarketingNav />

            <main className="py-24">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl font-bold mb-4">Request a Demo</h1>
                        <p className="text-neutral-500 dark:text-neutral-400">
                            Transform your enterprise AI governance. Let us show you how.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 lg:p-12 shadow-sm">
                        {submitted ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-bold mb-2">Thank you!</h3>
                                <p className="text-neutral-500 dark:text-neutral-400">
                                    Our team will be in touch shortly to schedule your personalized demo.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="name" className="block text-sm font-medium mb-2">Full Name</label>
                                        <input
                                            type="text"
                                            id="name"
                                            required
                                            className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                            placeholder="Jane Doe"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="email" className="block text-sm font-medium mb-2">Work Email</label>
                                        <input
                                            type="email"
                                            id="email"
                                            required
                                            className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                            placeholder="jane@company.com"
                                        />
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="company" className="block text-sm font-medium mb-2">Company Name</label>
                                        <input
                                            type="text"
                                            id="company"
                                            required
                                            className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                            placeholder="Acme Corp"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="role" className="block text-sm font-medium mb-2">Role</label>
                                        <input
                                            type="text"
                                            id="role"
                                            required
                                            className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                            placeholder="e.g. CISO, Compliance Manager"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="message" className="block text-sm font-medium mb-2">How can we help?</label>
                                    <textarea
                                        id="message"
                                        rows={4}
                                        className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                        placeholder="Tell us about your governance goals..."
                                    ></textarea>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 px-6 rounded-lg transition-all shadow-lg shadow-primary/20"
                                >
                                    Send Request
                                </button>
                                <p className="text-[10px] text-neutral-400 text-center">
                                    By clicking "Send Request", you agree to our privacy policy and terms of service.
                                </p>
                            </form>
                        )}
                    </div>
                </div>
            </main>

            <MarketingFooter />
        </div>
    );
}
