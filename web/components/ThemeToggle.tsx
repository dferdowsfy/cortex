"use client";

import { useTheme } from "@/lib/theme-context";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ collapsed }: { collapsed: boolean }) {
    const { theme, toggleTheme } = useTheme();

    if (collapsed) {
        return (
            <button
                onClick={toggleTheme}
                className="p-2 flex justify-center items-center w-full relative group hover:bg-zinc-800 transition-colors rounded-lg text-white/50 hover:text-white"
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
        );
    }

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/50 hover:text-white hover:bg-zinc-800 transition-all group"
        >
            {theme === "dark" ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
            <span className="text-sm font-medium tracking-wide">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
        </button>
    );
}
