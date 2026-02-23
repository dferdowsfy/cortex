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
    ChevronLeft
} from "lucide-react";

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
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 mt-auto">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
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
    { label: "Scan", href: "/scan", icon: ShieldCheck },
    { label: "Reports", href: "/report", icon: FileBarChart },
    { label: "Governance", href: "/governance", icon: Users },
];

export function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const pathname = usePathname();
    const { user, signOut } = useAuth();

    return (
        <div
            className={`flex flex-col h-full bg-[#09090b] border-r border-zinc-800 transition-all duration-300 ease-in-out ${collapsed ? 'w-[64px]' : 'w-[240px]'
                } py-6 z-50`}
        >
            {/* Logo area */}
            <div className="flex items-center justify-between px-4 mb-10">
                {!collapsed && (
                    <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-100 shrink-0">
                            <ShieldCheck size={16} />
                        </div>
                        <span className="text-lg font-bold text-zinc-50 tracking-tight whitespace-nowrap">Complyze</span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 transition-colors ${collapsed && "mx-auto"}`}
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-1.5 px-3">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive ? "bg-zinc-800/80 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                }`}
                            title={collapsed ? item.label : undefined}
                        >
                            <Icon size={20} className="shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                            {!collapsed && (
                                <span className={`text-sm tracking-wide ${isActive ? "font-semibold" : "font-medium"}`}>
                                    {item.label}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="px-3 flex flex-col gap-2 relative">
                <MonitoringToggle collapsed={collapsed} />

                <Link
                    href="/settings"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 mt-2`}
                    title={collapsed ? "Settings" : undefined}
                >
                    <Settings size={20} className="shrink-0" strokeWidth={2} />
                    {!collapsed && <span className="text-sm tracking-wide font-medium">Settings</span>}
                </Link>

                <div
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group cursor-pointer text-zinc-400 hover:text-red-400 hover:bg-red-950/30"
                    title={collapsed ? "Sign Out" : undefined}
                    onClick={signOut}
                >
                    <UserCircle size={20} className="shrink-0" strokeWidth={2} />
                    {!collapsed && (
                        <div className="flex flex-col">
                            <span className="text-sm tracking-wide font-medium text-zinc-300 group-hover:text-red-400">
                                {user?.email?.split('@')[0]}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

