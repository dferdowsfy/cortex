/**
 * Firebase Settings Sync — realtime Firestore listener for desktop.
 *
 * Subscribes to users/{uid}/settings/config via onSnapshot.
 * Caches last known settings in memory for offline fallback.
 * Applies settings changes immediately without restart.
 */
const { doc, onSnapshot, setDoc, serverTimestamp } = require('firebase/firestore');

// ── Default settings (used when no Firestore doc exists) ──────────────
const DEFAULT_SETTINGS = {
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

class FirebaseSettingsSync {
    constructor() {
        this._uid = null;
        this._db = null;
        this._unsubscribe = null;
        this._cachedSettings = { ...DEFAULT_SETTINGS };
        this._onSettingsChange = null;
        this._isConnected = false;
    }

    /**
     * Start listening to settings for a given user.
     * @param {import('firebase/firestore').Firestore} db
     * @param {string} uid
     * @param {(settings: object) => void} onSettingsChange
     */
    subscribe(db, uid, onSettingsChange) {
        // Clean up any existing subscription
        this.unsubscribe();

        this._db = db;
        this._uid = uid;
        this._onSettingsChange = onSettingsChange;

        const settingsRef = doc(db, 'users', uid, 'settings', 'config');

        this._unsubscribe = onSnapshot(
            settingsRef,
            (docSnap) => {
                this._isConnected = true;

                if (!docSnap.exists()) {
                    console.log('[settings-sync] No settings doc found, initializing defaults');
                    this._initializeDefaults(settingsRef);
                    return;
                }

                const settings = docSnap.data();
                console.log('[settings-sync] Settings updated from Firestore:', JSON.stringify(settings));

                // Cache for offline use
                this._cachedSettings = { ...DEFAULT_SETTINGS, ...settings };

                // Notify listener
                if (this._onSettingsChange) {
                    this._onSettingsChange(this._cachedSettings);
                }
            },
            (error) => {
                console.error('[settings-sync] Listener error:', error.message);
                this._isConnected = false;

                // Use cached settings on error
                if (this._onSettingsChange && this._cachedSettings) {
                    console.log('[settings-sync] Using cached settings (offline fallback)');
                    this._onSettingsChange(this._cachedSettings);
                }
            }
        );

        console.log(`[settings-sync] Subscribed for uid=${uid}`);
    }

    /**
     * Write a settings change to Firestore (desktop can also toggle).
     * @param {Partial<object>} partial
     */
    async updateSettings(partial) {
        if (!this._db || !this._uid) {
            console.warn('[settings-sync] Cannot update: not subscribed');
            return;
        }

        const settingsRef = doc(this._db, 'users', this._uid, 'settings', 'config');

        try {
            await setDoc(
                settingsRef,
                {
                    ...partial,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            console.log('[settings-sync] Settings written to Firestore');
        } catch (err) {
            console.error('[settings-sync] Failed to write settings:', err.message);
        }
    }

    /**
     * Stop listening to Firestore changes.
     */
    unsubscribe() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
            console.log('[settings-sync] Unsubscribed');
        }
    }

    /**
     * Get current cached settings (for offline use).
     */
    getCachedSettings() {
        return { ...this._cachedSettings };
    }

    /**
     * Whether we have an active Firestore connection.
     */
    get isConnected() {
        return this._isConnected;
    }

    // ── Internal ──────────────────────────────────────────────────
    async _initializeDefaults(settingsRef) {
        try {
            await setDoc(settingsRef, {
                ...DEFAULT_SETTINGS,
                updatedAt: serverTimestamp(),
            });
            console.log('[settings-sync] Default settings initialized in Firestore');
        } catch (err) {
            console.error('[settings-sync] Failed to initialize defaults:', err.message);
        }
    }
}

module.exports = { FirebaseSettingsSync, DEFAULT_SETTINGS };
