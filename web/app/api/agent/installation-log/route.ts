import { NextRequest, NextResponse } from "next/server";
import { agentStore } from "@/lib/agent-store";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        await agentStore.logInstallation({
            ...body,
            status: "download_initiated",
        });
        return NextResponse.json({ status: "logged" });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
