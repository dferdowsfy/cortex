"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import {
    LayoutDashboard,
    Activity,
    ShieldCheck,
    FileBarChart,
    Users,
    Settings,
    UserCircle,
    ChevronRight,
    ChevronLeft,
    Sun,
    Moon
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

function MonitoringToggle({ collapsed }: { collapsed: boolean }) {
    const { settings, saveSettings, loading, user } = useUserSettings();
    const [toggling, setToggling] = useState(false);
    const [toggleError, setToggleError] = useState("");

    if (loading) return null;

    const enabled = settings.proxyEnabled;

    async function handleToggle() {
        if (toggling) return;
        setToggling(true);
        setToggleError("");
        const newState = !enabled;

        try {
            await saveSettings({ proxyEnabled: newState });
            const res = await fetch("/api/proxy/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    proxy_enabled: newState,
                    workspaceId: user?.uid || "default",
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const errMsg = data.error || "Failed to update proxy";
                console.error("[MonitoringToggle] Backend error:", errMsg);
                setToggleError(errMsg);
                await saveSettings({ proxyEnabled: !newState });
            }
        } catch (err: any) {
            console.error("[MonitoringToggle] Toggle error:", err);
            setToggleError(err.message || "Connection error");
            await saveSettings({ proxyEnabled: !newState });
        } finally {
            setToggling(false);
        }
    }

    if (collapsed) {
        return (
            <div className={`p-2 flex justify-center items-center w-full relative group cursor-pointer`} onClick={handleToggle}>
                <span className={`w-3 h-3 rounded-full shadow-lg transition-all ${enabled ? "bg-emerald-400 shadow-emerald-400/50" : "bg-zinc-600"}`} />
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 dark:bg-zinc-800/50 border border-zinc-700/50 mt-auto">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-[0.15em]">
                AI Shield Active
            </span>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleToggle}
                    disabled={toggling}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toggling ? "cursor-wait opacity-60" : "cursor-pointer"
                        } ${enabled ? "bg-emerald-500" : "bg-zinc-600"}`}
                >
                    <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? "translate-x-4" : "translate-x-0"
                            }`}
                    />
                </button>
            </div>
            {toggleError && (
                <span className="absolute bottom-0 text-[10px] text-red-400 max-w-[120px] truncate" title={toggleError}>
                    ⚠ {toggleError}
                </span>
            )}
        </div>
    );
}

const NAV_ITEMS = [
    { label: "Home", href: "/dashboard", icon: LayoutDashboard },
    { label: "Monitor", href: "/monitoring", icon: Activity },
    { label: "Assess", href: "/scan", icon: ShieldCheck },
    { label: "Governance", href: "/governance", icon: Users },
];

export function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const pathname = usePathname();
    const { user, signOut } = useAuth();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setUserMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div
            className={`flex flex-col h-full bg-[var(--bg-sidebar)] border-r border-[var(--border-main)] transition-all duration-300 ease-in-out ${collapsed ? 'w-[72px]' : 'w-[260px]'
                } py-8 z-50`}
        >
            {/* Logo area */}
            <div className="flex items-center justify-between px-6 mb-12">
                {!collapsed && (
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-color)] text-white shadow-lg shadow-blue-500/20 shrink-0">
                            <ShieldCheck size={20} strokeWidth={2.5} />
                        </div>
                        <span className="text-xl font-bold text-[var(--text-primary)] tracking-tight whitespace-nowrap">Complyze</span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`p-2 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] transition-colors ${collapsed && "mx-auto"}`}
                >
                    {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-2 px-4">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                ? "bg-white dark:bg-slate-800 text-[var(--brand-color)] shadow-sm border border-[var(--border-main)]"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                                }`}
                            title={collapsed ? item.label : undefined}
                        >
                            <Icon size={22} className="shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                            {!collapsed && (
                                <span className={`text-[15px] tracking-tight ${isActive ? "font-bold" : "font-semibold"}`}>
                                    {item.label}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="px-3 flex flex-col gap-2 relative mt-auto border-t border-[var(--border-main)] pt-6">
                <MonitoringToggle collapsed={collapsed} />

                <div className="relative mt-1 mb-1" ref={menuRef}>
                    <div
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group cursor-pointer ${userMenuOpen ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'}`}
                        title={collapsed ? "User Menu" : undefined}
                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                    >
                        <UserCircle size={20} className="shrink-0" strokeWidth={2} />
                        {!collapsed && (
                            <div className="flex flex-col flex-1 overflow-hidden opacity-100 transition-opacity">
                                <span className="text-sm tracking-wide font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate">
                                    {user?.email?.split('@')[0] || "Profile"}
                                </span>
                            </div>
                        )}
                    </div>

                    {userMenuOpen && (
                        <div className={`absolute mb-2 w-48 rounded-xl bg-[var(--bg-card)] border border-[var(--border-main)] shadow-xl py-1 z-50 overflow-hidden ${collapsed ? 'bottom-0 left-16' : 'bottom-full left-0'}`}>
                            <Link
                                href="/settings"
                                className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition-colors"
                                onClick={() => setUserMenuOpen(false)}
                            >
                                <Settings size={14} className="shrink-0" />
                                User Settings
                            </Link>
                            <button
                                onClick={() => {
                                    setUserMenuOpen(false);
                                    signOut();
                                }}
                                className="flex items-center w-full gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                            >
                                <UserCircle size={14} className="shrink-0" />
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

