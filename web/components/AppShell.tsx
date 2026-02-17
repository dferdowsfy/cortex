"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function NavLink({
    href,
    children,
}: {
    href: string;
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isActive = pathname === href;

    return (
        <Link
            href={href}
            className={`relative px-1 py-5 text-[14px] font-medium transition-all duration-200 ${isActive
                ? "text-white"
                : "text-white/60 hover:text-white/90"
                }`}
        >
            {children}
            {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-full" />
            )}
        </Link>
    );
}

function UserDropdown({ user, signOut }: { user: { email: string | null }; signOut: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2.5 py-1 text-sm text-white/70 hover:text-white transition-colors"
            >
                <div className="h-7 w-7 rounded-full bg-white/15 flex items-center justify-center text-[11px] font-semibold text-white uppercase">
                    {user.email?.[0]}
                </div>
                <span className="text-[13px] font-medium hidden sm:inline">
                    {user.email?.split('@')[0]}
                </span>
                <svg className="h-3.5 w-3.5 text-white/40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-44 rounded-lg bg-white border border-gray-200 shadow-lg py-1 z-50">
                    <Link
                        href="/settings"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                    </Link>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                        onClick={() => { setOpen(false); signOut(); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, loading, signOut } = useAuth();

    // Normalize pathname to remove trailing slashes for consistent matching
    const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/$/, "");

    // If on public routes like login, render without the main app shell
    if (
        normalizedPath === "/" ||
        normalizedPath === "/platform" ||
        normalizedPath === "/pricing" ||
        normalizedPath === "/request-demo" ||
        normalizedPath === "/login" ||
        normalizedPath === "/signup" ||
        normalizedPath === "/install"
    ) {
        return <main className="min-h-screen">{children}</main>;
    }

    // While loading auth state, show a minimal loading indicator
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Header ── */}
            <header className="no-print sticky top-0 z-50 bg-[#1e1b4b] border-b border-white/[0.08]">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
                    {/* Left: Logo */}
                    <Link href="/dashboard" className="flex items-center gap-2.5 py-4">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-white">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                        </div>
                        <span className="text-[15px] font-semibold text-white">Complyze</span>
                        <span className="hidden sm:inline text-[11px] text-white/30 font-medium ml-0.5">
                            AI Governance Platform
                        </span>
                    </Link>

                    {/* Center: Navigation tabs */}
                    <nav className="hidden md:flex items-center gap-7">
                        <NavLink href="/dashboard">Dashboard</NavLink>
                        <NavLink href="/scan">Scan Tool</NavLink>
                        <NavLink href="/monitoring">Monitoring</NavLink>
                        <NavLink href="/report">Board Report</NavLink>
                        <NavLink href="/settings">Settings</NavLink>
                    </nav>

                    {/* Right: Deploy + User */}
                    <div className="flex items-center gap-5">
                        <Link
                            href="/install"
                            className="hidden lg:inline-flex items-center gap-1.5 text-[12px] font-medium text-white/40 hover:text-white/70 transition-colors"
                        >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Deploy Agent
                        </Link>

                        <div className="h-5 w-px bg-white/10 hidden lg:block" />

                        <UserDropdown user={user} signOut={signOut} />
                    </div>
                </div>
            </header>

            {/* ── Main Content ── */}
            <main className="mx-auto max-w-7xl px-6 py-8">
                {children}
            </main>
        </div>
    );
}
