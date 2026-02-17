/**
 * Firebase Client SDK — shared config for desktop (Electron).
 *
 * Uses the same Firebase project as the web dashboard.
 * Config values come from environment variables or can be hardcoded
 * for packaged builds.
 */
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getAuth, signInWithCustomToken, onAuthStateChanged } = require('firebase/auth');
const { getDatabase } = require('firebase/database');

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyCXiD5MwlacKPF8f3sD8PSJPzbFgqGt04A',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'myagent-846c3.firebaseapp.com',
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://myagent-846c3.firebaseio.com',
    projectId: process.env.FIREBASE_PROJECT_ID || 'myagent-846c3',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'myagent-846c3.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '933231903010',
    appId: process.env.FIREBASE_APP_ID || '1:933231903010:web:aa05396db9a1e40d28e57b',
};

let app;
let auth;
let rtdb;

function initFirebase() {
    if (app) return { app, auth, db: rtdb };

    try {
        app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        auth = getAuth(app);
        rtdb = getDatabase(app);
        console.log('[firebase] Initialized successfully (RTDB)');
    } catch (err) {
        console.error('[firebase] Initialization failed:', err.message);
    }

    return { app, auth, db: rtdb };
}

module.exports = {
    initFirebase,
    getFirebaseAuth: () => auth,
    getFirebaseDb: () => rtdb,
    onAuthStateChanged,
    signInWithCustomToken,
};
