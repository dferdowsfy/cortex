import { exec } from 'child_process';

/**
 * Helper to run shell commands
 */
function runCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) return reject(stderr || error.message);
            resolve(stdout.trim());
        });
    });
}

/**
 * Detects the active network service (e.g., "Wi-Fi", "Ethernet") 
 * based on the default route interface.
 */
async function getActiveNetworkService(): Promise<string> {
    if (process.platform !== 'darwin') return "n/a";
    try {
        // Find whichever interface handles the default route (internet traffic)
        const cmd = `networksetup -listnetworkserviceorder | grep -B 1 $(route get default | grep interface | awk '{print $2}') | head -n 1 | cut -d ' ' -f 2-`;
        const service = await runCommand(cmd);
        return service || "Wi-Fi";
    } catch (err) {
        console.warn("[system-proxy] Active service detection failed:", err);
        return "Wi-Fi";
    }
}

/**
 * Configures and enables the system HTTP/HTTPS proxy via networksetup.
 */
export async function enableProxy(port: number = 8080) {
    if (process.platform !== 'darwin') return;

    const service = await getActiveNetworkService();
    try {
        await runCommand(`networksetup -setwebproxy "${service}" 127.0.0.1 ${port}`);
        await runCommand(`networksetup -setsecurewebproxy "${service}" 127.0.0.1 ${port}`);
        await runCommand(`networksetup -setwebproxystate "${service}" on`);
        await runCommand(`networksetup -setsecurewebproxystate "${service}" on`);

        // Verification loop
        const state = await getProxyState();
        if (!state.enabled) {
            throw new Error(`System reported proxy as disabled after 'on' command for service: ${service}`);
        }
    } catch (err: any) {
        console.error(`[system-proxy] Enable failed:`, err);
        throw new Error(err.message || "Failed to update macOS system proxy. Check permissions.");
    }
}

/**
 * Disables the system HTTP/HTTPS proxy.
 */
export async function disableProxy() {
    if (process.platform !== 'darwin') return;

    const service = await getActiveNetworkService();
    try {
        await runCommand(`networksetup -setwebproxystate "${service}" off`);
        await runCommand(`networksetup -setsecurewebproxystate "${service}" off`);

        // Verification
        const state = await getProxyState();
        if (state.enabled) {
            throw new Error(`System reported proxy as still enabled after 'off' command for service: ${service}`);
        }
    } catch (err: any) {
        console.error(`[system-proxy] Disable failed:`, err);
        throw new Error(err.message || "Failed to disable macOS system proxy. Check permissions.");
    }
}

/**
 * Retrieves the current system proxy status for the active service.
 */
export async function getProxyState() {
    if (process.platform !== 'darwin') {
        return { web: "", secure: "", enabled: false, service: "n/a" };
    }

    const service = await getActiveNetworkService();
    try {
        const web = await runCommand(`networksetup -getwebproxy "${service}"`);
        const secure = await runCommand(`networksetup -getsecurewebproxy "${service}"`);

        return {
            web,
            secure,
            enabled: web.includes("Enabled: Yes") || secure.includes("Enabled: Yes"),
            service
        };
    } catch (err) {
        return { web: "", secure: "", enabled: false, service };
    }
}
