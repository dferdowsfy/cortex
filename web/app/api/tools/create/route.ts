import { NextRequest, NextResponse } from "next/server";
import { toolRegistryStore } from "@/lib/tool-registry-store";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const id = await toolRegistryStore.addTool(body);
        return NextResponse.json({
            status: "created",
            id,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
