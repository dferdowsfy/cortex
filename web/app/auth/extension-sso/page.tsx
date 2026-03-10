"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase/config";

/**
 * /auth/extension-sso
 *
 * The browser extension opens this page with ?token=<ssoToken>.
 * We verify the token server-side, generate a Firebase custom token,
 * sign the user in, and redirect them to the dashboard.
 */
export default function ExtensionSSOPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState("Signing you in via Complyze Shield…");

    useEffect(() => {
        const ssoToken = searchParams.get("token");
        if (!ssoToken) {
            setStatus("error");
            setMessage("Missing SSO token. Please sign in manually.");
            setTimeout(() => router.push("/login"), 2500);
            return;
        }

        (async () => {
            try {
                // Exchange SSO token for a Firebase custom token
                const res = await fetch("/api/auth/extension-sso", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ssoToken }),
                });

                if (!res.ok) throw new Error("Token exchange failed");
                const { customToken } = await res.json();

                // Sign into Firebase with the custom token
                if (!auth) throw new Error("Firebase Auth not initialized");
                await signInWithCustomToken(auth, customToken);

                setStatus("success");
                setMessage("Signed in! Redirecting to your dashboard…");
                setTimeout(() => router.push("/dashboard"), 800);
            } catch (err: any) {
                console.error("[SSO] Error:", err.message);
                setStatus("error");
                setMessage("Auto sign-in failed. Redirecting to login…");
                setTimeout(() => router.push("/login"), 2500);
            }
        })();
    }, [router, searchParams]);

    return (
        <div style={{
            minHeight: "100vh",
            background: "#080c18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}>
            <div style={{
                textAlign: "center",
                padding: "48px",
                background: "#0d1225",
                borderRadius: "16px",
                border: "1px solid rgba(59,130,246,0.2)",
                maxWidth: "360px",
                boxShadow: "0 0 40px rgba(59,130,246,0.1)",
            }}>
                {/* Shield icon */}
                <div style={{
                    width: 64, height: 64,
                    background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                    borderRadius: 18,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 20px",
                    boxShadow: "0 0 24px rgba(59,130,246,0.3)",
                }}>
                    {status === "success" ? (
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : status === "error" ? (
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    ) : (
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    )}
                </div>

                <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>
                    Complyze
                </div>

                {/* Spinner */}
                {status === "loading" && (
                    <div style={{
                        width: 32, height: 32,
                        border: "3px solid rgba(59,130,246,0.2)",
                        borderTopColor: "#3b82f6",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        margin: "0 auto 16px",
                    }} />
                )}

                <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                    {message}
                </p>

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
}
