"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase/config";
import {
    subscribeToUserSettings,
    updateUserSettings,
    DEFAULT_USER_SETTINGS,
    type UserSettings,
} from "@/lib/firebase/user-settings";

/**
 * React hook for realtime user settings.
 *
 * Subscribes to Firestore onSnapshot — any change from desktop
 * or dashboard is reflected immediately in both UIs.
 */
export function useUserSettings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.uid || !db) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const unsubscribe = subscribeToUserSettings(
            db,
            user.uid,
            (newSettings) => {
                setSettings(newSettings);
                setLoading(false);
            },
            (err) => {
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user?.uid]);

    const saveSettings = useCallback(
        async (partial: Partial<UserSettings>) => {
            if (!user?.uid || !db) return;

            // Optimistic update
            setSettings((prev) => ({ ...prev, ...partial }));

            try {
                await updateUserSettings(db, user.uid, partial);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save settings");
                // Revert optimistic update will happen via onSnapshot
            }
        },
        [user?.uid]
    );

    return { settings, loading, error, saveSettings };
}
