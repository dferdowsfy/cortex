import { NextRequest, NextResponse } from "next/server";
import { callLLM, parseJSON } from "@/lib/openrouter";
import { P1_SYSTEM_PROMPT, buildP1UserPrompt } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool_name, vendor, tier } = body;

    if (!tool_name || !vendor || !tier) {
      return NextResponse.json(
        { error: "Missing required fields: tool_name, vendor, tier" },
        { status: 400 }
      );
    }

    const userPrompt = buildP1UserPrompt(tool_name, vendor, tier);
    const raw = await callLLM(P1_SYSTEM_PROMPT, userPrompt, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    const result = parseJSON(raw);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[/api/extract]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
