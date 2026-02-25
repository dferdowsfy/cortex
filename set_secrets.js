const fs = require('fs');
const { execSync } = require('child_process');

const envFile = fs.readFileSync('web/.env.local', 'utf8');
const envs = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)/);
    if (match) {
        envs[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
    }
});

function setSecret(name, value) {
    if (!value) return;
    try {
        execSync(`gh secret set ${name}`, { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
        console.log(`Set secret ${name}`);
    } catch(e) {
        console.error(`Failed to set ${name}`);
    }
}

setSecret('FIREBASE_PROJECT_ID', envs.FIREBASE_PROJECT_ID);
setSecret('FIREBASE_CLIENT_EMAIL', envs.FIREBASE_CLIENT_EMAIL);
setSecret('FIREBASE_PRIVATE_KEY', envs.FIREBASE_PRIVATE_KEY);
setSecret('RESEND_API_KEY', envs.RESEND_API_KEY);
setSecret('VALIDATION_REPORT_EMAIL', envs.VALIDATION_REPORT_EMAIL || 'dferdows@gmail.com');
