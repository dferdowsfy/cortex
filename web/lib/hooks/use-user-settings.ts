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
        let mounted = true;
        if (!user?.uid || !db) {
            // Firebase unavailable or not logged in: fallback to REST API as single source of truth
            const wsId = user?.uid || "default";
            fetch(`/api/proxy/settings?workspaceId=${wsId}`)
                .then(r => r.json())
                .then(data => {
                    if (!mounted) return;
                    setSettings({
                        ...DEFAULT_USER_SETTINGS,
                        proxyEnabled: data.proxy_enabled ?? DEFAULT_USER_SETTINGS.proxyEnabled,
                        fullAuditMode: data.full_audit_mode ?? DEFAULT_USER_SETTINGS.fullAuditMode,
                        blockHighRisk: data.block_high_risk ?? DEFAULT_USER_SETTINGS.blockHighRisk,
                        redactSensitive: data.redact_sensitive ?? DEFAULT_USER_SETTINGS.redactSensitive,
                        alertOnViolations: data.alert_on_violations ?? DEFAULT_USER_SETTINGS.alertOnViolations,
                        desktopBypass: data.desktop_bypass ?? DEFAULT_USER_SETTINGS.desktopBypass,
                        retentionDays: data.retention_days ?? DEFAULT_USER_SETTINGS.retentionDays,
                        inspectAttachments: data.inspect_attachments ?? DEFAULT_USER_SETTINGS.inspectAttachments,
                    });
                    setLoading(false);
                }).catch(() => {
                    if (mounted) setLoading(false);
                });
            return () => { mounted = false; };
        }

        setLoading(true);
        setError(null);

        const unsubscribe = subscribeToUserSettings(
            db,
            user.uid,
            (newSettings) => {
                if (!mounted) return;
                setSettings(newSettings);
                setLoading(false);
            },
            (err) => {
                if (!mounted) return;
                setError(err.message);
                setLoading(false);
            }
        );

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, [user?.uid]);

    const saveSettings = useCallback(
        async (partial: Partial<UserSettings>) => {
            // Always dispatch optimistic update immediately to unfreeze UI
            setSettings((prev) => ({ ...prev, ...partial }));

            if (!user?.uid || !db) {
                // If firestore unavailable, trust the caller's subsequent POST fetch to persist
                return;
            }

            try {
                await updateUserSettings(db, user.uid, partial);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save settings");
                // Revert optimistic update will happen via onSnapshot
            }
        },
        [user?.uid]
    );

    return { settings, loading, error, saveSettings, user };
}
