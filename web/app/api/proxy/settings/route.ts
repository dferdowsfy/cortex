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

    // Sync with real macOS system state (Source of Truth)
    const osState = await getProxyState();
    if (osState.enabled !== settings.proxy_enabled && osState.service !== "n/a") {
        // Silently sync OS truth back to persistence
        await store.updateSettings({ proxy_enabled: osState.enabled }, workspaceId);
        settings.proxy_enabled = osState.enabled;
    }

    return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const workspaceId = body.workspaceId || "default";

        // ── System Proxy Control ──
        if ("proxy_enabled" in body) {
            try {
                if (body.proxy_enabled) {
                    const proxyStart = await startProxy();
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
