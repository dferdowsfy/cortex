import { NextRequest, NextResponse } from "next/server";
import { callLLM, parseJSON } from "@/lib/openrouter";
import {
  P2_SYSTEM_PROMPT,
  P3_SYSTEM_PROMPT,
  P4_SYSTEM_PROMPT,
  buildP2UserPrompt,
  buildP3UserPrompt,
  buildP4UserPrompt,
} from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profile, enrichment_answers } = body;

    if (!profile) {
      return NextResponse.json(
        { error: "Missing required field: profile" },
        { status: 400 }
      );
    }

    // \u2500\u2500 Step 1: Risk Classification (P2) \u2500\u2500
    const p2UserPrompt = buildP2UserPrompt(profile, enrichment_answers || []);
    const p2Raw = await callLLM(P2_SYSTEM_PROMPT, p2UserPrompt, {
      temperature: 0.0,
      maxTokens: 3000,
    });
    const classification = parseJSON(p2Raw);

    // \u2500\u2500 Step 2: Flag Generation (P3) \u2500\u2500
    const p3UserPrompt = buildP3UserPrompt(profile, classification);
    const p3Raw = await callLLM(P3_SYSTEM_PROMPT, p3UserPrompt, {
      temperature: 0.1,
      maxTokens: 3000,
    });
    const flags = parseJSON(p3Raw);

    // \u2500\u2500 Step 3: Recommendation Engine (P4) \u2500\u2500
    const p4UserPrompt = buildP4UserPrompt(profile, classification, flags);
    const p4Raw = await callLLM(P4_SYSTEM_PROMPT, p4UserPrompt, {
      temperature: 0.2,
      maxTokens: 4096,
    });
    const recommendations = parseJSON(p4Raw);

    return NextResponse.json({
      classification,
      flags,
      recommendations,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[/api/assess]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
