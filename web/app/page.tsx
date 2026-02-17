"use client";

import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export default function LandingPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark text-neutral-800 dark:text-white font-display antialiased overflow-x-hidden min-h-screen flex flex-col">
      <MarketingNav />

      {/* Main Hero Section */}
      <main className="relative pt-12 pb-16 sm:pt-20 sm:pb-28 lg:pt-32 lg:pb-48 overflow-hidden flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-16 lg:gap-8 items-center">
            {/* Left Column: Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full bg-primary/10 border border-primary/20 text-[#4ADE80] text-xs sm:text-base font-semibold mb-6 sm:mb-10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ADE80] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4ADE80]"></span>
                </span>
                Now Supporting ChatGPT, Gemini &amp; Claude
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-[4.75rem] font-semibold tracking-tight text-neutral-800 dark:text-white leading-tight sm:leading-[1.15] mb-4 sm:mb-8">
                Control Your <br />
                AI Governance. <br />
                <span className="text-[#7261fd] font-medium">Enterprise Oversight.</span>
              </h1>
              <p className="text-base sm:text-xl text-neutral-600 dark:text-neutral-400 mb-6 sm:mb-10 leading-relaxed max-w-xl">
                Complyze centralizes AI tool inventory, structures governance workflows, and delivers audit-ready oversight across your enterprise.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 mb-8 sm:mb-16">
                <Link
                  href="/login"
                  className="bg-primary hover:bg-primary/90 text-white text-base sm:text-lg font-semibold px-6 sm:px-8 py-3 sm:py-4 rounded-lg shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  Request Demo
                </Link>
                <Link
                  href="/login"
                  className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 text-base font-medium px-6 sm:px-8 py-3 sm:py-4 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  Sign In
                </Link>
              </div>
              {/* Trust Indicators */}
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Trusted by Security &amp; Compliance Teams
                </p>
                <div className="flex flex-wrap gap-6 items-center opacity-50">
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">Deloitte</span>
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">KPMG</span>
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">Accenture</span>
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">PwC</span>
                </div>
              </div>
            </div>

            {/* Right Column: AI Governance Dashboard Preview */}
            <div className="relative lg:ml-auto w-full max-w-[600px]">
              <div className="absolute -top-20 -right-20 w-[400px] h-[400px] bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
              <div className="relative bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                    <div className="ml-3 hidden sm:flex items-center gap-2 px-3 py-1 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <svg className="w-3 h-3 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">app.complyze.ai</span>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-neutral-500 font-medium">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="hidden sm:inline">Live</span>
                  </span>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-900/50">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-700">
                    <div className="col-span-5">AI Inventory</div>
                    <div className="col-span-3">Governance</div>
                    <div className="col-span-4 text-right">Owner</div>
                  </div>
                  <div className="space-y-1.5 max-h-[320px] sm:max-h-[380px] overflow-y-auto p-2 scrollbar-hide">
                    {/* ChatGPT Enterprise */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                        <div className="col-span-5 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">ChatGPT Enterprise</div>
                          <div className="text-[9px] sm:text-[10px] text-neutral-500">OpenAI</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Approved
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-[10px] sm:text-xs text-neutral-600 truncate">Engineering</div>
                      </div>
                    </div>
                    {/* GitHub Copilot */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border border-orange-100 dark:border-orange-900/30 shadow-sm">
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                        <div className="col-span-5 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">GitHub Copilot</div>
                          <div className="text-[9px] sm:text-[10px] text-neutral-500">Microsoft</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Assessing
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-[10px] sm:text-xs text-neutral-600 truncate">Engineering</div>
                      </div>
                    </div>
                    {/* Claude */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                        <div className="col-span-5 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">Claude Pro</div>
                          <div className="text-[9px] sm:text-[10px] text-neutral-500">Anthropic</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Approved
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-[10px] sm:text-xs text-neutral-600 truncate">Legal</div>
                      </div>
                    </div>
                    {/* Gemini */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                        <div className="col-span-5 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">Gemini Enterprise</div>
                          <div className="text-[9px] sm:text-[10px] text-neutral-500">Google</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Approved
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-[10px] sm:text-xs text-neutral-600 truncate">Operations</div>
                      </div>
                    </div>
                    {/* Cursor AI - Shadow AI */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border border-red-100 dark:border-red-900/30 shadow-sm">
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                        <div className="col-span-5 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">Cursor AI</div>
                          <div className="text-[9px] sm:text-[10px] text-neutral-500">Anysphere</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Shadow AI
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-[10px] sm:text-xs text-neutral-600 truncate">Unmanaged</div>
                      </div>
                    </div>
                    {/* Midjourney */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm opacity-70">
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                        <div className="col-span-5 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">Midjourney</div>
                          <div className="text-[9px] sm:text-[10px] text-neutral-500">Midjourney Inc</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Pending
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-[10px] sm:text-xs text-neutral-500 truncate">Marketing</div>
                      </div>
                    </div>
                    {/* Perplexity */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm opacity-70">
                      <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                        <div className="col-span-5 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">Perplexity Pro</div>
                          <div className="text-[9px] sm:text-[10px] text-neutral-500">Perplexity AI</div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Pending
                          </span>
                        </div>
                        <div className="col-span-4 text-right text-[10px] sm:text-xs text-neutral-500 truncate">Research</div>
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
              Built for Enterprise AI Governance
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12 text-center lg:text-left">
            <div className="flex flex-col gap-4">
              <div className="w-16 h-16 flex items-center justify-center bg-primary/10 rounded-xl text-primary mx-auto lg:mx-0">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-neutral-800 dark:text-white">AI Tool Registry</h3>
              <p className="text-lg sm:text-xl text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Maintain a structured, versioned inventory of all AI tools, models, and integrations across your organization.
              </p>
            </div>
            <div className="flex flex-col gap-6">
              <div className="w-16 h-16 flex items-center justify-center bg-primary/10 rounded-xl text-primary mx-auto lg:mx-0">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-neutral-800 dark:text-white">Structured Risk Assessments</h3>
              <p className="text-lg sm:text-xl text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Run versioned assessments with defined ownership, review cycles, and approval workflows. Lock assessments for audit defensibility.
              </p>
            </div>
            <div className="flex flex-col gap-6">
              <div className="w-16 h-16 flex items-center justify-center bg-primary/10 rounded-xl text-primary mx-auto lg:mx-0">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-neutral-800 dark:text-white">Governance Automation</h3>
              <p className="text-lg sm:text-xl text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Automate reassessments, policy validation, and governance reporting with scheduled review triggers and structured audit trails.
              </p>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
