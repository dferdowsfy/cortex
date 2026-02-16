import { NextRequest, NextResponse } from "next/server";
import { toolRegistryStore } from "@/lib/tool-registry-store";

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

        await toolRegistryStore.deleteTool(id);
        return NextResponse.json({ status: "deleted" });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
