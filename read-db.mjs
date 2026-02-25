import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { config } from 'dotenv';
config({ path: 'web/.env.local' });

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
let pk = process.env.FIREBASE_PRIVATE_KEY;
if (pk.startsWith('"') && pk.endsWith('"')) {
    pk = pk.slice(1, -1);
}
pk = pk.replace(/\\n/g, '\n');

initializeApp({
    credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: pk
    }),
    databaseURL: `https://${FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = getDatabase();
const ref = db.ref("audit_reports");
try {
    const snapshot = await ref.once("value");
    console.log('Exists:', snapshot.exists());
    console.log('Num children:', snapshot.numChildren());
    snapshot.forEach(child => console.log(child.key, child.val().timestamp, child.val().enforcementScore));
    process.exit(0);
} catch(e) {
    console.error(e);
    process.exit(1);
}
