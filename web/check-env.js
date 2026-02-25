require('dotenv').config({ path: '.env.local' });
console.log("Quotes?", process.env.FIREBASE_PRIVATE_KEY.startsWith('"'));
console.log("New lines?", process.env.FIREBASE_PRIVATE_KEY.includes('\n'));
console.log("Literal backslash n?", process.env.FIREBASE_PRIVATE_KEY.includes('\\n'));
