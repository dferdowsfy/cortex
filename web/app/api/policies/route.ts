import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";
import { groupStore } from "@/lib/group-store";
import { userStore } from "@/lib/user-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/policies
 * Returns JSON array of policy rules for the extension.
 */
export async function GET(req: NextRequest) {
    try {
        const orgId = req.headers.get("X-Organization-ID");
        const authHeader = req.headers.get("Authorization");
        const userEmail = req.headers.get("X-User-Email");

        if (!orgId || !authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ error: "X-Organization-ID and Authorization Bearer headers are required" }, { status: 400 });
        }

        const tokenValue = authHeader.replace("Bearer ", "").trim();
        const workspaceId = "default"; // or dynamically if needed in multi-tenant environments

        if (!process.env.DEBUG_BYPASS) {
            // Validate token
            const token = await enrollmentStore.getToken(tokenValue, workspaceId);
            if (!token) {
                return NextResponse.json({ error: "Invalid or expired deployment token" }, { status: 401 });
            }

            if (token.org_id !== orgId) {
                return NextResponse.json({ error: "Token does not match provided Organization ID" }, { status: 403 });
            }

            if (token.revoked) {
                return NextResponse.json({ error: "Token has been revoked" }, { status: 403 });
            }
        } // end !DEBUG_BYPASS

        // Determine user/group policies
        let rules: any[] = [];
        let groupId = null;

        // Fetch org policy
        const org = await enrollmentStore.getOrganization(orgId, workspaceId);
        if (org && org.policy_config && org.policy_config.rules) {
            rules = org.policy_config.rules;
        }

        // Fetch user mapping mapping
        if (userEmail) {
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

        return NextResponse.json(rules);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
