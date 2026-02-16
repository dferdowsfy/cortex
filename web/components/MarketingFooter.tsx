export default function MarketingFooter() {
    return (
        <footer className="bg-background-light dark:bg-background-dark border-t border-neutral-200 dark:border-neutral-800 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-white">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                        </div>
                        <span className="font-bold text-base tracking-tight text-neutral-800 dark:text-white">
                            Complyze
                        </span>
                    </div>
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">
                        © {new Date().getFullYear()} Complyze. All rights reserved.
                    </div>
                    <div className="flex gap-6 text-sm text-neutral-500 dark:text-neutral-400">
                        <a href="#" className="hover:text-primary transition-colors">Privacy</a>
                        <a href="#" className="hover:text-primary transition-colors">Terms</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
