const fs = require('fs');
const path = require('path');

/**
 * prepare-production.js
 * 
 * This script prepares the project for production deployment by:
 * 1. Reading the production environment configuration.
 * 2. Patching the Chrome Extension files with production endpoints.
 * 3. Ensuring no localhost strings remain in critical extension files.
 */

const rootDir = path.join(__dirname, '../..');
const webDir = path.join(rootDir, 'web');
const extDir = path.join(rootDir, 'extension');

async function run() {
    console.log('🚀 Preparing production build...');

    // 1. Resolve Production API Endpoint
    let apiEndpoint = 'https://api.complyze.co'; // Fallback
    const prodEnvPath = path.join(webDir, '.env.production');

    if (fs.existsSync(prodEnvPath)) {
        const content = fs.readFileSync(prodEnvPath, 'utf8');
        const match = content.match(/^API_ENDPOINT=(.*)$/m);
        if (match && match[1]) {
            apiEndpoint = match[1].trim();
        }
    }
    console.log(`📍 Production API Endpoint: ${apiEndpoint}`);

    // 2. Patch Extension Files
    const filesToPatch = ['background.js', 'popup.js', 'promptScanner.js'];
    const envVars = { API_ENDPOINT: apiEndpoint };

    // Extract other potential vars if present in prod env
    if (fs.existsSync(prodEnvPath)) {
        const content = fs.readFileSync(prodEnvPath, 'utf8');
        const keys = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_URL', 'FIREBASE_REFRESH_URL'];
        keys.forEach(k => {
            const m = content.match(new RegExp(`^${k}=(.*)$`, 'm'));
            if (m && m[1]) envVars[k] = m[1].trim();
        });
    }

    for (const fileName of filesToPatch) {
        const filePath = path.join(extDir, fileName);
        if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf8');

            // Universal replacement for: (typeof process !== 'undefined' && process.env.KEY) || 'DEFAULT'
            Object.keys(envVars).forEach(key => {
                const value = envVars[key];
                const pattern = new RegExp(`\\(typeof\\s+process\\s+!==\\s+'undefined'\\s+&&\\s+process\\.env\\.${key}\\)\\s+\\|\\|\\s+'[^']*'`, 'g');

                if (value) {
                    content = content.replace(pattern, `'${value}'`);
                } else if (key.includes('KEY') || key.includes('URL')) {
                    // HARDENING: If it's a key/url and no prod value exists, strip the dev fallback
                    content = content.replace(pattern, "''");
                }
            });

            // Also catch any literal localhost strings
            content = content.replace(/http:\/\/localhost:3737/g, apiEndpoint);

            fs.writeFileSync(filePath, content);
            console.log(`✅ Patched extension/${fileName}`);
        }
    }

    console.log('✨ Production preparation complete.');
}

run().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
