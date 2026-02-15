"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background-light text-neutral-800">
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-bold">
            <span className="rounded bg-primary px-2 py-1 text-white">🛡️</span>
            Complyze
          </div>
          <Link
            href="/login"
            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Sign In
          </Link>
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-3 sm:px-6 lg:px-8">
          <nav className="grid grid-cols-2 gap-2 text-sm font-medium sm:grid-cols-4">
            <a href="#platform" className="rounded border border-neutral-200 px-3 py-2 text-center hover:text-primary">Platform</a>
            <a href="#solutions" className="rounded border border-neutral-200 px-3 py-2 text-center hover:text-primary">Solutions</a>
            <a href="#resources" className="rounded border border-neutral-200 px-3 py-2 text-center hover:text-primary">Resources</a>
            <a href="#pricing" className="rounded border border-neutral-200 px-3 py-2 text-center hover:text-primary">Pricing</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Live AI governance
            </p>
            <h1 className="text-3xl font-bold leading-tight sm:text-5xl">
              Monitor and govern AI usage across your company.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg">
              Complyze captures real AI activity, flags risky prompts, and gives security teams actionable controls
              without slowing teams down.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="rounded-lg bg-primary px-5 py-3 text-center font-semibold text-white">
                Start Monitoring
              </Link>
              <a
                href="#platform"
                className="rounded-lg border border-neutral-300 px-5 py-3 text-center font-semibold text-neutral-700"
              >
                View Platform
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">What you get on day one</h2>
            <ul className="mt-4 space-y-3 text-sm text-neutral-700">
              <li>• Desktop monitoring for AI apps and browser sessions.</li>
              <li>• Policy alerts for sensitive data and violations.</li>
              <li>• Risk trends and board-ready reporting.</li>
            </ul>
          </div>
        </section>

        <LandingSection
          id="platform"
          title="Platform"
          text="Real-time traffic inspection, centralized policy controls, and audit-ready evidence in one governance platform."
        />
        <LandingSection
          id="solutions"
          title="Solutions"
          text="Support security, legal, compliance, and engineering with role-specific workflows for AI risk management."
        />
        <LandingSection
          id="resources"
          title="Resources"
          text="Documentation, implementation guides, and best-practice playbooks to launch AI governance quickly."
        />
        <LandingSection
          id="pricing"
          title="Pricing"
          text="Straightforward plans for startups, mid-market teams, and enterprises with dedicated support."
        />
      </main>
    </div>
  );
}

function LandingSection({ id, title, text }: { id: string; title: string; text: string }) {
  return (
    <section id={id} className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-3 max-w-3xl text-neutral-600">{text}</p>
      </div>
    </section>
  );
}
