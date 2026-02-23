import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

const DEFAULT_POLICY_SCHEMA = {
    risk_threshold: 60,
    block_high_risk: true,
    auto_redaction: true,
    audit_mode: false,
    scan_attachments: false,
    retention_days: 90
};

/**
 * Update policy config for an organization.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
    try {
        const body = await req.json();
        const { policy_config } = body;
        const { org_id } = await params;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        if (!policy_config || typeof policy_config !== 'object') {
            return NextResponse.json({ error: "policy_config must be an object" }, { status: 400 });
        }

        // Schema Validation
        const allowedKeys = Object.keys(DEFAULT_POLICY_SCHEMA);
        const extraKeys = Object.keys(policy_config).filter(k => !allowedKeys.includes(k));

        if (extraKeys.length > 0) {
            return NextResponse.json({ error: `Invalid keys found: ${extraKeys.join(", ")}` }, { status: 400 });
        }

        if (typeof policy_config.risk_threshold !== "number" || policy_config.risk_threshold < 0 || policy_config.risk_threshold > 100) {
            return NextResponse.json({ error: "risk_threshold must be a number between 0 and 100" }, { status: 400 });
        }

        if (typeof policy_config.block_high_risk !== "boolean") {
            return NextResponse.json({ error: "block_high_risk must be a boolean" }, { status: 400 });
        }

        if (typeof policy_config.retention_days !== "number" || policy_config.retention_days < 1) {
            return NextResponse.json({ error: "retention_days must be a positive number" }, { status: 400 });
        }

        const org = await enrollmentStore.updatePolicy(org_id, policy_config, workspaceId);
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json({
            status: "ok",
            org_id: org.org_id,
            policy_version: org.policy_version,
            policy_config: org.policy_config
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
