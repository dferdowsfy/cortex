"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile
} from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { doc, setDoc } from "firebase/firestore";

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const [configError, setConfigError] = useState(false);

    useEffect(() => {
        if (!auth) {
            setConfigError(true);
        }
    }, []);

    async function handleAuth(e: React.FormEvent) {
        e.preventDefault();
        if (!auth) {
            setError("Authentication is not configured. Missing API Key.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Update profile
                await updateProfile(user, { displayName: name });

                // Create user document in Firestore if DB is available
                if (db) {
                    await setDoc(doc(db, "users", user.uid), {
                        uid: user.uid,
                        email: user.email,
                        displayName: name,
                        role: "admin", // Default role for first user
                        createdAt: new Date().toISOString(),
                        organizationId: "org_" + Math.random().toString(36).substr(2, 9),
                    });
                }
            }
            router.push("/dashboard");
        } catch (err: any) {
            console.error(err);
            let msg = "Authentication failed";
            if (err.code === "auth/invalid-credential") msg = "Invalid email or password. Please check and try again.";
            if (err.code === "auth/wrong-password") msg = "Incorrect password. Please try again.";
            if (err.code === "auth/user-not-found") msg = "No account found with this email. Try creating a new account.";
            if (err.code === "auth/invalid-email") msg = "Invalid email address format.";
            if (err.code === "auth/email-already-in-use") msg = "This email is already registered. Try signing in instead.";
            if (err.code === "auth/weak-password") msg = "Password should be at least 6 characters.";
            if (err.code === "auth/too-many-requests") msg = "Too many failed attempts. Please wait a moment and try again.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    if (configError) {
        return (
            <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="rounded-md bg-red-50 p-4 border border-red-200">
                        <div className="flex">
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">
                                    Configuration Missing
                                </h3>
                                <div className="mt-2 text-sm text-red-700">
                                    <p>
                                        Firebase API Key is missing. Please add <code>NEXT_PUBLIC_FIREBASE_API_KEY</code> to your <code>.env.local</code> file.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 shadow-lg">
                        <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                    </div>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    {isLogin ? "Sign in to Complyze" : "Create your account"}
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    {isLogin ? "Or" : "Already have an account?"}{" "}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="font-medium text-brand-600 hover:text-brand-500"
                    >
                        {isLogin ? "create a new account" : "sign in instead"}
                    </button>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleAuth}>
                        {!isLogin && (
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                    Full Name
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        autoComplete="name"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-brand-500 sm:text-sm"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                Email address
                            </label>
                            <div className="mt-1">
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-brand-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete={isLogin ? "current-password" : "new-password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-brand-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="flex">
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">{error}</h3>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex w-full justify-center rounded-md border border-transparent bg-brand-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <svg className="mr-3 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : null}
                                {isLogin ? "Sign in" : "Create Account"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
