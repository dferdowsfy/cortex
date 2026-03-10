"use client";

import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export default function LandingPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark text-neutral-800 dark:text-white font-display antialiased overflow-x-hidden min-h-screen flex flex-col">
      <MarketingNav />

      {/* Main Hero Section */}
      <main className="relative pt-20 pb-28 lg:pt-32 lg:pb-48 overflow-hidden flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-8 items-center">
            {/* Left Column: Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-primary/10 border border-primary/20 text-[#4ADE80] text-base font-semibold mb-10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ADE80] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4ADE80]"></span>
                </span>
                Now Supporting ChatGPT, Gemini & Claude
              </div>
              <h1 className="text-4xl sm:text-6xl lg:text-[4.75rem] font-semibold tracking-tight text-neutral-800 dark:text-white leading-[1.15] mb-8">
                Stop blocking AI. <br />
                <span className="text-[#7261fd] font-medium">Start using it safely.</span>
              </h1>
              <p className="text-xl text-neutral-600 dark:text-neutral-400 mb-10 leading-relaxed max-w-xl">
                Complyze protects sensitive data, monitors AI activity, and applies smart policies so teams can use AI with confidence.
              </p>
              <div className="flex flex-col sm:flex-row gap-5 mb-16">
                <Link
                  href="/request-demo"
                  className="bg-primary hover:bg-primary/90 text-white text-lg font-semibold px-8 py-4 rounded-lg shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  Request Demo
                </Link>
              </div>
              {/* Trust Indicators */}
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Trusted by Security & Compliance Teams
                </p>
                <div className="flex flex-wrap gap-8 items-center opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                  <div className="h-6 w-24 bg-neutral-200 dark:bg-neutral-800 rounded opacity-50" />
                  <div className="h-5 w-32 bg-neutral-200 dark:bg-neutral-800 rounded opacity-50" />
                  <div className="h-6 w-28 bg-neutral-200 dark:bg-neutral-800 rounded opacity-50" />
                  <div className="h-5 w-26 bg-neutral-200 dark:bg-neutral-800 rounded opacity-50" />
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Dashboard Graphic */}
            <div className="relative lg:ml-auto w-full max-w-[600px]">
              <div className="absolute -top-20 -right-20 w-[500px] h-[500px] bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
              <div className="relative bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                  </div>
                </div>
                <div className="p-1 bg-neutral-50 dark:bg-neutral-900/50">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-700 mb-2">
                    <div className="col-span-5">AI Inventory</div>
                    <div className="col-span-3">Governance</div>
                    <div className="col-span-4 text-right">Owner</div>
                  </div>
                  <div className="space-y-2 h-[380px] overflow-y-auto p-2 scrollbar-hide">
                    {/* Item 1 */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <div className="text-sm font-semibold text-neutral-800 dark:text-white">Code Gen V2</div>
                          <div className="text-[10px] text-neutral-500">LLM Provider</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">Active</span>
                        </div>
                        <div className="col-span-4 text-right text-xs text-neutral-600">Engineering</div>
                      </div>
                    </div>
                    {/* Item 2 */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <div className="text-sm font-semibold text-neutral-800 dark:text-white">Claude Pro</div>
                          <div className="text-[10px] text-neutral-500">Anthropic</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">Assessing</span>
                        </div>
                        <div className="col-span-4 text-right text-xs text-neutral-600">Legal</div>
                      </div>
                    </div>
                    {/* Item 3 */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <div className="text-sm font-semibold text-neutral-800 dark:text-white">Gemini Ent</div>
                          <div className="text-[10px] text-neutral-500">Google</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">Approved</span>
                        </div>
                        <div className="col-span-4 text-right text-xs text-neutral-600">Operations</div>
                      </div>
                    </div>
                    {/* Item 4 */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm opacity-50">
                      <div className="grid grid-cols-12 gap-2 items-center text-neutral-400">
                        <div className="col-span-5">M365 Copilot</div>
                        <div className="col-span-3">Pending</div>
                        <div className="col-span-4 text-right text-xs text-neutral-500 tracking-tighter">Sales</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-200 dark:via-neutral-800 to-transparent"></div>
      </main>

      <section className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-neutral-800 dark:text-white mb-6 tracking-tight">
              Use AI Safely. Stay in Control.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="flex flex-col gap-6 group p-8 rounded-3xl bg-gradient-to-b from-neutral-800/20 to-transparent border border-neutral-800/50 hover:border-blue-500/30 transition-all duration-500 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-blue-500/10 transition-all duration-500"></div>
              <div className="w-14 h-14 flex items-center justify-center bg-blue-500/10 rounded-xl text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)] group-hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all duration-300 border border-blue-500/20 relative z-10">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="relative z-10">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-white mb-3">Shield Extension</h3>
                <p className="text-base text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Protect AI conversations in real time. Detect, redact, or block sensitive data before it’s shared with AI tools.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col gap-6 group p-8 rounded-3xl bg-gradient-to-b from-neutral-800/20 to-transparent border border-neutral-800/50 hover:border-violet-500/30 transition-all duration-500 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-violet-500/10 transition-all duration-500"></div>
              <div className="w-14 h-14 flex items-center justify-center bg-violet-500/10 rounded-xl text-violet-400 shadow-[0_0_20px_rgba(167,139,250,0.15)] group-hover:shadow-[0_0_30px_rgba(167,139,250,0.3)] transition-all duration-300 border border-violet-500/20 relative z-10">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="relative z-10">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-white mb-3">Smart Risk Insights</h3>
                <p className="text-base text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Understand how AI is being used across your team with simple risk scoring and visibility into sensitive prompts.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col gap-6 group p-8 rounded-3xl bg-gradient-to-b from-neutral-800/20 to-transparent border border-neutral-800/50 hover:border-teal-500/30 transition-all duration-500 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-teal-500/10 transition-all duration-500"></div>
              <div className="w-14 h-14 flex items-center justify-center bg-teal-500/10 rounded-xl text-teal-400 shadow-[0_0_20px_rgba(45,212,191,0.15)] group-hover:shadow-[0_0_30px_rgba(45,212,191,0.3)] transition-all duration-300 border border-teal-500/20 relative z-10">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="relative z-10">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-white mb-3">Automated Guardrails</h3>
                <p className="text-base text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Set policies that automatically protect sensitive information while allowing teams to keep using AI tools.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
