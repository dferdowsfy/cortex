/**
 * Firebase Client SDK — shared config for desktop (Electron).
 *
 * Uses the same Firebase project as the web dashboard.
 * Config values come from environment variables or can be hardcoded
 * for packaged builds.
 */
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getAuth, signInWithCustomToken, onAuthStateChanged } = require('firebase/auth');
const { getFirestore, enableIndexedDbPersistence } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app;
let auth;
let db;

function initFirebase() {
    if (app) return { app, auth, db };

    try {
        app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log('[firebase] Initialized successfully');
    } catch (err) {
        console.error('[firebase] Initialization failed:', err.message);
    }

    return { app, auth, db };
}

module.exports = {
    initFirebase,
    getFirebaseAuth: () => auth,
    getFirebaseDb: () => db,
    onAuthStateChanged,
    signInWithCustomToken,
};
