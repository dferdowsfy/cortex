"use client";

import { useEffect, useRef, useState } from "react";

/* ── Risk Posture Snapshot ────────────────────────────────────────
   Large typography stat cards with subtle severity accent bars.
   No gradients, no shadows, white bg, minimal border. */

interface RiskPostureProps {
    total: number;
    critical: number;
    high: number;
    moderate: number;
    low: number;
    onFilter?: (tier: string | null) => void;
    activeTier?: string | null;
}

function AnimatedNumber({ value }: { value: number }) {
    const [display, setDisplay] = useState(0);
    const ref = useRef<number>(0);

    useEffect(() => {
        const start = ref.current;
        const diff = value - start;
        if (diff === 0) return;
        const duration = 600;
        const startTime = performance.now();

        function tick(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + diff * eased);
            setDisplay(current);
            if (progress < 1) requestAnimationFrame(tick);
            else ref.current = value;
        }
        requestAnimationFrame(tick);
    }, [value]);

    return <>{display}</>;
}

function PostureCard({
    label,
    value,
    accent,
    valueColor = "text-gray-900",
    active,
    onClick,
}: {
    label: string;
    value: number;
    accent: string;
    valueColor?: string;
    active?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`relative bg-white border rounded-lg overflow-hidden flex flex-col items-start p-6 h-[120px] w-full text-left transition-all duration-200 hover:border-gray-300 ${active ? "ring-2 ring-brand-500 border-brand-300" : "border-gray-200"
                }`}
        >
            <div className={`absolute top-0 left-0 right-0 h-[3px] ${accent}`} />
            <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase mb-auto">
                {label}
            </p>
            <p className={`text-[48px] leading-none font-bold tracking-tight ${valueColor}`}>
                <AnimatedNumber value={value} />
            </p>
        </button>
    );
}

export default function RiskPostureSnapshot({
    total,
    critical,
    high,
    moderate,
    low,
    onFilter,
    activeTier,
}: RiskPostureProps) {
    return (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            <PostureCard
                label="Total AI Assets"
                value={total}
                accent="bg-gray-300"
                active={activeTier === null}
                onClick={() => onFilter?.(null)}
            />
            <PostureCard
                label="Critical Risk"
                value={critical}
                accent="bg-red-500"
                valueColor="text-red-700"
                active={activeTier === "critical"}
                onClick={() => onFilter?.("critical")}
            />
            <PostureCard
                label="High Risk"
                value={high}
                accent="bg-orange-500"
                valueColor="text-orange-700"
                active={activeTier === "high"}
                onClick={() => onFilter?.("high")}
            />
            <PostureCard
                label="Moderate Risk"
                value={moderate}
                accent="bg-amber-400"
                valueColor="text-amber-700"
                active={activeTier === "moderate"}
                onClick={() => onFilter?.("moderate")}
            />
            <PostureCard
                label="Low Risk"
                value={low}
                accent="bg-green-500"
                valueColor="text-green-700"
                active={activeTier === "low"}
                onClick={() => onFilter?.("low")}
            />
        </section>
    );
}
