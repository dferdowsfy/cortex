import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

let isInitialized = false;

function initFirebase() {
    if (isInitialized || getApps().length > 0) {
        isInitialized = true;
        return;
    }

    // We only try to initialize if keys are present
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

    if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
        try {
            console.log("Initializing Firebase Admin with provided credentials...");
            const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

            if (!privateKey.includes("BEGIN PRIVATE KEY")) {
                console.warn("FIREBASE_PRIVATE_KEY format looks invalid (missing BEGIN header)");
            }

            initializeApp({
                credential: cert({
                    projectId: FIREBASE_PROJECT_ID,
                    clientEmail: FIREBASE_CLIENT_EMAIL,
                    privateKey
                }),
                databaseURL: `https://${FIREBASE_PROJECT_ID}.firebaseio.com`
            });
            isInitialized = true;
            console.log("Firebase Admin successfully initialized.");
        } catch (e: any) {
            console.error("Failed to initialize Firebase Admin SDK:", e.message);
            console.error(e.stack);
        }
    } else {
        const missing = [];
        if (!FIREBASE_PROJECT_ID) missing.push("FIREBASE_PROJECT_ID");
        if (!FIREBASE_CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
        if (!FIREBASE_PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
        const msg = `CRITICAL: Firebase initialization failed. Missing env vars: ${missing.join(", ")}`;
        console.error(msg);
    }
}

export async function getAuditConfig(): Promise<{ scheduleHour?: number, emailRecipient?: string } | null> {
    initFirebase();
    if (!isInitialized) return null;

    try {
        const db = getDatabase();
        const ref = db.ref('audit_config/main');
        const snapshot = await ref.once('value');
        if (snapshot.exists()) {
            return snapshot.val();
        }
    } catch (e: any) {
        console.error("Error fetching audit config:", e.message);
    }
    return null;
}

export async function saveAuditReport(report: any): Promise<void> {
    initFirebase();
    if (!isInitialized) {
        throw new Error("Cannot save report: Firebase is not initialized. Check your Environment Variables / Secrets.");
    }

    try {
        const db = getDatabase();
        const reportsRef = db.ref('audit_reports');
        await reportsRef.push({
            ...report,
            created_at: new Date().toISOString()
        });
        console.log("Successfully saved audit report to Firebase.");
    } catch (e: any) {
        console.error("Error saving audit report:", e.message);
        throw e;
    }
}
