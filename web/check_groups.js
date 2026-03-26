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

async function checkGroups() {
    const groupsSnap = await db.ref('groups').get();
    const groups = groupsSnap.val() || {};
    console.log('--- Checking All Groups and Policies ---');
    for (const [id, group] of Object.entries(groups)) {
        const rules = group.rules || [];
        console.log(`Group: ${group.name} (${id}) under Org: ${group.orgId || '?'}`);
        console.log(`  Rules: ${rules.length} | Action: ${group.action}`);
        if (rules.length > 0) {
            console.log('  Rules:', JSON.stringify(rules, null, 2));
        }
    }
    process.exit(0);
}
checkGroups();
