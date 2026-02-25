/**
 * Firebase Admin SDK — initialized for server-side use (API routes).
 */
import {
    initializeApp,
    getApps,
    getApp,
    cert,
    type ServiceAccount,
} from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";

const sanitizeVar = (str?: string) => {
    if (!str) return "";
    let clean = str.trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
        clean = clean.slice(1, -1);
    }
    // Remove stray literal \n at the very end if any
    clean = clean.replace(/\\n$/, "").trim();
    // Sometimes Vercel envs append a comma and newlines from a JSON copy
    clean = clean.replace(/",?\\n?/g, "").trim();
    // Just for privateKey we replace all \n with actual newlines
    if (clean.includes("BEGIN PRIVATE KEY")) {
        clean = clean.replace(/\\n/g, "\n");
    }
    return clean;
};

const projectId = sanitizeVar(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID);
const RTDB_URL =
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
    (projectId ? `https://${projectId}.firebaseio.com` : "");

function getAdminApp() {
    if (getApps().length > 0) return getApp();

    // Option 1: Service account JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const svcAccount = JSON.parse(
                process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ) as ServiceAccount;
            return initializeApp({
                credential: cert(svcAccount),
                projectId,
                databaseURL: RTDB_URL,
            });
        } catch (err) {
            console.warn(
                "[firebase-admin] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY:",
                err
            );
        }
    }

    // Option 2: Individual env vars (easier than full JSON)
    const clientEmail = sanitizeVar(process.env.FIREBASE_CLIENT_EMAIL);
    const privateKey = sanitizeVar(process.env.FIREBASE_PRIVATE_KEY);

    if (clientEmail && privateKey) {
        try {
            console.log("[firebase-admin] Initializing with clientEmail:", clientEmail);

            return initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
                projectId,
                databaseURL: RTDB_URL,
            });
        } catch (err: any) {
            console.error(
                "[firebase-admin] Could not init with individual env vars:",
                err
            );
        }
    } else {
        console.warn("[firebase-admin] Missing individual env vars for service account.");
    }

    // Option 3: Fallback (Highly restricted)
    if (process.env.NODE_ENV === "development") {
        console.warn(
            "[firebase-admin] No service account found. " +
            "Running in Local Dev mode with restricted DB access. " +
            "Set FIREBASE_SERVICE_ACCOUNT_KEY for full cloud sync."
        );
    }

    // If no credentials at all, return a project-only app but warn that RTDB won't work
    return initializeApp({ projectId });
}

const adminApp = getAdminApp();
let adminDb: ReturnType<typeof getDatabase> | null = null;
let adminFirestore: ReturnType<typeof getFirestore> | null = null;

try {
    if (RTDB_URL && RTDB_URL.includes("firebaseio.com")) {
        adminDb = getDatabase(adminApp);
    }
} catch (err) {
    console.warn("[firebase-admin] RTDB initialization failed:", err);
}

try {
    adminFirestore = getFirestore(adminApp);
} catch (err) {
    console.warn("[firebase-admin] Firestore initialization failed:", err);
}

export { adminApp, adminDb, adminFirestore };
