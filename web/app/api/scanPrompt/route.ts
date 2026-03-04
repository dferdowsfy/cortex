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
        // Support promptText or prompt for backwards compatibility
        const promptText = body.promptText || body.prompt;
        const aiTool = body.aiTool || "Unknown Tool";
        const workspaceId = body.workspaceId || "default";
        const context = body.context || "";

        const orgId = req.headers.get("X-Organization-ID");
        const authHeader = req.headers.get("Authorization");
        const userEmail = req.headers.get("X-User-Email");

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

        // Determine user/group policies
        let rules: any[] = [];
        let groupId = null;

        if (orgId) {
            // Fetch org policy
            const org = await enrollmentStore.getOrganization(orgId, workspaceId);
            if (org && org.policy_config && org.policy_config.rules) {
                rules = org.policy_config.rules;
            }

            // Fetch user mapping mapping
            if (userEmail && userEmail !== "unknown@domain.com") {
                try {
                    const users = await userStore.listUsers(orgId, workspaceId);
                    const foundUser = users.find(u => u.email === userEmail);
                    if (foundUser && foundUser.group_id) {
                        groupId = foundUser.group_id;
                    }
                } catch (e) {
                    console.error("Could not fetch user to determine group policy", e);
                }
            }

            // Overlay group policy
            if (groupId) {
                const groupPolicy = await groupStore.getPolicyByGroup(groupId, workspaceId);
                if (groupPolicy && groupPolicy.rules && groupPolicy.rules.length > 0) {
                    if (!groupPolicy.inherit_org_default) {
                        rules = groupPolicy.rules;
                    } else {
                        rules = [...rules, ...groupPolicy.rules];
                    }
                }
            }
        }

        const systemPrompt = `You are a strict enterprise compliance officer evaluating an employee's prompt to an AI tool (${aiTool}).
Your goal is to enforce the company's Data Loss Prevention (DLP) and Acceptable Use policies.

Here are the specific policy rules defined for this user's group/organization:
${JSON.stringify(rules.length ? rules : [{ type: "baseline", action: "monitor", description: "Standard acceptable use policy. Block critical data leaks." }], null, 2)}

You must return a JSON object with this exact schema:
{
  "action": "allow" | "block" | "redact",
  "message": "Reason for block/redaction (shown to user if action is not allow)",
  "redactedText": "The sanitized text (only if action is redact; replace sensitive portions with [REDACTED])",
  "riskScore": <integer representing risk from 0-100>
}

Instructions:
1. Examine the user's Prompt alongside the provided Conversational Context.
2. If the Prompt violates any "block" rules heavily, set action to "block" and provide a direct message.
3. If the Prompt violates "redact" rules or contains sensitive data that can be sanitized, set action to "redact" and provide the "redactedText".
4. If it is safe or only triggers "audit_only"/"allow" rules, set action to "allow".
5. Calculate a riskScore from 0 (safe) to 100 (critical violation).
`;

        const userContextMessage = context ? `Conversational Context:\n${Array.isArray(context) ? context.join('\\n---') : context}\n\n` : "";
        const finalUserMessage = `${userContextMessage}User Prompt to evaluate:\n${promptText}`;

        const llmResponse = await openai.chat.completions.create({
            model: process.env.OPENROUTER_MODEL || "gpt-4o-mini", // Use OpenRouter or fallback to standard model
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: finalUserMessage }
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
            parsedResult = {
                action: "allow",
                message: "Evaluation error, fail-open applied",
                redactedText: "",
                riskScore: 0
            };
        }

        return NextResponse.json({
            riskScore: parsedResult.riskScore || 0,
            action: parsedResult.action || "allow",
            message: parsedResult.message || "",
            redactedText: parsedResult.redactedText || "",
            // Additional structure for backward compatibility with the frontend if needed
            categories: ["llm_evaluated"],
            riskCategory: parsedResult.riskScore > 75 ? "critical" : (parsedResult.riskScore > 50 ? "high" : "low"),
            policyViolation: parsedResult.action === "block",
            details: [parsedResult.message]
        });

    } catch (err: any) {
        console.error("LLM evaluation failed:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
