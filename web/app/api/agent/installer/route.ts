import { NextRequest, NextResponse } from "next/server";

/**
 * /api/agent/installer — GET
 * Serves the Complyze Desktop Agent as a signed enterprise package.
 * 
 * In a production environment, this would redirect to a notarized .pkg or .dmg
 * stored in a bucket (S3/GCS) or serve the binary directly.
 */
import { join } from "path";
import { existsSync, statSync, createReadStream } from "fs";

export async function GET(req: NextRequest) {
    const userAgent = req.headers.get("user-agent")?.toLowerCase() || "";
    const isWindows = userAgent.includes("win");

    const filename = isWindows ? "ComplyzeAgent_Setup.exe" : "Complyze-1.0.0-arm64.dmg";
    const contentType = isWindows ? "application/x-msdownload" : "application/x-apple-diskimage";

    // Path to the actual build artifact
    const distPath = join(process.cwd(), "..", "desktop", "dist", filename);

    if (existsSync(distPath)) {
        console.log(`[installer] Streaming real package from ${distPath}`);
        const stat = statSync(distPath);
        const stream = createReadStream(distPath);
        const webStream = new ReadableStream({
            start(controller) {
                stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                stream.on("end", () => controller.close());
                stream.on("error", (err) => controller.error(err));
            },
        });
        return new NextResponse(webStream, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Length": stat.size.toString(),
                "Cache-Control": "no-cache",
            },
        });
    }

    // Check for a remote redirect (useful for Vercel/Production)
    const remoteUrl = process.env.NEXT_PUBLIC_DOWNLOAD_URL || process.env.AGENT_DOWNLOAD_URL;
    if (remoteUrl) {
        return NextResponse.redirect(remoteUrl);
    }

    console.log(`[installer] Local build not found at ${distPath} and no remote URL configured.`);

    // Return a more professional error instead of a 43-byte dummy file
    return new NextResponse(
        JSON.stringify({
            error: "Installer Not Found",
            message: "The desktop agent build artifact was not found on this server. If you are running locally, ensure you have run 'npm run build' in the desktop directory.",
            platform: isWindows ? "Windows" : "macOS",
            expected_path: distPath
        }),
        {
            status: 404,
            headers: {
                "Content-Type": "application/json",
            },
        }
    );
}
