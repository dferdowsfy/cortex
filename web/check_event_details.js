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

async function checkDetails() {
    const uid = 'pDHzeZHAbkProJ2ATyJjHrGIJyO2';
    const snap = await db.ref(`workspaces/${uid}/proxy_events`).get();
    if (snap.exists()) {
        const events = snap.val();
        console.log('--- Event Details for Workspace: pDHzeZHAbkProJ2ATyJjHrGIJyO2 ---');
        for (const [id, event] of Object.entries(events)) {
            console.log(`Event ID: ${id}`);
            console.log(`  Timestamp: ${event.timestamp}`);
            console.log(`  Created At: ${event._created_at}`);
            console.log(`  Tool: ${event.tool}`);
            console.log(`  Action: ${event.enforcement_action}`);
            console.log(`  Prompt Preview (first 50 chars): ${event.full_prompt?.substring(0, 50)}...`);
        }
    } else {
        console.log('No events found for workspace: ' + uid);
    }
    process.exit(0);
}
checkDetails();
