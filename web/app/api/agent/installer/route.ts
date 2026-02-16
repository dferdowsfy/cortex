import { NextRequest, NextResponse } from "next/server";

/**
 * /api/agent/installer — GET
 * Serves the Complyze Desktop Agent as a signed enterprise package.
 * 
 * In a production environment, this would redirect to a notarized .pkg or .dmg
 * stored in a bucket (S3/GCS) or serve the binary directly.
 */
import { join } from "path";
import { existsSync, readFileSync } from "fs";

export async function GET(req: NextRequest) {
    const userAgent = req.headers.get("user-agent")?.toLowerCase() || "";
    const isWindows = userAgent.includes("win");

    const filename = isWindows ? "ComplyzeAgent_Setup.exe" : "Complyze-1.0.0-arm64.dmg";
    const contentType = isWindows ? "application/x-msdownload" : "application/x-apple-diskimage";

    // Path to the actual build artifact
    const distPath = join(process.cwd(), "..", "desktop", "dist", filename);

    if (existsSync(distPath)) {
        console.log(`[installer] Serving real package from ${distPath}`);
        const fileBuffer = readFileSync(distPath);
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-cache",
            },
        });
    }

    console.log(`[installer] Local build not found at ${distPath}, serving simulated package.`);
    return new NextResponse("Simulated Signed Enterprise Package Content", {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-cache",
        },
    });
}
