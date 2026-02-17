/**
 * User Settings Service — Firestore-backed per-user settings.
 *
 * Path: users/{uid}/settings/config
 *
 * Firestore is the single source of truth.
 * Both dashboard and desktop subscribe to the same document.
 */
import {
    doc,
    setDoc,
    onSnapshot,
    serverTimestamp,
    type Unsubscribe,
    type Firestore,
} from "firebase/firestore";

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
    updatedAt?: unknown; // Firestore Timestamp
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
};

// ── Document path helper ─────────────────────────────────────────
function settingsDocRef(db: Firestore, uid: string) {
    return doc(db, "users", uid, "settings", "config");
}

// ── Write (merge) ────────────────────────────────────────────────
export async function updateUserSettings(
    db: Firestore,
    uid: string,
    partial: Partial<UserSettings>
): Promise<void> {
    const ref = settingsDocRef(db, uid);
    await setDoc(
        ref,
        {
            ...partial,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

// ── Realtime subscription ────────────────────────────────────────
export function subscribeToUserSettings(
    db: Firestore,
    uid: string,
    onSettings: (settings: UserSettings) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    const ref = settingsDocRef(db, uid);

    return onSnapshot(
        ref,
        (docSnap) => {
            if (!docSnap.exists()) {
                // Initialize with defaults on first access
                setDoc(ref, {
                    ...DEFAULT_USER_SETTINGS,
                    updatedAt: serverTimestamp(),
                }).catch((err) =>
                    console.error("[user-settings] Failed to init defaults:", err)
                );
                onSettings({ ...DEFAULT_USER_SETTINGS });
                return;
            }

            const data = docSnap.data() as UserSettings;
            onSettings({ ...DEFAULT_USER_SETTINGS, ...data });
        },
        (error) => {
            console.error("[user-settings] Snapshot error:", error);
            if (onError) onError(error);
        }
    );
}
