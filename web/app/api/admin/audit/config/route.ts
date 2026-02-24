import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET() {
    try {
        if (!adminDb) return NextResponse.json({ error: "Firebase not initialized" }, { status: 500 });

        const ref = adminDb.ref("audit_config/main");
        const snapshot = await ref.once("value");
        return NextResponse.json(snapshot.val() || { scheduleHour: 13, emailRecipient: "" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        if (!adminDb) return NextResponse.json({ error: "Firebase not initialized" }, { status: 500 });

        const body = await req.json();
        const { scheduleHour, emailRecipient } = body;

        if (typeof scheduleHour !== "number" || scheduleHour < 0 || scheduleHour > 23) {
            return NextResponse.json({ error: "Invalid scheduleHour" }, { status: 400 });
        }

        const ref = adminDb.ref("audit_config/main");
        await ref.update({
            scheduleHour,
            emailRecipient: emailRecipient || ""
        });

        return NextResponse.json({ status: "ok" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
