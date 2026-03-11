"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    createUserWithEmailAndPassword,
    updateProfile
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { Shield, ArrowRight, CheckCircle, Lock, Mail, User } from "lucide-react";
import { PRICING } from "@/lib/pricing";

function SignUpContent() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    // Get plan from URL ?plan=shield, fallback to STARTER
    const initialPlanQuery = searchParams.get("plan");
    const selectedPlan = initialPlanQuery ? initialPlanQuery.toUpperCase() : "STARTER";

    async function handleSignUp(e: React.FormEvent) {
        e.preventDefault();
        if (!auth) {
            setError("Authentication is not configured.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            // 1. Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Update Firebase Auth Profile
            await updateProfile(user, { displayName: name });

            // 3. Provision Org & Feature Flags via Backend
            const provisionRes = await fetch("/api/auth/provision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    displayName: name
                })
            });

            if (!provisionRes.ok) {
                const data = await provisionRes.json();
                throw new Error(data.error || "Failed to provision account");
            }

            const provisionData = await provisionRes.json();
            const { orgId } = provisionData;

            // 4. Auto-Initiate Stripe Checkout
            const config = selectedPlan === "SHIELD" ? PRICING.SHIELD : PRICING.STARTER;
            const checkoutRes = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: selectedPlan,
                    quantity: config.minSeats,
                    email: user.email,
                    userId: user.uid,
                    organizationId: orgId
                })
            });

            const checkoutData = await checkoutRes.json();
            if (checkoutData.url) {
                window.location.href = checkoutData.url;
            } else {
                // Fallback to dashboard if checkout creation failed
                router.push("/dashboard");
            }
        } catch (err: any) {
            console.error(err);
            let msg = err.message || "Signup failed";
            if (err.code === "auth/email-already-in-use") msg = "This email is already registered.";
            if (err.code === "auth/weak-password") msg = "Password should be at least 6 characters.";
            if (err.code === "auth/invalid-email") msg = "Invalid email format.";
            setError(msg);
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen bg-[#020617] text-white">
            {/* Left Side: Branding/Value Prop */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-b from-[#0f172a] to-[#020617] border-r border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-2xl font-black tracking-tighter">COMPLYZE</span>
                </div>

                <div className="space-y-8 max-w-md">
                    <h1 className="text-5xl font-black tracking-tight leading-tight">
                        Securing the <span className="text-blue-500">AI-First</span> Enterprise.
                    </h1>
                    <p className="text-lg text-white/60 font-medium">
                        Join thousands of security professionals using Complyze to monitor, redact, and control AI usage across their fleet.
                    </p>

                    <ul className="space-y-4 pt-4">
                        {[
                            "Real-time PII & Sensitive Data Redaction",
                            "Universal AI Application Visibility",
                            "Custom Governance Policies",
                            "Automated Risk Scoring"
                        ].map((item, i) => (
                            <li key={i} className="flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-white/80">
                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="text-sm text-white/30 font-bold uppercase tracking-widest">
                    &copy; 2024 Complyze Security Inc.
                </div>
            </div>

            {/* Right Side: Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black tracking-tight">Create your account</h2>
                        <p className="text-white/40 font-medium">
                            {selectedPlan === "SHIELD" ? "Set up your workspace to enable Shield controls." : "Start securing your team's AI usage in minutes."}
                        </p>
                    </div>

                    <form onSubmit={handleSignUp} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    required
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Alex Rivera"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white/[0.06] transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Work Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    required
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="alex@company.com"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white/[0.06] transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    required
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white/[0.06] transition-all"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm font-bold text-red-400">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {loading ? "Preparing Workspace..." : `Continue to Checkout (${selectedPlan})`}
                            {!loading && <ArrowRight className="w-4 h-4" />}
                        </button>
                    </form>

                    <div className="pt-4 text-center">
                        <p className="text-sm text-white/40 font-medium">
                            Already have an account?{" "}
                            <Link href="/login" className="text-blue-500 hover:underline font-bold">
                                Sign in
                            </Link>
                        </p>
                    </div>

                    <div className="pt-8 flex justify-center gap-8 border-t border-white/5">
                        <Link href="/privacypolicy" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/40">Privacy</Link>
                        <Link href="/pricing" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/40">Terms</Link>
                        <Link href="/request-demo" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/40">Support</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SignUpPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#020617]" />}>
            <SignUpContent />
        </Suspense>
    );
}
