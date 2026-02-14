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
        <div className="bg-surface-light dark:bg-surface-dark shadow-sm rounded border border-border-light dark:border-border-dark overflow-hidden">
            <div className="px-6 py-5 border-b border-border-light dark:border-border-dark flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
                <h3 className="text-base font-semibold leading-6 text-text-main-light dark:text-white">
                    Detected Tools
                </h3>
                <div className="flex space-x-2">
                    <div className="relative rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <span className="material-icons text-gray-400 text-sm">
                                search
                            </span>
                        </div>
                        <input
                            type="text"
                            name="search"
                            id="search"
                            className="block w-full rounded border-0 py-1.5 pl-10 text-text-main-light dark:text-white dark:bg-surface-dark ring-1 ring-inset ring-gray-300 dark:ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                            placeholder="Filter tools..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>
            <ul role="list" className="divide-y divide-border-light dark:divide-border-dark">
                {filteredTools.length === 0 ? (
                    <li className="px-6 py-8 text-center text-sm text-text-muted-light dark:text-text-muted-dark">
                        No detected tools found matching your filter.
                    </li>
                ) : (
                    filteredTools.map((tool) => (
                        <li
                            key={tool.tool_name}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <div className="px-6 py-5 flex items-center justify-between">
                                <div className="min-w-0 flex-1 flex items-start">
                                    <div className="flex-shrink-0 pt-1">
                                        <div className="h-10 w-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                                {tool.tool_name.substring(0, 2).toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1 px-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="truncate text-sm font-medium text-text-main-light dark:text-white">
                                                {tool.tool_name}
                                            </p>
                                            <span className="inline-flex items-center rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                                {tool.source}
                                            </span>
                                        </div>
                                        <div className="flex items-center text-sm text-text-muted-light dark:text-text-muted-dark space-x-4">
                                            <span className="truncate">{tool.vendor}</span>
                                            <span className="text-gray-300 dark:text-gray-600">•</span>
                                            <span className="truncate text-xs">
                                                Last seen: Just now
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-text-muted-light dark:text-text-muted-dark opacity-70">
                                            {tool.detail || "Detected via system scan."}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-xs font-medium text-text-muted-light dark:text-text-muted-dark">
                                            Status
                                        </p>
                                        <p className="text-sm font-medium text-info-text dark:text-info-text-dark">
                                            Needs Assessment
                                        </p>
                                    </div>
                                    <Link
                                        href={`/scan?tool=${encodeURIComponent(
                                            tool.tool_name
                                        )}&vendor=${encodeURIComponent(
                                            tool.vendor
                                        )}&tier=${encodeURIComponent(tool.suggested_tier)}`}
                                        className="ml-4 rounded bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-primary dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Assess
                                    </Link>
                                    <button
                                        onClick={() => onDismiss(tool.tool_name)}
                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                        type="button"
                                    >
                                        <span className="material-icons text-lg">close</span>
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}
