import { NextResponse } from "next/server";
import { toolRegistryStore } from "@/lib/tool-registry-store";

export async function GET() {
    try {
        const stats = await toolRegistryStore.getStats();
        const tools = await toolRegistryStore.getTools();
        return NextResponse.json({
            stats,
            tools,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
