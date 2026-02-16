"use client";

import { useState } from "react";

interface RegisterToolModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function RegisterToolModal({ isOpen, onClose, onSuccess }: RegisterToolModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        tool_name: "",
        vendor: "",
        category: "Generative AI",
        deployment_type: "SaaS",
        owner: "",
        risk_tier: "moderate",
        notes: "",
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const res = await fetch("/api/tools/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    governance_status: "pending",
                }),
            });

            if (!res.ok) throw new Error("Failed to register tool");

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">Register AI Tool</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded border border-red-100">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tool Name</label>
                            <input
                                required
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand-500 focus:ring-brand-500"
                                placeholder="e.g. ChatGPT, Claude"
                                value={form.tool_name}
                                onChange={e => setForm({ ...form, tool_name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Vendor</label>
                            <input
                                required
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand-500 focus:ring-brand-500"
                                placeholder="e.g. OpenAI"
                                value={form.vendor}
                                onChange={e => setForm({ ...form, vendor: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Category</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand-500 focus:ring-brand-500"
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                            >
                                <option>Generative AI</option>
                                <option>Developer Tools</option>
                                <option>Analytics</option>
                                <option>Marketing</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Deployment</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand-500 focus:ring-brand-500"
                                value={form.deployment_type}
                                onChange={e => setForm({ ...form, deployment_type: e.target.value })}
                            >
                                <option>SaaS</option>
                                <option>Self-Hosted</option>
                                <option>On-Premise</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Initial Risk</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand-500 focus:ring-brand-500"
                                value={form.risk_tier}
                                onChange={e => setForm({ ...form, risk_tier: e.target.value as any })}
                            >
                                <option value="low">Low</option>
                                <option value="moderate">Moderate</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Owner / Department</label>
                            <input
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand-500 focus:ring-brand-500"
                                placeholder="e.g. Engineering, Marketing"
                                value={form.owner}
                                onChange={e => setForm({ ...form, owner: e.target.value })}
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Governance Notes</label>
                            <textarea
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand-500 focus:ring-brand-500 h-24"
                                placeholder="Any specific requirements or risk considerations..."
                                value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="mt-8 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={submitting}
                            type="submit"
                            className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 ring-offset-2"
                        >
                            {submitting ? "Registering..." : "Register Tool"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
