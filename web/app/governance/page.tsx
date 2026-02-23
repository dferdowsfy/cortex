import EnrollmentAdminPanel from "@/app/components/EnrollmentAdminPanel";

export default function GovernancePage() {
    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-50 font-sans antialiased p-8">
            <header className="mb-12">
                <h1 className="text-lg font-bold tracking-[0.2em] text-zinc-400 uppercase mb-1">
                    System Administration
                </h1>
                <h2 className="text-4xl font-bold text-zinc-50 mb-4">
                    Governance Console
                </h2>
                <span className="text-[10px] font-bold tracking-wider text-emerald-400 bg-emerald-400/10 px-3.5 py-1.5 border border-emerald-400/20 uppercase rounded-full">
                    Active Provisioning
                </span>
            </header>

            <EnrollmentAdminPanel />
        </div>
    );
}
