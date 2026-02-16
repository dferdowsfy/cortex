const { notarize } = require('@electron/notarize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);

    const envPath = path.resolve(__dirname, '../../.env');
    console.log(`  • checking for .env at: ${envPath}`);
    console.log(`  • APPLE_ID: ${process.env.APPLE_ID ? 'DETECTED' : 'MISSING'}`);
    console.log(`  • APPLE_TEAM_ID: ${process.env.APPLE_TEAM_ID ? 'DETECTED' : 'MISSING'}`);

    if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
        console.warn('  • skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID not found in environment');
        return;
    }

    try {
        await notarize({
            appPath,
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
        });
        console.log(`  • notarization successful for ${appName}`);
    } catch (error) {
        console.error('  • notarization failed:');
        console.error(error);
        throw error;
    }
};
