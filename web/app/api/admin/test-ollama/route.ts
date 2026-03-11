import { NextRequest, NextResponse } from "next/server";
import { analysePrompt, COMPLYZE_SCHEMA } from "@/lib/ollamaAnalysis";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/admin/test-ollama
 *
 * Verifies that the backend can reach the Ollama server, call the
 * complyze-qwen model, and receive a validated Complyze JSON response.
 *
 * This route is intended for internal diagnostics only.
 * Requires DEBUG_BYPASS in env or an admin token to call in production.
 */
export async function GET(req: NextRequest) {
    // Basic guard — only run if DEBUG_BYPASS is set or an admin key is supplied
    const adminKey = req.headers.get("X-Admin-Key") || req.nextUrl.searchParams.get("key");
    const isDebug = Boolean(process.env.DEBUG_BYPASS);

    if (!isDebug && adminKey !== process.env.ADMIN_SECRET_KEY) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const started = Date.now();

    try {
        const result = await analysePrompt({
            promptText:
                "Can you help me summarise this internal Slack channel conversation? " +
                "Here is my AWS key: AKIAIOSFODNN7EXAMPLE and my SSN is 123-45-6789.",
            attachmentPresent: false,
            metadata: {
                ai_tool: "TestRunner",
                test: "true",
            },
        });

        const elapsed = Date.now() - started;

        return NextResponse.json({
            ok: true,
            elapsed_ms: elapsed,
            ollama_host: "http://72.62.83.236:11434",
            model: "complyze-qwen",
            schema_version: result.analysis_version,
            overall_risk_score: result.overall_risk_score,
            severity: result.severity,
            recommended_action: result.recommended_action,
            confidence: result.confidence,
            findings_count: result.findings.length,
            sensitive_categories: result.sensitive_categories,
            contextual_risks: result.contextual_risks,
            dashboard_metrics: result.dashboard_metrics,
            graph_data: result.graph_data,
            // Full result for inspection
            full_result: result,
        });
    } catch (err) {
        const elapsed = Date.now() - started;
        const code =
            err && typeof (err as { code?: string }).code === "string"
                ? (err as { code: string }).code
                : "UNKNOWN";
        const message = err instanceof Error ? err.message : String(err);

        return NextResponse.json(
            {
                ok: false,
                elapsed_ms: elapsed,
                error_code: code,
                error_message: message,
                ollama_host: "http://72.62.83.236:11434",
                model: "complyze-qwen",
            },
            { status: 502 },
        );
    }
}

/**
 * POST /api/admin/test-ollama
 *
 * Allows submitting a custom prompt for testing.
 * Body: { prompt: string, attachmentPresent?: boolean, attachmentText?: string }
 */
export async function POST(req: NextRequest) {
    const adminKey = req.headers.get("X-Admin-Key");
    const isDebug = Boolean(process.env.DEBUG_BYPASS);

    if (!isDebug && adminKey !== process.env.ADMIN_SECRET_KEY) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const promptText: string = body.prompt || "Hello, this is a test prompt.";

    const started = Date.now();

    try {
        const result = await analysePrompt({
            promptText,
            attachmentPresent: body.attachmentPresent === true,
            attachmentType: body.attachmentType,
            attachmentText: body.attachmentText,
            metadata: { ai_tool: "TestRunner", test: "true" },
        });

        return NextResponse.json({
            ok: true,
            elapsed_ms: Date.now() - started,
            schema: COMPLYZE_SCHEMA.required,
            result,
        });
    } catch (err) {
        const code =
            err && typeof (err as { code?: string }).code === "string"
                ? (err as { code: string }).code
                : "UNKNOWN";
        return NextResponse.json(
            {
                ok: false,
                elapsed_ms: Date.now() - started,
                error_code: code,
                error_message: err instanceof Error ? err.message : String(err),
            },
            { status: 502 },
        );
    }
}
