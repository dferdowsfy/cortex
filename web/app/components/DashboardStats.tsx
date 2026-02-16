import React from "react";

interface DashboardStatsProps {
    total: number;
    critical: number;
    high: number;
    moderate: number;
    low: number;
}

export default function DashboardStats({
    total,
    critical,
    high,
    moderate,
    low,
}: DashboardStatsProps) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5 mb-10">
            <StatItem label="Total Assets" value={total} stripColor="bg-slate-300" />
            <StatItem label="Critical Risk" value={critical} stripColor="bg-red-500" valueColor="text-red-700" labelColor="text-red-600" />
            <StatItem label="High Risk" value={high} stripColor="bg-orange-500" valueColor="text-orange-700" labelColor="text-orange-600" />
            <StatItem label="Moderate Risk" value={moderate} stripColor="bg-amber-500" valueColor="text-amber-700" labelColor="text-amber-600" />
            <StatItem label="Low Risk" value={low} stripColor="bg-green-500" valueColor="text-green-700" labelColor="text-green-600" />
        </div>
    );
}

function StatItem({
    label,
    value,
    stripColor,
    valueColor = "text-gray-900",
    labelColor = "text-gray-400"
}: {
    label: string;
    value: number;
    stripColor: string;
    valueColor?: string;
    labelColor?: string;
}) {
    return (
        <div className="relative bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col items-center justify-center p-6 h-28">
            {/* Severity Strip */}
            <div className={`absolute top-0 left-0 bottom-0 w-1 ${stripColor}`} />

            <dt className={`truncate text-[10px] font-bold uppercase tracking-[0.15em] ${labelColor} mb-2`}>
                {label}
            </dt>
            <dd className={`text-4xl font-bold tracking-tight ${valueColor}`}>
                {value}
            </dd>
        </div>
    );
}
