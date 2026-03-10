import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/user-store";
import { enrollmentStore } from "@/lib/enrollment-store";
import { groupStore } from "@/lib/group-store";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/license
 * Activates the extension using a license key.
 * 
 * Body: { licenseKey, installationId, agentVersion }
 * Response: { user, orgId, orgName, shieldActive, ssoToken, policies }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { licenseKey, installationId, agentVersion = "1.2.0" } = body;
        const workspaceId = "default"; // Simplified for now

        if (!licenseKey) {
            return NextResponse.json({ error: "License key is required" }, { status: 400 });
        }

        // 1. Find user by license key
        const user = await userStore.getUserByLicenseKey(licenseKey, workspaceId);
        if (!user) {
            return NextResponse.json({ error: "Invalid license key" }, { status: 401 });
        }

        if (!user.active) {
            return NextResponse.json({ error: "License has been revoked" }, { status: 403 });
        }

        // 2. Fetch Org info
        const org = await enrollmentStore.getOrganization(user.org_id, workspaceId);
        const orgName = org?.name || "Corporate";

        // 3. Register/Update Device
        if (installationId) {
            // Update managed user's enrollment info
            await userStore.updateUser(user.user_id, {
                enrolled_at: new Date().toISOString(),
                last_seen: new Date().toISOString()
            } as any, workspaceId);

            // Create device record
            await enrollmentStore.createDevice(
                installationId,
                user.org_id,
                "browser_extension",
                agentVersion,
                crypto.createHash('sha256').update(installationId).digest('hex'), // Dummy secret for ext
                user.display_name || user.email,
                workspaceId
            );
        }

        // 4. Fetch Policies for the user/group
        let rules: any[] = [];
        if (org?.policy_config?.rules) rules = org.policy_config.rules;

        let plan = user.plan || "SAFE";
        let role = user.role || "user";
        let features = user.features || {
            promptMonitoring: true,
            sensitiveDataDetection: true,
            riskScore: true,
            aiAppDetection: true,
            alerts: true,
            redaction: false,
            blocking: false,
            attachmentScanning: false,
            adminDashboard: false,
            auditLogs: false,
            teamPolicies: false,
            sso: false,
            apiAccess: false
        };

        if (user.group_id) {
            const groupPolicy = await groupStore.getPolicyByGroup(user.group_id, workspaceId);
            if (groupPolicy?.rules) {
                rules = groupPolicy.inherit_org_default ? [...rules, ...groupPolicy.rules] : groupPolicy.rules;
            }
        }

        // 5. Generate SSO Token
        const ssoToken = crypto.randomBytes(24).toString("base64url");
        // Optional: Save SSO token for dashboard auto-login

        return NextResponse.json({
            ok: true,
            uid: user.user_id,
            email: user.email,
            displayName: user.display_name || user.email.split('@')[0],
            orgId: user.org_id,
            orgName,
            shieldActive: true,
            ssoToken,
            policies: rules,
            dashboardUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3737",
            plan,
            role,
            features
        });

    } catch (err: any) {
        console.error("[auth/license] activation failed:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
