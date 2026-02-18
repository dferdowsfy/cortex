/**
 * User Settings Service — RTDB-backed per-user settings.
 *
 * Path: users/{uid}/settings
 *
 * Firebase Realtime Database is the single source of truth.
 * Both dashboard and desktop subscribe to the same node.
 */
import {
    ref,
    set,
    update,
    onValue,
    type Database,
    type Unsubscribe,
} from "firebase/database";

// ── Settings Shape ───────────────────────────────────────────────
export interface UserSettings {
    blockEnabled: boolean;
    interceptEnabled: boolean;
    proxyEnabled: boolean;
    fullAuditMode: boolean;
    blockHighRisk: boolean;
    redactSensitive: boolean;
    alertOnViolations: boolean;
    desktopBypass: boolean;
    riskThreshold: number;
    retentionDays: number;
    userAttributionEnabled: boolean;
    updatedAt?: number; // epoch ms
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
    blockEnabled: true,
    interceptEnabled: true,
    proxyEnabled: true,
    fullAuditMode: false,
    blockHighRisk: false,
    redactSensitive: false,
    alertOnViolations: true,
    desktopBypass: false,
    riskThreshold: 60,
    retentionDays: 90,
    userAttributionEnabled: true,
};

// ── Ref helper ───────────────────────────────────────────────────
function settingsRef(db: Database, uid: string) {
    return ref(db, `users/${uid}/settings`);
}

// ── Write (merge) ────────────────────────────────────────────────
export async function updateUserSettings(
    db: Database,
    uid: string,
    partial: Partial<UserSettings>
): Promise<void> {
    const r = settingsRef(db, uid);
    await update(r, {
        ...partial,
        updatedAt: Date.now(),
    });
}

// ── Realtime subscription ────────────────────────────────────────
export function subscribeToUserSettings(
    db: Database,
    uid: string,
    onSettings: (settings: UserSettings) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    const r = settingsRef(db, uid);

    const unsub = onValue(
        r,
        (snapshot) => {
            if (!snapshot.exists()) {
                // Initialize with defaults on first access
                set(r, {
                    ...DEFAULT_USER_SETTINGS,
                    updatedAt: Date.now(),
                }).catch((err) =>
                    console.error("[user-settings] Failed to init defaults:", err)
                );
                onSettings({ ...DEFAULT_USER_SETTINGS });
                return;
            }

            const data = snapshot.val() as UserSettings;
            onSettings({ ...DEFAULT_USER_SETTINGS, ...data });
        },
        (error) => {
            console.error("[user-settings] Listener error:", error);
            if (onError) onError(error);
        }
    );

    return unsub;
}
