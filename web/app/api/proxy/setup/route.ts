/**
 * /api/proxy/setup — POST
 * Handles macOS proxy setup automation:
 *   - enable-proxy:  Set macOS system HTTPS proxy to 127.0.0.1:8080
 *   - disable-proxy: Turn off macOS system HTTPS proxy
 *   - trust-ca:      Trust the Complyze CA certificate in the system keychain
 *   - check-status:  Check current proxy and CA trust status
 */
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

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
        const out = execSync(`networksetup -getsecurewebproxy "${iface}"`, {
            encoding: "utf8",
            timeout: 5000,
        });
        const enabled = out.includes("Enabled: Yes");
        const serverMatch = out.match(/Server:\s*(.+)/);
        const portMatch = out.match(/Port:\s*(\d+)/);
        return {
            enabled,
            server: serverMatch?.[1]?.trim() || "",
            port: portMatch?.[1]?.trim() || "",
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
        const iface = getActiveInterface();

        switch (action) {
            case "check-status": {
                const proxy = getProxyStatus(iface);
                const caTrusted = isCATrusted();
                const proxyRunning = isProxyServerRunning();
                const certsExist = existsSync(join(process.cwd(), "certs", "ca-cert.pem"));

                return NextResponse.json({
                    interface: iface,
                    proxy_configured: proxy.enabled && proxy.server === "127.0.0.1" && proxy.port === "8080",
                    proxy_enabled: proxy.enabled,
                    proxy_server: proxy.server,
                    proxy_port: proxy.port,
                    ca_trusted: caTrusted,
                    ca_exists: certsExist,
                    proxy_server_running: proxyRunning,
                });
            }

            case "enable-proxy": {
                try {
                    execSync(
                        `networksetup -setsecurewebproxy "${iface}" 127.0.0.1 8080`,
                        { encoding: "utf8", timeout: 5000 }
                    );
                    return NextResponse.json({
                        success: true,
                        message: `HTTPS proxy enabled on ${iface} → 127.0.0.1:8080`,
                    });
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Unknown error";
                    // networksetup may need admin privileges
                    if (msg.includes("requires authorization") || msg.includes("permission")) {
                        return NextResponse.json({
                            success: false,
                            needs_sudo: true,
                            message: "macOS requires admin authorization. Run this in terminal:",
                            command: `sudo networksetup -setsecurewebproxy "${iface}" 127.0.0.1 8080`,
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
                    execSync(
                        `networksetup -setsecurewebproxystate "${iface}" off`,
                        { encoding: "utf8", timeout: 5000 }
                    );
                    return NextResponse.json({
                        success: true,
                        message: `HTTPS proxy disabled on ${iface}`,
                    });
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Unknown error";
                    // networksetup often requires admin privileges on newer macOS
                    if (msg.includes("requires authorization") || msg.includes("permission") || msg.includes("password")) {
                        return NextResponse.json({
                            success: false,
                            needs_sudo: true,
                            message: "macOS requires admin authorization. Run this in terminal:",
                            command: `sudo networksetup -setsecurewebproxystate "${iface}" off`,
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
