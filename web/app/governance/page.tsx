"use client";

import EnrollmentAdminPanel from "@/app/components/EnrollmentAdminPanel";

export default function GovernancePage() {
    return (
        <main className="min-h-screen bg-[#09090b] text-zinc-50">
            <div className="max-w-[1100px] mx-auto px-8 py-10">
                <EnrollmentAdminPanel />
            </div>
        </main>
    );
}
