import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

let isInitialized = false;

function initFirebase() {
    if (isInitialized || getApps().length > 0) {
        isInitialized = true;
        return;
    }

    // We only try to initialize if keys are present (prevent crashing in basic dev modes)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        try {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                }),
                databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
            });
            isInitialized = true;
        } catch (e: any) {
            console.error("Failed to initialize Firebase Admin:", e.message);
        }
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
        console.warn("Skipping saving report to DB because Firebase is not configured.");
        return;
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
    }
}
