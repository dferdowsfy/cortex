const admin = require('firebase-admin');
const fs = require('fs');
const content = fs.readFileSync('web/.env.local', 'utf8');
const env = {};
content.split('\n').forEach(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        env[key] = value.replace(/\\n/g, '\n');
    }
});
const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY }),
    databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${projectId}.firebaseio.com`
});
const db = admin.database();

async function checkEvents() {
    const uid = 'pDHzeZHAbkProJ2ATyJjHrGIJyO2';
    console.log(`--- Checking Events for Workspace: ${uid} ---`);
    
    const paths = [
        `workspaces/${uid}/proxy_events`,
        `workspaces/${uid}/extension_events`,
        `workspaces/${uid}/proxy_alerts`,
        `organizations/${uid}/proxy_events`, // Old path?
        `activity/${uid}`                   // Another potential path
    ];

    for (const path of paths) {
        const snap = await db.ref(path).get();
        if (snap.exists()) {
            const count = Object.keys(snap.val()).length;
            console.log(`Path: ${path} | Events found: ${count}`);
        } else {
            console.log(`Path: ${path} | EMPTY`);
        }
    }
    process.exit(0);
}
checkEvents();
