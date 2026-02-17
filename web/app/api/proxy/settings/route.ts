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

export async function GET() {
    const settings = await store.getSettings();
    return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const updated = await store.updateSettings(body);
        return NextResponse.json(updated);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update settings";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
