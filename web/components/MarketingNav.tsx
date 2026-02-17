"use client";

import { useState } from "react";
import Link from "next/link";

export default function MarketingNav() {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-neutral-200 dark:border-neutral-800 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                        </div>
                        <Link href="/" className="font-bold text-lg tracking-tight text-neutral-800 dark:text-white">
                            Complyze
                        </Link>
                    </div>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center space-x-10">
                        <Link className="text-base font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary dark:hover:text-primary transition-colors" href="/platform">
                            Platform
                        </Link>
                        <Link className="text-base font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary dark:hover:text-primary transition-colors" href="/pricing">
                            Pricing
                        </Link>
                    </div>

                    {/* Auth Buttons - Always visible */}
                    <div className="flex items-center gap-3 sm:gap-6">
                        <Link
                            href="/login"
                            className="text-sm sm:text-base font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary dark:hover:text-primary transition-colors"
                        >
                            Sign In
                        </Link>
                        <Link
                            href="/login"
                            className="bg-primary hover:bg-primary/90 text-white text-sm sm:text-base font-semibold px-4 sm:px-5 py-2 sm:py-2.5 rounded shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
                        >
                            Request Demo
                        </Link>

                        {/* Mobile menu button */}
                        <button
                            className="md:hidden text-neutral-500 hover:text-neutral-800 dark:hover:text-white ml-1"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            aria-label="Toggle menu"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {mobileOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile menu dropdown */}
                {mobileOpen && (
                    <div className="md:hidden border-t border-neutral-200 dark:border-neutral-700 py-4 space-y-1">
                        <Link href="/platform" onClick={() => setMobileOpen(false)} className="block text-base font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary px-2 py-3">
                            Platform
                        </Link>
                        <Link href="/pricing" onClick={() => setMobileOpen(false)} className="block text-base font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary px-2 py-3">
                            Pricing
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
}
