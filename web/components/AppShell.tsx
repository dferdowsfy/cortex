"use client";

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
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive
                ? "bg-brand-900 text-white"
                : "text-brand-100 hover:bg-brand-700 hover:text-white"
                }`}
        >
            {children}
        </Link>
    );
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, loading, signOut } = useAuth();

    // If on public routes like login, render without the main app shell
    if (pathname === "/login" || pathname === "/signup") {
        return <main className="min-h-screen bg-gray-50">{children}</main>;
    }

    // While loading auth state, show a minimal loading indicator
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
            </div>
        );
    }

    // If not logged in and not on login page, AuthProvider will redirect.
    // We can render null or a loading state here to prevent flash of content.
    if (!user) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Header ── */}
            <header className="no-print sticky top-0 z-50 bg-brand-800 shadow-lg">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                        </div>
                        <div>
                            <span className="text-lg font-bold text-white">Complyze</span>
                            <span className="ml-2 hidden text-xs text-brand-200 sm:inline">
                                AI Governance Platform
                            </span>
                        </div>
                    </Link>

                    <div className="flex items-center gap-4">
                        <nav className="hidden md:flex items-center gap-1">
                            <NavLink href="/">Dashboard</NavLink>
                            <NavLink href="/scan">Scan Tool</NavLink>
                            <NavLink href="/monitoring">Monitoring</NavLink>
                            <NavLink href="/report">Board Report</NavLink>
                            <NavLink href="/settings">Settings</NavLink>
                        </nav>

                        {/* User Profile / Logout */}
                        <div className="relative group">
                            <button
                                onClick={() => signOut()}
                                title="Sign Out"
                                className="flex items-center gap-2 rounded-full bg-brand-700 pl-3 pr-1 py-1 text-sm text-white hover:bg-brand-600 transition-colors"
                            >
                                <span className="text-xs font-medium max-w-[100px] truncate">
                                    {user.email?.split('@')[0]}
                                </span>
                                <div className="h-7 w-7 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold uppercase">
                                    {user.email?.[0]}
                                </div>
                            </button>
                        </div>
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
