"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "./firebase/config";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!auth) {
            console.warn("Firebase Auth not initialized. Check your API Key.");
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);

            // Redirect to login if not authenticated and trying to access protected routes
            // Normalize pathname to remove trailing slashes for consistent matching
            const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/$/, "");
            const publicRoutes = ["", "/", "/platform", "/pricing", "/request-demo", "/login", "/signup"];

            if (!user && !publicRoutes.includes(normalizedPath)) {
                console.log("[Auth] Protected route accessed without session, redirecting to login:", normalizedPath);
                router.push("/login");
            }
            // Redirect to dashboard if already authenticated and trying to access login
            if (user && normalizedPath === "/login") {
                router.push("/dashboard");
            }
        });

        return () => unsubscribe();
    }, [pathname, router]);

    const signOut = async () => {
        if (auth) {
            await firebaseSignOut(auth);
            router.push("/login");
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, signOut }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
