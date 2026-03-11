"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    signInWithEmailAndPassword
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { Shield, ArrowRight, Lock, Mail } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        if (!auth) {
            setError("Authentication is not configured.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push("/dashboard");
        } catch (err: any) {
            console.error(err);
            let msg = "Invalid email or password.";
            if (err.code === "auth/user-not-found") msg = "No account found with this email.";
            if (err.code === "auth/wrong-password") msg = "Incorrect password.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen bg-[#020617] text-white">
            <div className="w-full flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="flex justify-center flex-col items-center gap-6">
                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Shield className="w-7 h-7 text-white" />
                        </div>
                        <div className="text-center space-y-2">
                            <h2 className="text-3xl font-black tracking-tight uppercase">Sign In</h2>
                            <p className="text-white/40 font-medium">Welcome back to the Complyze Hub.</p>
                        </div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Email address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    required
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="alex@company.com"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
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
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
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
                            {loading ? "Authenticating..." : "Sign In to Hub"}
                            {!loading && <ArrowRight className="w-4 h-4" />}
                        </button>
                    </form>

                    <div className="pt-4 text-center">
                        <p className="text-sm text-white/40 font-medium">
                            Don&apos;t have an account?{" "}
                            <Link href="/signup" className="text-blue-500 hover:underline font-bold">
                                Create one for free
                            </Link>
                        </p>
                    </div>

                    <div className="pt-8 flex justify-center gap-8 border-t border-white/5">
                        <Link href="/privacypolicy" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/40">Privacy Policy</Link>
                        <Link href="/" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/40">Home</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
