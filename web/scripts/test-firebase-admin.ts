import * as dotenv from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function testInit() {
    console.log("Testing Firebase Admin Init...");
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
    const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    console.log("Project ID:", projectId);
    console.log("Client Email:", clientEmail);
    console.log("Private Key Length:", privateKeyRaw?.length || 0);
    console.log("DB URL:", dbUrl);

    if (!projectId || !clientEmail || !privateKeyRaw) {
        console.error("Missing env vars!");
        process.exit(1);
    }

    try {
        const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
        const app = initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey
            }),
            databaseURL: dbUrl
        }, "test-app");

        const db = getDatabase(app);
        console.log("Firebase App initialized successfully.");

        // Try to fetch audit reports
        console.log("Fetching audit reports...");
        const reportsRef = db.ref("audit_reports");
        const reportsSnap = await reportsRef.limitToLast(5).once("value");

        if (reportsSnap.exists()) {
            console.log("Found reports:", Object.keys(reportsSnap.val()).length);
            console.log("Latest report details:", JSON.stringify(Object.values(reportsSnap.val())[0], null, 2).substring(0, 200) + "...");
        } else {
            console.log("No reports found in 'audit_reports' path.");
        }

        process.exit(0);
    } catch (e: any) {
        console.error("Fatal initialization error:", e);
        process.exit(1);
    }
}

testInit();
