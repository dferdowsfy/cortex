/**
 * /api/proxy/settings — GET & POST
 *
 * Manage proxy monitoring settings.
 * Reads/writes from global proxy_config/settings for backward compatibility.
 * The per-user settings in users/{uid}/settings/config (Firestore)
 * are the authoritative source — this API is kept for agent heartbeat compatibility.
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") || "default";
    const settings = await store.getSettings(workspaceId);

    // DO NOT overwrite proxy_enabled based on OS state — the user's toggle
    // in the dashboard is the source of truth for the proxy's monitoring mode.
    let osProxyActive = false;
    let proxyRunning = false;
    try {
        const { getProxyState, isPortReachable } = await import("@/lib/system-proxy-manager");
        const [osState, portOk] = await Promise.all([
            getProxyState(),
            isPortReachable("127.0.0.1", 8080),
        ]);
        osProxyActive = osState.enabled;
        proxyRunning = portOk;
    } catch { }

    return NextResponse.json({
        ...settings,
        workspaceId,
        os_proxy_active: osProxyActive,
        proxy_server_running: proxyRunning,
    });
}

/**
 * Determine if this request is being served from a local machine.
 * We check both the standard env vars AND the Host header since
 * the app may run locally in production mode (e.g. `next start`).
 */
function detectIsLocal(req: NextRequest): boolean {
    // Explicit env overrides
    if (process.env.ELECTRON === "true") return true;
    if (process.env.IS_LOCAL === "true") return true;

    // Running on Vercel cloud → NOT local
    if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) return false;

    // Standard dev mode
    if (process.env.NODE_ENV === "development") return true;

    // Check request Host header — localhost / 127.x means running locally
    const host = req.headers.get("host") || "";
    if (
        host.startsWith("localhost") ||
        host.startsWith("127.") ||
        host.startsWith("0.0.0.0")
    ) return true;

    // Check NEXT_PUBLIC_APP_URL if set
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (appUrl.includes("localhost") || appUrl.includes("127.")) return true;

    return false;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const workspaceId = body.workspaceId || "default";

        // ── System Proxy Control ──
        if ("proxy_enabled" in body) {
            const isLocal = detectIsLocal(req);

            if (isLocal) {
                try {
                    const { startProxy, stopProxy } = await import("@/lib/proxy-manager");
                    const { enableProxy, disableProxy } = await import("@/lib/system-proxy-manager");

                    if (body.proxy_enabled) {
                        const proxyStart = await startProxy(workspaceId);
                        console.log(`[api/proxy/settings] Proxy start result:`, proxyStart);
                        if (proxyStart.ok) {
                            await enableProxy(8080);
                            console.log(`[api/proxy/settings] System proxy enabled on port 8080`);
                        } else {
                            console.warn(`[api/proxy/settings] Proxy failed to start: ${proxyStart.message}`);
                        }
                    } else {
                        await disableProxy();
                        await stopProxy();
                        console.log(`[api/proxy/settings] Proxy stopped and system proxy disabled`);
                    }
                } catch (err: any) {
                    console.warn("[api/proxy/settings] Local system proxy update failed:", err.message);
                    // Continue — the store update below should still succeed
                }
            } else {
                console.log(`[api/proxy/settings] Cloud deployment detected — skipping local proxy control`);
            }
        }

        const updated = await store.updateSettings(body, workspaceId);
        return NextResponse.json(updated);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update settings";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
