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
import { enableProxy, disableProxy, getProxyState } from "@/lib/system-proxy-manager";
import { startProxy, stopProxy } from "@/lib/proxy-manager";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") || "default";
    const settings = await store.getSettings(workspaceId);

    // Include OS proxy state as informational metadata only.
    // DO NOT overwrite proxy_enabled based on OS state — the user's toggle
    // in the dashboard is the source of truth for the proxy's monitoring mode.
    let osProxyActive = false;
    try {
        const osState = await getProxyState();
        osProxyActive = osState.enabled;
    } catch { }

    return NextResponse.json({ ...settings, workspaceId, os_proxy_active: osProxyActive });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const workspaceId = body.workspaceId || "default";

        // ── System Proxy Control ──
        if ("proxy_enabled" in body) {
            // Only attempt local system proxy control if running in an environment that supports it
            // (e.g., local development or within the Electron desktop app).
            // Cloud environments (Vercel/Production) should only update the data store.
            const isLocal = process.env.NODE_ENV === "development" || process.env.ELECTRON === "true" || process.env.IS_LOCAL === "true" || workspaceId === "default";

            if (isLocal) {
                try {
                    if (body.proxy_enabled) {
                        const proxyStart = await startProxy(workspaceId);
                        // If proxy starts (or is already running), enable system proxy
                        if (proxyStart.ok) {
                            await enableProxy(8080);
                        }
                    } else {
                        await disableProxy();
                        await stopProxy();
                    }
                } catch (err: any) {
                    console.warn("[api/proxy/settings] Local system proxy update failed (expected in cloud):", err.message);
                    // We don't return 500 here anymore because the Firestore update (the source of truth) 
                    // should still succeed even if the local OS commands fail remotely.
                }
            }
        }

        const updated = await store.updateSettings(body, workspaceId);
        return NextResponse.json(updated);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update settings";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
