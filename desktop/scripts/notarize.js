require('dotenv').config({ path: '../.env' });
const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') return;

    if (process.env.SKIP_NOTARIZE === 'true') {
        console.log('  • skipping notarization because SKIP_NOTARIZE is true');
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appleId = process.env.APPLE_ID;
    const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
    const teamId = process.env.APPLE_TEAM_ID;

    if (!appleId || !appleIdPassword || !teamId) {
        console.warn('  • skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID missing in .env');
        return;
    }

    console.log(`  • notarizing ${appName}... This will take a few minutes.`);

    return await notarize({
        appBundleId: 'com.complyze.desktop',
        appPath: path.join(appOutDir, `${appName}.app`),
        appleId,
        appleIdPassword,
        teamId,
    });
};
