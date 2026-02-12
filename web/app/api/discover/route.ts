import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tools } = body;

    if (!Array.isArray(tools) || tools.length === 0) {
      return NextResponse.json(
        { error: "No tools provided" },
        { status: 400 }
      );
    }

    // Return the tools in a format the client can use to populate localStorage
    const discovered = tools.map(
      (t: {
        tool_name: string;
        vendor: string;
        suggested_tier: string;
        source: string;
        detail: string;
        confidence: string;
      }) => ({
        tool_name: t.tool_name,
        vendor: t.vendor,
        suggested_tier: t.suggested_tier || "Free",
        source: t.source,
        detail: t.detail,
        confidence: t.confidence || "medium",
      })
    );

    return NextResponse.json({
      count: discovered.length,
      tools: discovered,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[/api/discover]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
