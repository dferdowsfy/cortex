"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useUserSettings } from "@/lib/hooks/use-user-settings";

import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, loading, signOut } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        <div className="flex h-screen overflow-hidden bg-[var(--bg-page)]">
            {/* ── Sidebar ── */}
            <Sidebar />

            {/* ── Main Content ── */}
            <main className="flex-1 overflow-y-auto">
                <div className={`${normalizedPath === "/dashboard" || normalizedPath === "/governance" ? "" : "mx-auto max-w-7xl px-6 py-8"}`}>
                    {children}
                </div>
            </main>
        </div>
    );
}
