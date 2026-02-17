"use client";

interface DeploymentGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DeploymentGuideModal({ isOpen, onClose }: DeploymentGuideModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 tracking-tight">Agent Deployment Guide</h3>
                        <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-widest">Enterprise Infrastructure Setup</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 font-sans">
                    <div className="space-y-10">
                        {/* Step 1 */}
                        <section>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm">1</div>
                                <h4 className="text-lg font-bold text-gray-900">Installation Execution</h4>
                            </div>
                            <div className="pl-12">
                                <p className="text-gray-600 leading-relaxed text-sm">
                                    Execute the signed installer package on the target workstation. For mass deployment via MDM (Jamf, InTune), use the provided command-line flags for silent install.
                                </p>
                                <div className="mt-4 p-4 bg-gray-900 rounded-lg font-mono text-xs text-white border border-gray-800 shadow-inner">
                                    ./complyze-agent-installer.sh --silent --org-id=CORP_001
                                </div>
                            </div>
                        </section>

                        {/* Step 2 */}
                        <section>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm">2</div>
                                <h4 className="text-lg font-bold text-gray-900">Certificate Trust Validation</h4>
                            </div>
                            <div className="pl-12">
                                <p className="text-gray-600 leading-relaxed text-sm">
                                    The agent installs a local CA certificate to support HTTPS deep packet inspection. User authorization is required for the OS keychain update during the first launch.
                                </p>
                                <ul className="mt-3 space-y-2 text-sm text-gray-500 list-disc pl-4 font-medium">
                                    <li>Supports standard browser engines (Chromium, Firefox, Safari)</li>
                                    <li>Integrates with system-level proxy settings</li>
                                    <li>Requires port 8080 to be available for localized routing</li>
                                </ul>
                            </div>
                        </section>

                        {/* Step 3 */}
                        <section>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm">3</div>
                                <h4 className="text-lg font-bold text-gray-900">Proxy Configuration</h4>
                            </div>
                            <div className="pl-12">
                                <p className="text-gray-600 leading-relaxed text-sm">
                                    All AI traffic is routed through the local proxy at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">127.0.0.1:8080</code>. This ensures that prompts are analyzed before reaching upstream providers (OpenAI, Anthropic, etc.).
                                </p>
                            </div>
                        </section>

                        {/* Troubleshooting */}
                        <section className="bg-orange-50/50 border border-orange-100 rounded-xl p-6">
                            <h5 className="text-sm font-bold text-orange-800 uppercase tracking-wider mb-3">Troubleshooting</h5>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="h-5 w-5 rounded-full bg-orange-100 flex items-center justify-center mt-0.5">
                                        <span className="text-orange-600 text-xs font-bold">?</span>
                                    </div>
                                    <p className="text-sm text-orange-700 font-medium">
                                        If the agent status remains "Offline", ensure the workstation can reach the dashboard API and that port 8080 is not blocked by a secondary firewall.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <div className="px-8 py-6 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-gray-900 hover:bg-black text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all font-sans"
                    >
                        Understood
                    </button>
                </div>
            </div>
        </div>
    );
}
