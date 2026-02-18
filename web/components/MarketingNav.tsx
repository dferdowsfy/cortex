import Link from "next/link";

export default function MarketingNav() {
    return (
        <nav className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#111121] shadow-sm backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                        </div>
                        <Link href="/" className="font-bold text-lg tracking-tight text-white">
                            Complyze
                        </Link>
                    </div>
                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center space-x-10">
                        <Link
                            className="text-base font-medium text-white/80 hover:text-white transition-colors"
                            href="/platform"
                        >
                            Platform
                        </Link>
                        <Link
                            className="text-base font-medium text-white/80 hover:text-white transition-colors"
                            href="/pricing"
                        >
                            Pricing
                        </Link>
                    </div>
                    {/* CTA */}
                    <div className="hidden md:flex items-center gap-6">
                        <Link
                            href="/login"
                            className="text-base font-medium text-white/80 hover:text-white transition-colors"
                        >
                            Sign In
                        </Link>
                        <Link
                            href="/request-demo"
                            className="bg-primary hover:bg-primary/90 text-white text-base font-semibold px-5 py-2.5 rounded shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
                        >
                            Request Demo
                        </Link>
                    </div>
                    {/* Mobile menu button */}
                    <div className="md:hidden flex items-center">
                        <button className="text-neutral-500 hover:text-neutral-800 dark:hover:text-white">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
