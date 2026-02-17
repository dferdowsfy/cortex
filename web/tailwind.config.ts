import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        // Stitch Dashboard Colors
        primary: "#3b36db",
        "primary-hover": "#1F2933",
        "background-light": "#f6f6f8",
        "background-dark": "#111121",
        "surface-light": "#FFFFFF",
        "surface-dark": "#1E1E1E",
        "border-light": "#E4E6E8",
        "border-dark": "#333333",
        "text-main-light": "#111111",
        "text-main-dark": "#E0E0E0",
        "text-muted-light": "#5F6368",
        "text-muted-dark": "#9CA3AF",
        // Semantic colors
        critical: "#8A3C3C",
        high: "#C04D4D",
        moderate: "#8A6D3B",
        low: "#3E6B5C",
        "info-bg": "#FFF8E6",
        "info-text": "#8A6D3B",
        "info-bg-dark": "#3D3420",
        "info-text-dark": "#D4B475",
        // Neutral shades from landing page
        "neutral-100": "#f3f3fd",
        "neutral-200": "#e6e6f2",
        "neutral-300": "#cacadb",
        "neutral-500": "#8c8ca3",
        "neutral-800": "#2a2a35",
      },
      borderRadius: {
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
