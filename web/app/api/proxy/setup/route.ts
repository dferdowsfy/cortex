/**
 * /api/proxy/setup — POST
 * Handles macOS proxy setup automation:
 *   - enable-proxy:  Set macOS system HTTPS proxy to 127.0.0.1:8080
 *   - disable-proxy: Turn off macOS system HTTPS proxy
 *   - trust-ca:      Trust the Complyze CA certificate in the system keychain
 *   - check-status:  Check current proxy and CA trust status
 *
 * NOTE: These actions only work when running locally on macOS.
 * On Vercel (cloud), returns a "cloud mode" response.
 */
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

// Detect if running on Vercel (serverless)
const IS_VERCEL = !!process.env.VERCEL;

// Get the active Wi-Fi network interface name
function getActiveInterface(): string {
    try {
        // Try to find the active Wi-Fi service name
        const services = execSync("networksetup -listallnetworkservices", {
            encoding: "utf8",
            timeout: 5000,
        });
        // Common names: "Wi-Fi", "Ethernet", "USB 10/100/1000 LAN"
        const lines = services.split("\n").filter((l) => !l.startsWith("*") && l.trim());
        // Prefer Wi-Fi
        for (const line of lines) {
            if (line.toLowerCase().includes("wi-fi") || line.toLowerCase().includes("wifi")) {
                return line.trim();
            }
        }
        // Fallback to first non-header line
        return lines[0]?.trim() || "Wi-Fi";
    } catch {
        return "Wi-Fi";
    }
}

function getProxyStatus(iface: string): { enabled: boolean; server: string; port: string } {
    try {
        // Check PAC status instead of global proxy
        const out = execSync(`networksetup -getautoproxyurl "${iface}"`, {
            encoding: "utf8",
            timeout: 5000,
        });
        const enabled = out.includes("Enabled: Yes");
        const urlMatch = out.match(/URL:\s*(.+)/);
        const url = urlMatch?.[1]?.trim() || "";

        return {
            enabled,
            server: url.includes("127.0.0.1") ? "127.0.0.1" : "",
            port: url.match(/:(\d+)\//)?.[1] || "8080",
        };
    } catch {
        return { enabled: false, server: "", port: "" };
    }
}

function isCATrusted(): boolean {
    try {
        const certsDir = join(process.cwd(), "certs");
        const certPath = join(certsDir, "ca-cert.pem");
        if (!existsSync(certPath)) return false;

        // Check if the cert is in the system keychain
        const result = execSync(
            `security find-certificate -c "Complyze AI Proxy CA" /Library/Keychains/System.keychain 2>/dev/null`,
            { encoding: "utf8", timeout: 5000 }
        );
        return result.includes("Complyze AI Proxy CA");
    } catch {
        return false;
    }
}

function isProxyServerRunning(): boolean {
    try {
        execSync("lsof -ti:8080", { encoding: "utf8", timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

export async function POST(req: NextRequest) {
    try {
        const { action } = await req.json();

        // On Vercel, proxy setup commands can't run (no macOS, no shell access)
        if (IS_VERCEL) {
            if (action === "check-status") {
                return NextResponse.json({
                    interface: "Cloud",
                    proxy_configured: false,
                    proxy_enabled: false,
                    proxy_server: "",
                    proxy_port: "",
                    ca_trusted: false,
                    ca_exists: false,
                    proxy_server_running: false,
                    cloud_mode: true,
                });
            }
            return NextResponse.json({
                success: false,
                cloud_mode: true,
                message: "Proxy setup commands are not available in cloud mode. Deploy the Complyze Agent on each machine instead.",
            }, { status: 200 });
        }

        const iface = getActiveInterface();

        switch (action) {
            case "check-status": {
                const proxy = getProxyStatus(iface);
                const caTrusted = isCATrusted();
                const proxyRunning = isProxyServerRunning();
                const certsExist = existsSync(join(process.cwd(), "certs", "ca-cert.pem"));

                // Sync: Use the same logic as the agent
                const isConfigured = proxy.enabled && proxy.server === "127.0.0.1";

                return NextResponse.json({
                    interface: iface,
                    proxy_configured: isConfigured,
                    proxy_enabled: proxy.enabled,
                    proxy_server: proxy.server,
                    proxy_port: proxy.port,
                    ca_trusted: caTrusted,
                    ca_exists: certsExist,
                    proxy_server_running: proxyRunning,
                });
            }

            case "enable-proxy": {
                const pacUrl = "http://127.0.0.1:8080/proxy.pac";
                try {
                    // NUCLEAR CLEANUP: Disable global proxies first
                    execSync(`networksetup -setwebproxystate "${iface}" off && networksetup -setsecurewebproxystate "${iface}" off`, { timeout: 3000 });

                    // Enable PAC
                    execSync(
                        `networksetup -setautoproxyurl "${iface}" "${pacUrl}" && networksetup -setautoproxystate "${iface}" on`,
                        { encoding: "utf8", timeout: 5000 }
                    );
                    return NextResponse.json({
                        success: true,
                        message: `PAC-based proxy enabled on ${iface} → ${pacUrl}`,
                    });
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Unknown error";
                    if (msg.includes("requires authorization") || msg.includes("permission")) {
                        return NextResponse.json({
                            success: false,
                            needs_sudo: true,
                            message: "macOS requires admin authorization to modify network settings.",
                            command: `sudo networksetup -setautoproxyurl "${iface}" "${pacUrl}" && sudo networksetup -setautoproxystate "${iface}" on`,
                        }, { status: 403 });
                    }
                    throw e;
                }
            }

            case "trust-ca": {
                const certPath = join(process.cwd(), "certs", "ca-cert.pem");
                if (!existsSync(certPath)) {
                    return NextResponse.json({ error: "CA certificate not found" }, { status: 404 });
                }

                try {
                    // Try adding to the login keychain first (usually doesn't need sudo if unlocked, but for system-wide trust we prefer System keychain)
                    // For System keychain, we almost certainly need sudo.
                    // Let's try to detect if we need sudo by capturing the error.
                    execSync(
                        `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`,
                        { encoding: "utf8", timeout: 5000 }
                    );
                    return NextResponse.json({
                        success: true,
                        message: "CA certificate trusted successfully",
                    });
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Unknown error";
                    // If it failed, it's likely a permission issue. Return the sudo command.
                    return NextResponse.json({
                        success: false,
                        needs_sudo: true,
                        message: "Initial trust requires admin privileges. Run this in terminal:",
                        command: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`,
                    }, { status: 403 });
                }
            }

            case "disable-proxy": {
                try {
                    // Turn everything off for a clean state
                    execSync(
                        `networksetup -setautoproxystate "${iface}" off && ` +
                        `networksetup -setwebproxystate "${iface}" off && ` +
                        `networksetup -setsecurewebproxystate "${iface}" off`,
                        { encoding: "utf8", timeout: 5000 }
                    );
                    return NextResponse.json({
                        success: true,
                        message: `All proxies disabled on ${iface}`,
                    });
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Unknown error";
                    if (msg.includes("requires authorization") || msg.includes("permission") || msg.includes("password")) {
                        return NextResponse.json({
                            success: false,
                            needs_sudo: true,
                            message: "macOS requires admin authorization. Run this in terminal:",
                            command: `sudo networksetup -setautoproxystate "${iface}" off && sudo networksetup -setwebproxystate "${iface}" off && sudo networksetup -setsecurewebproxystate "${iface}" off`,
                        }, { status: 403 });
                    }
                    throw e;
                }
            }

            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Setup error";
        console.error("[/api/proxy/setup]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
