"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark text-neutral-800 dark:text-white font-display antialiased overflow-x-hidden min-h-screen">
      {/* Global Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b border-neutral-200 dark:border-neutral-800 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white">
                <span className="material-icons-outlined text-lg">security</span>
              </div>
              <span className="font-bold text-lg tracking-tight text-neutral-800 dark:text-white">
                Complyze
              </span>
            </div>
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <a
                className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors"
                href="#"
              >
                Platform
              </a>
              <a
                className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors"
                href="#"
              >
                Solutions
              </a>
              <a
                className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors"
                href="#"
              >
                Resources
              </a>
              <a
                className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors"
                href="#"
              >
                Pricing
              </a>
            </div>
            {/* CTA */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm font-semibold text-neutral-800 dark:text-white hover:text-primary transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/login"
                className="bg-primary hover:bg-primary/90 text-white text-sm font-medium px-4 py-2 rounded shadow-sm hover:shadow transition-all"
              >
                Request Demo
              </Link>
            </div>
            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button className="text-neutral-500 hover:text-neutral-800 dark:hover:text-white">
                <span className="material-icons-outlined">menu</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Hero Section */}
      <main className="relative pt-16 pb-24 lg:pt-24 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left Column: Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                New: GPT-4o Compliance Support
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-800 dark:text-white leading-[1.1] mb-6">
                Secure your AI Stack. <br />
                <span className="text-primary">Automate Compliance.</span>
              </h1>
              <p className="text-lg text-neutral-500 dark:text-neutral-300 mb-8 leading-relaxed max-w-lg">
                Real-time monitoring for LLMs. Detect data leakage, enforce
                policy, and govern model usage across the enterprise with zero
                latency impact.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  href="/login"
                  className="bg-primary hover:bg-primary/90 text-white text-base font-semibold px-6 py-3 rounded-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  Start Monitoring
                  <span
                    className="material-icons-outlined text-sm"
                    style={{
                      overflow: "hidden",
                      width: 20,
                      height: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    arrow_forward
                  </span>
                </Link>
                <button className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 text-base font-medium px-6 py-3 rounded-lg transition-all flex items-center justify-center gap-2">
                  <span className="material-icons-outlined text-sm">
                    description
                  </span>
                  Read Documentation
                </button>
              </div>
              {/* Trust Indicators */}
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                  Trusted by security teams at
                </p>
                <div className="flex flex-wrap gap-8 items-center opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                  {/* Note: In a real Next.js app, we would use <Image /> but here using standard <img> for simplicity */}
                  <div className="h-6 w-24 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                  <div className="h-5 w-32 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                  <div className="h-6 w-28 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                  <div className="h-5 w-26 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Dashboard Graphic */}
            <div className="relative lg:ml-auto w-full max-w-[600px]">
              {/* Decorative Background Blob */}
              <div className="absolute -top-20 -right-20 w-[500px] h-[500px] bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
              {/* App Window Container */}
              <div className="relative bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden backdrop-blur-sm">
                {/* Window Header */}
                <div className="bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                    <div className="ml-4 flex items-center gap-2 px-3 py-1 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <span className="material-icons-outlined text-xs text-neutral-400">
                        lock
                      </span>
                      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        governance-feed.live
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>{" "}
                      Connected
                    </span>
                  </div>
                </div>
                {/* Dashboard Content Mockup */}
                <div className="p-1 bg-neutral-50 dark:bg-neutral-900/50">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-700 mb-2">
                    <div className="col-span-5">Application</div>
                    <div className="col-span-3">Status</div>
                    <div className="col-span-4 text-right">Findings</div>
                  </div>
                  <div className="space-y-2 h-[380px] overflow-y-auto p-2 scrollbar-hide">
                    {/* Simulated High Risk Item */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-red-100 dark:border-red-900/30 shadow-sm">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5 flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded flex items-center justify-center text-red-600">
                            <span
                              className="material-icons-outlined"
                              style={{
                                overflow: "hidden",
                                width: 40,
                                height: 40,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              code
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-neutral-800 dark:text-white">
                              Code Gen V2
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              Internal Dev
                            </div>
                          </div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-100 dark:border-red-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>{" "}
                            High Risk
                          </span>
                        </div>
                        <div className="col-span-4 text-right">
                          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            PII Leakage
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Simulated Approved Item */}
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5 flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded flex items-center justify-center text-green-600">
                            <span className="material-icons-outlined">
                              menu_book
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-neutral-800 dark:text-white">
                              Wiki Bot
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              KB Search
                            </div>
                          </div>
                        </div>
                        <div className="col-span-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-100 dark:border-green-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>{" "}
                            Approved
                          </span>
                        </div>
                        <div className="col-span-4 text-right">
                          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Compliant
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Strip */}
      <section className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col gap-3 group">
              <div className="w-12 h-12 flex items-center justify-center mb-2">
                <span
                  className="material-icons-outlined text-4xl text-primary"
                  style={{
                    overflow: "hidden",
                    width: 40,
                    height: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  visibility
                </span>
              </div>
              <h3 className="text-lg font-bold text-neutral-800 dark:text-white">
                Full Observability
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Gain complete visibility into every prompt and completion. Track
                latency, costs, and model behavior in real-time.
              </p>
            </div>
            <div className="flex flex-col gap-3 group">
              <div className="w-12 h-12 flex items-center justify-center mb-2">
                <span
                  className="material-icons-outlined text-4xl text-primary"
                  style={{
                    overflow: "hidden",
                    width: 40,
                    height: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  gavel
                </span>
              </div>
              <h3 className="text-lg font-bold text-neutral-800 dark:text-white">
                Policy Enforcement
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Define and enforce governance policies automatically. Block PII,
                toxic content, and unauthorized model usage instantly.
              </p>
            </div>
            <div className="flex flex-col gap-3 group">
              <div className="w-12 h-12 flex items-center justify-center mb-2">
                <span className="material-icons-outlined text-4xl text-primary">
                  integration_instructions
                </span>
              </div>
              <h3 className="text-lg font-bold text-neutral-800 dark:text-white">
                Seamless Integration
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Drop-in SDKs for Python, Node.js, and Go. Integrates with your
                existing CI/CD pipelines and observability stack.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
