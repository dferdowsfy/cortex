"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import {
    LayoutDashboard,
    ShieldCheck,
    Settings,
    UserCircle,
    ChevronRight,
    ChevronLeft,
    Layers,
} from "lucide-react";

const NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Manage", href: "/admin", icon: Layers },
    { label: "Settings", href: "/settings", icon: Settings },
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
            className={`flex flex-col h-full bg-[var(--bg-sidebar)] border-r border-[var(--border-main)] transition-all duration-300 ease-in-out sidebar-fix ${collapsed ? 'w-[72px]' : 'w-[260px]'
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

