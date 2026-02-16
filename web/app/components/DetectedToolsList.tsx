import React, { useState } from "react";
import Link from "next/link";

interface DiscoveredTool {
    tool_name: string;
    vendor: string;
    suggested_tier: string;
    source: string;
    detail: string;
    confidence: string;
}

interface DetectedToolsListProps {
    tools: DiscoveredTool[];
    onDismiss: (toolName: string) => void;
}

export default function DetectedToolsList({
    tools,
    onDismiss,
}: DetectedToolsListProps) {
    const [searchTerm, setSearchTerm] = useState("");

    const filteredTools = tools.filter(
        (tool) =>
            tool.tool_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tool.vendor.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
                    System Discovery Feed
                </h3>
                <div className="relative w-full sm:w-64">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        className="block w-full rounded-lg border-gray-200 py-1.5 pl-10 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:ring-brand-500"
                        placeholder="Search findings..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="divide-y divide-gray-100">
                {filteredTools.length === 0 ? (
                    <div className="px-8 py-16 text-center">
                        <p className="text-sm font-medium text-gray-500">No matching discoveries found.</p>
                    </div>
                ) : (
                    filteredTools.map((tool) => (
                        <div
                            key={tool.tool_name}
                            className="group hover:bg-gray-50/50 transition-colors px-8 py-6 flex items-center justify-between"
                        >
                            <div className="min-w-0 flex-1 flex items-start gap-5">
                                <div className="flex-shrink-0">
                                    <div className="h-12 w-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center font-bold text-gray-400 text-xs shadow-sm group-hover:border-gray-300 transition-colors uppercase">
                                        {tool.tool_name.substring(0, 2)}
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <p className="truncate text-base font-bold text-gray-900 tracking-tight">
                                            {tool.tool_name}
                                        </p>
                                        <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200 uppercase tracking-wider">
                                            {tool.source}
                                        </span>
                                    </div>
                                    <div className="flex items-center text-sm font-medium text-gray-500 gap-4">
                                        <span>{tool.vendor}</span>
                                        <span className="h-1 w-1 rounded-full bg-gray-300" />
                                        <span className="text-xs">Detected via System Scan</span>
                                    </div>
                                    <p className="mt-2 text-xs text-gray-400 leading-relaxed font-medium max-w-2xl">
                                        {tool.detail || "Uncategorized AI service identified in host telemetry. Requires authorization assessment."}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 ml-10">
                                <div className="text-right hidden md:block">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Authorize</p>
                                    <p className="text-sm font-bold text-amber-600">Needs Scan</p>
                                </div>
                                <Link
                                    href={`/scan?tool=${encodeURIComponent(tool.tool_name)}&vendor=${encodeURIComponent(tool.vendor)}&tier=${encodeURIComponent(tool.suggested_tier)}`}
                                    className="rounded-lg bg-white px-5 py-2 text-sm font-bold text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-50 transition-all font-sans"
                                >
                                    Assess
                                </Link>
                                <button
                                    onClick={() => onDismiss(tool.tool_name)}
                                    className="p-2 text-gray-300 hover:text-gray-500 transition-colors"
                                >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
