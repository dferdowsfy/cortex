"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme] = useState<Theme>("dark");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // ALWAYS force dark mode to ensure consistent premium aesthetic.
        // Light mode is deprecated due to incomplete visibility on many components.
        localStorage.setItem("theme", "dark");
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const root = window.document.documentElement;
        root.classList.remove("light");
        root.classList.add("dark");
    }, [mounted]);

    const toggleTheme = () => {
        // Manual toggle disabled to maintain brand aesthetic
        console.log("Light mode is disabled.");
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            <div className="dark">
                {children}
            </div>
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
