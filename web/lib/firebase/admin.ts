/**
 * Firebase Admin SDK — initialized for server-side use (API routes).
 *
 * Strategy:
 * 1. If FIREBASE_SERVICE_ACCOUNT_KEY env var exists, use it (full admin access)
 * 2. Otherwise, use project-id-only initialization (limited but works for Firestore
 *    when running on GCP or when Firestore rules allow)
 *
 * For Vercel deployment, you need to generate a service account key from the
 * Firebase Console and store it as the FIREBASE_SERVICE_ACCOUNT_KEY env var.
 */
import {
    initializeApp,
    getApps,
    getApp,
    cert,
    type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
    if (getApps().length > 0) return getApp();

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    // Option 1: Service account JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const svcAccount = JSON.parse(
                process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ) as ServiceAccount;
            return initializeApp({ credential: cert(svcAccount), projectId });
        } catch (err) {
            console.warn(
                "[firebase-admin] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY:",
                err
            );
        }
    }

    // Option 2: Individual env vars (easier than full JSON)
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        try {
            return initializeApp({
                credential: cert({
                    projectId,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    // The private key comes with escaped newlines from env vars
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(
                        /\\n/g,
                        "\n"
                    ),
                }),
                projectId,
            });
        } catch (err) {
            console.warn(
                "[firebase-admin] Could not init with individual env vars:",
                err
            );
        }
    }

    // Option 3: Project-ID only (works for Firestore in some environments)
    console.warn(
        "[firebase-admin] No service account credentials found. " +
        "Using project-ID only initialization. " +
        "Set FIREBASE_SERVICE_ACCOUNT_KEY for full admin access."
    );
    return initializeApp({ projectId });
}

const adminApp = getAdminApp();
const adminDb = getFirestore(adminApp, "cortex001");

export { adminApp, adminDb };
