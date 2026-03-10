import { NextRequest, NextResponse } from "next/server";
import { groupStore } from "@/lib/group-store";
import { enrollmentStore } from "@/lib/enrollment-store";
import { userStore } from "@/lib/user-store";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const openai = new OpenAI({
    baseURL: process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined,
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
});

/**
 * POST /api/scanPrompt
 * Evaluates a given prompt against group/org policies dynamically using an LLM.
 * Bypasses full proxy interception logic. Returns structured JSON actions.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const promptText = body.promptText || body.prompt;
        const aiTool = body.aiTool || "Unknown Tool";
        const workspaceId = body.workspaceId || "default";
        const context = body.context || "";

        const orgId = req.headers.get("X-Organization-ID") || body.orgId;
        const authHeader = req.headers.get("Authorization");
        const userEmail = req.headers.get("X-User-Email") || body.userEmail;

        if (!promptText) {
            return NextResponse.json({ error: "promptText is required" }, { status: 400 });
        }

        // Token check — skipped entirely in DEBUG_BYPASS mode
        if (!process.env.DEBUG_BYPASS) {
            if (orgId && authHeader && authHeader.startsWith("Bearer ")) {
                const tokenValue = authHeader.replace("Bearer ", "").trim();
                const token = await enrollmentStore.getToken(tokenValue, workspaceId);
                if (!token || token.org_id !== orgId || token.revoked) {
                    return NextResponse.json({ error: "Unauthorized: Invalid deployment token" }, { status: 401 });
                }
            } else if (!orgId) {
                return NextResponse.json({ error: "Unauthorized: Missing identity headers" }, { status: 401 });
            }
        }

        // ISSUE 3 FIX: Use cachedPolicies FROM the extension if provided.
        // This is the most up-to-date policy set the user's extension has.
        // Fall back to fetching from the database if not supplied.
        let rules: any[] = [];

        if (body.cachedPolicies && Array.isArray(body.cachedPolicies) && body.cachedPolicies.length > 0) {
            // Extension sent its locally-cached policies — use them directly
            rules = body.cachedPolicies;
            console.log(`[scanPrompt] Using ${rules.length} extension-cached policy rules.`);
        } else if (orgId) {
            // Fall back to DB lookup
            let groupId = null;
            const org = await enrollmentStore.getOrganization(orgId, workspaceId);
            if (org?.policy_config?.rules) {
                rules = org.policy_config.rules;
            }

            if (userEmail && userEmail !== "unknown@domain.com") {
                try {
                    const users = await userStore.listUsers(orgId, workspaceId);
                    const foundUser = users.find((u: any) => u.email === userEmail);
                    if (foundUser?.group_id) groupId = foundUser.group_id;
                } catch (e) {
                    console.error("Could not fetch user group", e);
                }
            }

            if (groupId) {
                const groupPolicy = await groupStore.getPolicyByGroup(groupId, workspaceId);
                const groupRules = groupPolicy?.rules || [];
                if (groupRules.length > 0) {
                    rules = groupPolicy?.inherit_org_default ? [...rules, ...groupRules] : groupRules;
                }
            }
        }

        const systemPrompt = `You are a strict enterprise AI security compliance officer.
You are evaluating an employee's prompt to an AI tool (${aiTool}).
Your primary job is to prevent data leakage and enforce policy.

CRITICAL: If the prompt contains ANY of the following, you MUST block or redact it:
- AWS access keys (AKIA...)
- API keys, secret keys, tokens
- Social Security Numbers (SSN)
- Passwords or credentials
- Credit card numbers
- Private keys or certificates

Policy rules for this user:
${JSON.stringify(rules.length ? rules : [{ type: "baseline", action: "monitor", description: "Block critical data leaks, secrets, PII." }], null, 2)}

Return a JSON object with this EXACT schema:
{
  "action": "allow" | "block" | "redact" | "warn",
  "message": "Reason for block/redaction",
  "redactedText": "Cleaned text (only if action=redact)",
  "riskScore": <0-100>
}

Rules:
1. If prompt contains AWS keys, API secrets, SSNs, passwords and policy says block → action MUST be "block"
2. If prompt contains sensitive data that can be masked → action is "redact"
3. If prompt matches a 'warn' rule or is high risk but not blocked → action is "warn"
4. If prompt is safe → action is "allow", riskScore < 30
5. NEVER return "allow" if secrets are present. Unsafe prompts must NEVER be marked SAFE.`;

        const userContextMessage = context ? `Context:\n${Array.isArray(context) ? context.join('\n---') : context}\n\n` : "";

        let userContent: any = `${userContextMessage}Prompt to evaluate:\n${promptText}`;
        if (typeof promptText === 'string' && promptText.startsWith('data:image/')) {
            userContent = [
                { type: "text", text: `${userContextMessage}Analyze this image/screenshot for sensitive data, secrets, or policy violations according to the system prompt.` },
                { type: "image_url", image_url: { url: promptText } }
            ];
        }

        const llmResponse = await openai.chat.completions.create({
            model: process.env.OPENROUTER_MODEL || "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 1000,
        });

        const resultText = llmResponse.choices[0]?.message?.content || "{}";
        let parsedResult: any = {};

        try {
            parsedResult = JSON.parse(resultText);
        } catch (e) {
            console.error("LLM failed to return valid JSON", resultText);
            parsedResult = { action: "allow", message: "Evaluation error", riskScore: 0 };
        }

        // NEVER let LLM override a clear DLP violation
        // Server-side DLP safety net
        const criticalPatterns = [
            /\b(AKIA|AGPA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,20}\b/,
            /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/,
            /\b(?!000|666|9\d{2})\d{3}-\d{2}-\d{4}\b/,
        ];
        const hasCritical = criticalPatterns.some(p => p.test(promptText));
        if (hasCritical && parsedResult.action === "allow") {
            console.warn("[scanPrompt] LLM returned 'allow' but DLP found critical data — overriding to 'block'");
            parsedResult.action = "block";
            parsedResult.riskScore = Math.max(parsedResult.riskScore || 0, 90);
            parsedResult.message = "Critical sensitive data detected (server-side override).";
        }

        console.log(`[scanPrompt] Final: action=${parsedResult.action} | riskScore=${parsedResult.riskScore} | tool=${aiTool}`);

        return NextResponse.json({
            riskScore: parsedResult.riskScore || 0,
            action: parsedResult.action || "allow",
            message: parsedResult.message || "",
            redactedText: parsedResult.redactedText || "",
            categories: ["llm_evaluated"],
            riskCategory: parsedResult.riskScore > 75 ? "critical" : (parsedResult.riskScore > 50 ? "high" : "low"),
            policyViolation: parsedResult.action === "block",
            details: [parsedResult.message],
        });

    } catch (err: any) {
        console.error("LLM evaluation failed:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
