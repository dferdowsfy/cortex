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
            try {
                if (body.proxy_enabled) {
                    const proxyStart = await startProxy(workspaceId);
                    if (!proxyStart.ok) {
                        return NextResponse.json({
                            error: proxyStart.message,
                            details: "Proxy server failed to start. System proxy was not enabled.",
                            code: "PROXY_START_FAILURE"
                        }, { status: 500 });
                    }
                    await enableProxy(8080);
                } else {
                    await disableProxy();
                    await stopProxy();
                }
            } catch (err: any) {
                // Return structured error to frontend as requested
                return NextResponse.json({
                    error: err.message || "macOS Permission Error",
                    details: "Failed to update system proxy. Check if Complyze has necessary permissions.",
                    code: "SYSTEM_PROXY_FAILURE"
                }, { status: 500 });
            }
        }

        const updated = await store.updateSettings(body, workspaceId);
        return NextResponse.json(updated);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update settings";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
