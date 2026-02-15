"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const PUBLIC_ROUTES = ["/", "/login", "/signup"];

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? "bg-brand-900 text-white" : "text-brand-100 hover:bg-brand-700 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (isPublicRoute) {
    return <main className="min-h-screen bg-gray-50">{children}</main>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="no-print sticky top-0 z-50 bg-brand-800 shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">🛡️</div>
            <div>
              <span className="text-lg font-bold text-white">Complyze</span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/scan">Scan Tool</NavLink>
              <NavLink href="/monitoring">Monitoring</NavLink>
              <NavLink href="/report">Board Report</NavLink>
              <NavLink href="/settings">Settings</NavLink>
            </nav>

            <button
              onClick={() => signOut()}
              title="Sign Out"
              className="flex items-center gap-2 rounded-full bg-brand-700 py-1 pl-3 pr-1 text-sm text-white transition-colors hover:bg-brand-600"
            >
              <span className="max-w-[100px] truncate text-xs font-medium">{user.email?.split("@")[0]}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold uppercase">
                {user.email?.[0]}
              </div>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
