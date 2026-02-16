import { NextRequest, NextResponse } from "next/server";

export async function POST() {
    // Simulate a discovery job
    // In a real system, this would query the proxy_events or run a network scan
    return NextResponse.json({
        status: "started",
        job_id: `discovery_${Date.now()}`,
        message: "Discovery scan initiated across active agents."
    });
}
