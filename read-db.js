require('dotenv').config({ path: 'web/.env.local' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

initializeApp({
    credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY
    }),
    databaseURL: `https://${FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = getDatabase();
const ref = db.ref("audit_reports");
ref.once("value")
  .then(snapshot => {
      console.log('Exists:', snapshot.exists());
      console.log('Num children:', snapshot.numChildren());
      snapshot.forEach(child => console.log(child.key, child.val().timestamp));
      process.exit(0);
  })
  .catch(e => {
      console.error(e);
      process.exit(1);
  });
