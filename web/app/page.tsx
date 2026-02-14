"use client";

import Link from "next/link";
import { useState } from "react";

/* ── Real AI apps data ── */
const REAL_AI_APPS = [
  {
    name: "ChatGPT",
    vendor: "OpenAI",
    icon: "smart_toy",
    risk: "high" as const,
    finding: "PII in prompts detected",
    borderColor: "border-red-100 dark:border-red-900/30",
    iconBg: "bg-red-50 dark:bg-red-900/20",
    iconColor: "text-red-600",
    badgeBg: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-100 dark:border-red-800",
  },
  {
    name: "GitHub Copilot",
    vendor: "Microsoft",
    icon: "code",
    risk: "medium" as const,
    finding: "Source code exposure",
    borderColor: "border-yellow-100 dark:border-yellow-900/30",
    iconBg: "bg-yellow-50 dark:bg-yellow-900/20",
    iconColor: "text-yellow-600",
    badgeBg: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800",
  },
  {
    name: "Claude",
    vendor: "Anthropic",
    icon: "psychology",
    risk: "low" as const,
    finding: "Compliant",
    borderColor: "border-green-100 dark:border-green-900/30",
    iconBg: "bg-green-50 dark:bg-green-900/20",
    iconColor: "text-green-600",
    badgeBg: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-100 dark:border-green-800",
  },
  {
    name: "Gemini",
    vendor: "Google",
    icon: "auto_awesome",
    risk: "low" as const,
    finding: "Compliant",
    borderColor: "border-green-100 dark:border-green-900/30",
    iconBg: "bg-green-50 dark:bg-green-900/20",
    iconColor: "text-green-600",
    badgeBg: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-100 dark:border-green-800",
  },
  {
    name: "Cursor AI",
    vendor: "Anysphere",
    icon: "terminal",
    risk: "high" as const,
    finding: "Unrestricted code access",
    borderColor: "border-red-100 dark:border-red-900/30",
    iconBg: "bg-red-50 dark:bg-red-900/20",
    iconColor: "text-red-600",
    badgeBg: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-100 dark:border-red-800",
  },
  {
    name: "Perplexity",
    vendor: "Perplexity AI",
    icon: "search",
    risk: "low" as const,
    finding: "Compliant",
    borderColor: "border-green-100 dark:border-green-900/30",
    iconBg: "bg-green-50 dark:bg-green-900/20",
    iconColor: "text-green-600",
    badgeBg: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-100 dark:border-green-800",
  },
  {
    name: "Midjourney",
    vendor: "Midjourney Inc",
    icon: "palette",
    risk: "medium" as const,
    finding: "IP content risks",
    borderColor: "border-yellow-100 dark:border-yellow-900/30",
    iconBg: "bg-yellow-50 dark:bg-yellow-900/20",
    iconColor: "text-yellow-600",
    badgeBg: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800",
  },
];

const RISK_LABELS: Record<string, string> = {
  high: "High Risk",
  medium: "Medium Risk",
  low: "Approved",
};

const RISK_DOT_COLOR: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="bg-background-light dark:bg-background-dark text-neutral-800 dark:text-white font-display antialiased overflow-x-hidden min-h-screen">
      {/* ─── Global Navigation ─── */}
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
              <a className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors" href="#features">
                Platform
              </a>
              <a className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors" href="#how-it-works">
                Solutions
              </a>
              <a className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors" href="#monitoring">
                Resources
              </a>
              <a className="text-sm font-medium text-neutral-500 hover:text-primary transition-colors" href="#pricing">
                Pricing
              </a>
            </div>

            {/* Auth Buttons - Always visible */}
            <div className="flex items-center gap-3">
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
                Sign Up
              </Link>
              {/* Mobile menu button */}
              <button
                className="md:hidden text-neutral-500 hover:text-neutral-800 dark:hover:text-white ml-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <span className="material-icons-outlined">
                  {mobileMenuOpen ? "close" : "menu"}
                </span>
              </button>
            </div>
          </div>

          {/* Mobile menu dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-neutral-200 dark:border-neutral-700 py-4 space-y-3">
              <a className="block text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary px-2 py-2" href="#features">Platform</a>
              <a className="block text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary px-2 py-2" href="#how-it-works">Solutions</a>
              <a className="block text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary px-2 py-2" href="#monitoring">Resources</a>
              <a className="block text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-primary px-2 py-2" href="#pricing">Pricing</a>
            </div>
          )}
        </div>
      </nav>

      {/* ─── Main Hero Section ─── */}
      <main className="relative pt-12 pb-16 sm:pt-16 sm:pb-24 lg:pt-24 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Column: Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Real-time AI Traffic Monitoring
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-neutral-800 dark:text-white leading-tight sm:leading-[1.1] mb-4 sm:mb-6">
                Secure your AI Stack.{" "}
                <br className="hidden sm:block" />
                <span className="text-primary">Automate Compliance.</span>
              </h1>

              <p className="text-base sm:text-lg text-neutral-500 dark:text-neutral-300 mb-6 sm:mb-8 leading-relaxed max-w-xl">
                Real-time monitoring for ChatGPT, Copilot, Claude, Gemini, and
                every AI tool your team uses. Detect data leakage, enforce
                policy, and govern AI usage across the enterprise.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 sm:mb-12">
                <Link
                  href="/login"
                  className="bg-primary hover:bg-primary/90 text-white text-base font-semibold px-6 py-3 rounded-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  Start Free Trial
                  <span className="material-icons-outlined text-sm">arrow_forward</span>
                </Link>
                <Link
                  href="/login"
                  className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 text-base font-medium px-6 py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-icons-outlined text-sm">login</span>
                  Sign In to Dashboard
                </Link>
              </div>

              {/* Trust Indicators */}
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Trusted by security teams at
                </p>
                <div className="flex flex-wrap gap-6 items-center opacity-50">
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">Deloitte</span>
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">KPMG</span>
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">Accenture</span>
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">PwC</span>
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">McKinsey</span>
                </div>
              </div>
            </div>

            {/* Right Column: Live AI Monitoring Dashboard */}
            <div className="relative lg:ml-auto w-full max-w-[600px]">
              {/* Decorative Background Blob */}
              <div className="absolute -top-20 -right-20 w-[400px] h-[400px] bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

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
                    <div className="ml-3 flex items-center gap-2 px-3 py-1 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm">
                      <span className="material-icons-outlined text-xs text-neutral-400">lock</span>
                      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        app.complyze.ai/monitoring
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Live
                    </span>
                  </div>
                </div>

                {/* Dashboard Content - Real AI Apps */}
                <div className="bg-neutral-50 dark:bg-neutral-900/50">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] sm:text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-700">
                    <div className="col-span-5">AI Application</div>
                    <div className="col-span-3">Status</div>
                    <div className="col-span-4 text-right">Findings</div>
                  </div>
                  <div className="space-y-1.5 max-h-[340px] sm:max-h-[380px] overflow-y-auto p-2 scrollbar-hide">
                    {REAL_AI_APPS.map((app) => (
                      <div
                        key={app.name}
                        className={`bg-white dark:bg-neutral-800 rounded-lg p-2.5 sm:p-3 border ${app.borderColor} shadow-sm`}
                      >
                        <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center">
                          <div className="col-span-5 flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 ${app.iconBg} rounded flex items-center justify-center ${app.iconColor} flex-shrink-0`}>
                              <span className="material-icons-outlined text-base sm:text-xl">{app.icon}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-white truncate">
                                {app.name}
                              </div>
                              <div className="text-[9px] sm:text-[10px] text-neutral-500 truncate">
                                {app.vendor}
                              </div>
                            </div>
                          </div>
                          <div className="col-span-3">
                            <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold ${app.badgeBg} border`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOT_COLOR[app.risk]}`}></span>
                              <span className="hidden sm:inline">{RISK_LABELS[app.risk]}</span>
                              <span className="sm:hidden">{app.risk === "low" ? "OK" : app.risk === "medium" ? "Med" : "High"}</span>
                            </span>
                          </div>
                          <div className="col-span-4 text-right">
                            <div className="text-[10px] sm:text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                              {app.finding}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Features Strip ─── */}
      <section id="features" className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="flex flex-col gap-3 group">
              <div className="w-12 h-12 flex items-center justify-center mb-1">
                <span className="material-icons-outlined text-3xl sm:text-4xl text-primary">visibility</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white">
                Full Observability
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Gain complete visibility into every prompt and completion across
                ChatGPT, Copilot, Claude, Gemini, and more. Track latency,
                costs, and model behavior in real-time.
              </p>
            </div>
            <div className="flex flex-col gap-3 group">
              <div className="w-12 h-12 flex items-center justify-center mb-1">
                <span className="material-icons-outlined text-3xl sm:text-4xl text-primary">gavel</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white">
                Policy Enforcement
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Define and enforce governance policies automatically. Block PII,
                toxic content, and unauthorized model usage instantly across all
                AI applications.
              </p>
            </div>
            <div className="flex flex-col gap-3 group sm:col-span-2 md:col-span-1">
              <div className="w-12 h-12 flex items-center justify-center mb-1">
                <span className="material-icons-outlined text-3xl sm:text-4xl text-primary">integration_instructions</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white">
                Seamless Integration
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Drop-in proxy for desktop, browser extension for mobile, and
                SDKs for Python, Node.js, and Go. Integrates with your existing
                stack.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How It Works / Desktop Agent Section (Desktop Only) ─── */}
      <section id="how-it-works" className="hidden md:block border-t border-neutral-200 dark:border-neutral-800 py-16 bg-neutral-50 dark:bg-neutral-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-800 dark:text-white mb-3">
              Desktop Agent for Complete AI Monitoring
            </h2>
            <p className="text-base text-neutral-500 max-w-2xl mx-auto">
              Download the Complyze Desktop Agent to intercept and monitor all AI
              traffic on your machine. Runs silently in your menu bar.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-10">
            <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-icons-outlined text-primary text-xl">download</span>
              </div>
              <h3 className="font-semibold text-neutral-800 dark:text-white mb-2">1. Download & Install</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Download the agent for macOS or Windows. One-click install with
                no terminal commands required.
              </p>
            </div>
            <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-icons-outlined text-primary text-xl">settings</span>
              </div>
              <h3 className="font-semibold text-neutral-800 dark:text-white mb-2">2. Auto-Configure Proxy</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                The agent sets up HTTPS proxy and installs the CA certificate
                automatically. One OS prompt to approve.
              </p>
            </div>
            <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-icons-outlined text-primary text-xl">monitoring</span>
              </div>
              <h3 className="font-semibold text-neutral-800 dark:text-white mb-2">3. Monitor AI Traffic</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                All AI traffic is intercepted with full prompt visibility and
                streamed to your governance dashboard in real-time.
              </p>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-base font-semibold px-8 py-3.5 rounded-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
            >
              <span className="material-icons-outlined text-lg">download</span>
              Get Started — Download Desktop Agent
            </Link>
            <p className="text-xs text-neutral-400 mt-3">
              Available for macOS (Intel + Apple Silicon) and Windows (x64)
            </p>
          </div>
        </div>
      </section>

      {/* ─── Mobile Monitoring Section (Mobile Only) ─── */}
      <section id="monitoring" className="md:hidden border-t border-neutral-200 dark:border-neutral-800 py-12 bg-neutral-50 dark:bg-neutral-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-white mb-3">
              Monitor AI Activity From Anywhere
            </h2>
            <p className="text-sm text-neutral-500 max-w-lg mx-auto leading-relaxed">
              Access your AI governance dashboard from any device. View
              real-time alerts, review activity logs, and manage policies on the
              go.
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons-outlined text-primary text-xl">dashboard</span>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-800 dark:text-white mb-1">Web Dashboard</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    Full-featured governance dashboard accessible from any
                    mobile browser. Real-time monitoring, alerts, and reports.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons-outlined text-primary text-xl">notifications_active</span>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-800 dark:text-white mb-1">Push Notifications</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    Get instant alerts for policy violations, high-risk
                    prompts, and PII leakage across your organization.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons-outlined text-primary text-xl">api</span>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-800 dark:text-white mb-1">API Integration</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    Connect your AI tools via API for cloud-based monitoring
                    without requiring a desktop agent.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-base font-semibold px-6 py-3 rounded-lg shadow-lg shadow-primary/20 transition-all"
            >
              Start Monitoring
              <span className="material-icons-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="border-t border-neutral-200 dark:border-neutral-800 py-12 sm:py-16 bg-white dark:bg-neutral-900/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-800 dark:text-white mb-4">
            Ready to govern your AI stack?
          </h2>
          <p className="text-base text-neutral-500 mb-6 sm:mb-8 leading-relaxed">
            Start monitoring AI usage across your organization in minutes. No
            complex setup required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="bg-primary hover:bg-primary/90 text-white text-base font-semibold px-8 py-3.5 rounded-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all inline-flex items-center justify-center gap-2"
            >
              Get Started Free
              <span className="material-icons-outlined text-sm">arrow_forward</span>
            </Link>
            <Link
              href="/login"
              className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 text-base font-medium px-8 py-3.5 rounded-lg transition-all inline-flex items-center justify-center gap-2"
            >
              <span className="material-icons-outlined text-sm">login</span>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-8 bg-neutral-50 dark:bg-neutral-900/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-white">
                <span className="material-icons-outlined text-sm">security</span>
              </div>
              <span className="font-semibold text-sm text-neutral-600 dark:text-neutral-400">
                Complyze
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              &copy; {new Date().getFullYear()} Complyze. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
