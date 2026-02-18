/**
 * /api/proxy/intercept — POST
 * The proxy endpoint. Receives AI requests, classifies them,
 * logs activity events, applies policy (block/redact), and forwards to the AI provider.
 *
 * Supports both text/JSON prompts and multipart attachment uploads.
 * Latency target: < 250ms added overhead (classification is regex-based, not LLM-based).
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";
import {
    classifyContent,
    estimateTokens,
    hashString,
    extractToolDomain,
    identifyTool,
    redactSensitiveContent,
} from "@/lib/proxy-classifier";
import type { ActivityEvent, AttachmentScanResult, SensitivityCategory } from "@/lib/proxy-types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const queryWorkspaceId = searchParams.get("workspaceId");

    try {
        const body = await req.json();
        const workspaceId = body.workspace_id || queryWorkspaceId || "default";
        const settings = await store.getSettings(workspaceId);

        const {
            target_url,
            method,
            headers: reqHeaders,
            body: reqBody,
            user_id,
            log_only,
            // Attachment-specific fields from the proxy server
            is_attachment_upload,
            attachments,
        } = body;

        // In log_only mode (from the local proxy server), we skip the
        // proxy_enabled check because the proxy itself is the source.
        // For direct API calls, we still require proxy_enabled.
        if (!log_only && !settings.proxy_enabled) {
            return NextResponse.json(
                { error: "Proxy monitoring is not enabled" },
                { status: 403 }
            );
        }

        if (!target_url) {
            return NextResponse.json(
                { error: "Missing required field: target_url" },
                { status: 400 }
            );
        }

        const startTime = Date.now();

        // ── 1. Capture metadata ──
        const domain = extractToolDomain(target_url);
        const tool = identifyTool(domain);
        const userHash = hashString(user_id || "anonymous");

        let apiEndpoint = "/";
        try {
            apiEndpoint = new URL(target_url).pathname;
        } catch {
            apiEndpoint = target_url;
        }

        let classification;
        let promptLength: number;
        let tokenEstimate: number;
        let promptHash: string;

        if (is_attachment_upload && Array.isArray(attachments) && attachments.length > 0) {
            // ── Attachment Upload Classification ──────────────────────────────────────
            // Derive classification from aggregated attachment scan results
            const typedAttachments = attachments as AttachmentScanResult[];

            // Aggregate detected categories from all files
            const allRawCategories: string[] = [];
            let totalSensitivityPoints = 0;
            for (const att of typedAttachments) {
                totalSensitivityPoints += att.sensitivity_points || 0;
                if (att.detected_categories) {
                    allRawCategories.push(...att.detected_categories);
                }
            }

            // Map DLP scanner category names → proxy classifier SensitivityCategory
            const categoryMapping: Record<string, SensitivityCategory> = {
                "SSN": "pii",
                "Credit Card": "financial",
                "Bank Account/Routing": "financial",
                "Email Address": "pii",
                "Phone Number": "pii",
                "Employee ID": "pii",
                "Personal Name": "pii",
                "Medical Terminology": "phi",
                "Private Key Block": "trade_secret",
                "API Key (High Entropy)": "trade_secret",
                "Structured Dataset with PII": "pii",
            };

            const mappedCategories = new Set<SensitivityCategory>();
            for (const raw of allRawCategories) {
                // Match by prefix (e.g. "SSN (2)" -> "SSN")
                const key = Object.keys(categoryMapping).find(k => raw.startsWith(k));
                if (key) mappedCategories.add(categoryMapping[key]);
            }

            const categories: SensitivityCategory[] = mappedCategories.size > 0
                ? Array.from(mappedCategories)
                : ["none"];

            // Normalize sensitivity points to 0–100 score
            const rawScore = Math.min(Math.round((totalSensitivityPoints / 50) * 100), 100);
            const hasCritical = categories.includes("phi") ||
                (categories.includes("pii") && categories.length > 1);
            let riskCategory: string;
            if (hasCritical || rawScore >= 80) riskCategory = "critical";
            else if (rawScore >= 50) riskCategory = "high";
            else if (rawScore >= 25) riskCategory = "moderate";
            else riskCategory = "low";

            const policyViolation = categories.some((c) =>
                ["pii", "phi", "trade_secret", "financial"].includes(c)
            );

            classification = {
                categories_detected: categories,
                sensitivity_score: rawScore,
                policy_violation_flag: policyViolation,
                risk_category: riskCategory,
                details: typedAttachments.map(a =>
                    `${a.filename} (${a.file_type}, ${Math.round(a.file_size / 1024)}KB): ${a.sensitivity_points} pts`
                ),
            };

            // Prompt-equivalent fields for attachments
            const totalBytes = typedAttachments.reduce((s, a) => s + (a.file_size || 0), 0);
            promptLength = totalBytes;
            tokenEstimate = Math.ceil(totalBytes / 4);
            promptHash = hashString(typedAttachments.map(a => a.filename).join(","));
        } else {
            // ── Text / JSON Prompt Classification ────────────────────────────────────
            const contentToClassify = reqBody || "";
            promptLength = contentToClassify.length;
            tokenEstimate = estimateTokens(contentToClassify);
            promptHash = hashString(contentToClassify);
            classification = classifyContent(contentToClassify);
        }

        // ── 2. Build structured activity event ───────────────────────────────────────
        const event: ActivityEvent = {
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            tool,
            tool_domain: domain,
            user_hash: userHash,
            prompt_hash: promptHash,
            prompt_length: promptLength,
            token_count_estimate: tokenEstimate,
            api_endpoint: apiEndpoint,
            sensitivity_score: classification.sensitivity_score,
            sensitivity_categories: classification.categories_detected,
            policy_violation_flag: classification.policy_violation_flag,
            risk_category: classification.risk_category,
            timestamp: new Date().toISOString(),
        };

        // ── 3. Attachment metadata ────────────────────────────────────────────────────
        if (is_attachment_upload && Array.isArray(attachments) && attachments.length > 0) {
            event.is_attachment_upload = true;
            event.attachment_count = attachments.length;
            event.attachment_filenames = (attachments as AttachmentScanResult[]).map(a => a.filename);
            event.attachment_types = [...new Set((attachments as AttachmentScanResult[]).map(a => a.file_type))];
            event.attachments = attachments as AttachmentScanResult[];
        }

        // ── 4. Full Audit Mode ────────────────────────────────────────────────────────
        if (settings.full_audit_mode && !is_attachment_upload) {
            event.full_prompt = reqBody || "";
        }

        // ── 5. Block flag ─────────────────────────────────────────────────────────────
        if (settings.block_high_risk && classification.risk_category === "critical") {
            event.blocked = true;
        }

        // Log the event
        await store.addEvent(event, workspaceId);

        const processingTime = Date.now() - startTime;

        // ── 6. Log-only mode (from proxy server) ─────────────────────────────────────
        if (log_only) {
            return NextResponse.json({
                logged: true,
                event_id: event.id,
                tool,
                is_attachment_upload: !!is_attachment_upload,
                attachment_count: event.attachment_count ?? 0,
                sensitivity_score: classification.sensitivity_score,
                risk_category: classification.risk_category,
                categories: classification.categories_detected,
                processing_time_ms: processingTime,
            });
        }

        // ── 7. Policy enforcement (forward mode — text-only path) ─────────────────────
        if (settings.block_high_risk && classification.risk_category === "critical") {
            return NextResponse.json({
                blocked: true,
                reason: is_attachment_upload
                    ? `Attachment blocked by policy: sensitive content detected in ${event.attachment_count} file(s)`
                    : "Prompt blocked by policy: critical sensitivity level detected",
                classification: {
                    sensitivity_score: classification.sensitivity_score,
                    categories: classification.categories_detected,
                    details: classification.details,
                },
                event_id: event.id,
                processing_time_ms: processingTime,
            });
        }

        // ── 8. Prepare forwarded body (text path only — attachments forwarded by proxy) ──
        let forwardBody = reqBody || "";
        if (!is_attachment_upload && settings.redact_sensitive && classification.policy_violation_flag) {
            forwardBody = redactSensitiveContent(forwardBody);
        }

        // ── 9. Forward to original AI provider ──
        const forwardHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...(reqHeaders || {}),
        };

        const aiResponse = await fetch(target_url, {
            method: method || "POST",
            headers: forwardHeaders,
            body: forwardBody,
        });

        const aiData = await aiResponse.text();

        // ── 10. Return response to user with metadata ──
        return new NextResponse(aiData, {
            status: aiResponse.status,
            headers: {
                "Content-Type": aiResponse.headers.get("Content-Type") || "application/json",
                "X-Complyze-Event-Id": event.id,
                "X-Complyze-Sensitivity": classification.sensitivity_score.toString(),
                "X-Complyze-Is-Attachment": is_attachment_upload ? "true" : "false",
                "X-Complyze-Processing-Ms": (Date.now() - startTime).toString(),
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Proxy error";
        console.error("[/api/proxy/intercept]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
