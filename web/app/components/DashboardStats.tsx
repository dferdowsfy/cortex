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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 mb-8">
            <div className="bg-surface-light dark:bg-surface-dark overflow-hidden rounded border border-border-light dark:border-border-dark px-4 py-4 flex flex-col items-center justify-center">
                <dt className="truncate text-sm font-medium text-text-muted-light dark:text-text-muted-dark">
                    Total Tools
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-primary dark:text-white">
                    {total}
                </dd>
            </div>
            <div className="bg-surface-light dark:bg-surface-dark overflow-hidden rounded border border-border-light dark:border-border-dark px-4 py-4 flex flex-col items-center justify-center border-l-4 border-l-critical dark:border-l-critical">
                <dt className="truncate text-sm font-medium text-critical">
                    Critical Risk
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-critical">
                    {critical}
                </dd>
            </div>
            <div className="bg-surface-light dark:bg-surface-dark overflow-hidden rounded border border-border-light dark:border-border-dark px-4 py-4 flex flex-col items-center justify-center border-l-4 border-l-high dark:border-l-high">
                <dt className="truncate text-sm font-medium text-high">High Risk</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-high">
                    {high}
                </dd>
            </div>
            <div className="bg-surface-light dark:bg-surface-dark overflow-hidden rounded border border-border-light dark:border-border-dark px-4 py-4 flex flex-col items-center justify-center border-l-4 border-l-moderate dark:border-l-moderate">
                <dt className="truncate text-sm font-medium text-moderate">
                    Moderate Risk
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-moderate">
                    {moderate}
                </dd>
            </div>
            <div className="bg-surface-light dark:bg-surface-dark overflow-hidden rounded border border-border-light dark:border-border-dark px-4 py-4 flex flex-col items-center justify-center border-l-4 border-l-low dark:border-l-low">
                <dt className="truncate text-sm font-medium text-low">Low Risk</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-low">
                    {low}
                </dd>
            </div>
        </div>
    );
}
