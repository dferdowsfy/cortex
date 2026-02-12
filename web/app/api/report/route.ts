import { NextRequest, NextResponse } from "next/server";
import { callLLM, parseJSON } from "@/lib/openrouter";
import { P5_SYSTEM_PROMPT, buildP5UserPrompt } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { organization, assessments } = body;

    if (!organization || !assessments?.length) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: organization and at least one assessment",
        },
        { status: 400 }
      );
    }

    const userPrompt = buildP5UserPrompt(organization, assessments);
    const raw = await callLLM(P5_SYSTEM_PROMPT, userPrompt, {
      temperature: 0.3,
      maxTokens: 8000,
    });

    const result = parseJSON(raw);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[/api/report]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
