const admin = require('firebase-admin');

// Load env vars from .env.local
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
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY;
const databaseURL = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || `https://${projectId}.firebaseio.com`;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        databaseURL
    });
}

const db = admin.database();

async function diagnose() {
    const email = 'dferdows@gmail.com';
    const emailKey = email.replace(/\./g, ',');
    
    console.log('--- Diagnosing dferdows@gmail.com ---');
    
    // 1. Check organizations
    const orgsSnap = await db.ref('organizations').get();
    const orgs = orgsSnap.val() || {};
    let memberships = [];

    for (const [id, org] of Object.entries(orgs)) {
        if (org.members && org.members[emailKey]) {
            memberships.push({ id, name: org.name, role: org.members[emailKey].role, uid: org.members[emailKey].uid });
        }
    }
    
    console.log('Organizations:', JSON.stringify(memberships, null, 2));

    // 2. Check extension_users for all found UIDs
    for (const m of memberships) {
        if (m.uid) {
            const userSnap = await db.ref(`extension_users/${m.uid}`).get();
            console.log(`Extension User Record (UID: ${m.uid}):`, JSON.stringify(userSnap.val(), null, 2));
        }
    }

    // 3. Check for the specific "Personal Workspace" if it exists under the UID
    // Let's find any UID associated with this email in the database
    const usersSnap = await db.ref('extension_users').get();
    const users = usersSnap.val() || {};
    for (const [uid, user] of Object.entries(users)) {
        if (user.email === email) {
            console.log(`Found extension_user by email. UID: ${uid}`);
            console.log(JSON.stringify(user, null, 2));
            
            // Check if there is a policy for this user's personal org
            const orgSnap = await db.ref(`organizations/${uid}`).get();
            if (orgSnap.exists()) {
                console.log(`Personal Org (${uid}) exists. Policy:`, JSON.stringify(orgSnap.val().policy_config || {}, null, 2));
            } else {
                console.log(`Personal Org (${uid}) does NOT exist.`);
            }
        }
    }

    process.exit(0);
}

diagnose();
