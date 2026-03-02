import { NextResponse } from "next/server";
import { AI_TOOL_REGISTRY, AI_CATEGORY_REGISTRY, REGISTRY_VERSION } from "@/lib/ai-tool-registry";

export const dynamic = "force-static"; // registry is static data — cache aggressively

/**
 * GET /api/admin/tool-registry
 * Returns the full versioned AI tool + category registry.
 * Clients use this to populate the rule builder without knowing domain lists.
 */
export async function GET() {
    return NextResponse.json(
        {
            version: REGISTRY_VERSION,
            tools: Object.values(AI_TOOL_REGISTRY).map(t => ({
                id: t.id,
                display_name: t.display_name,
                vendor: t.vendor,
                category: t.category,
                risk_tier: t.risk_tier,
                description: t.description,
                // domains intentionally omitted from client response
                // resolution happens server-side in policy engine
                domain_count: t.domains.length,
            })),
            categories: Object.values(AI_CATEGORY_REGISTRY).map(c => ({
                id: c.id,
                display_name: c.display_name,
                description: c.description,
                tool_count: c.tools.length,
                tools: c.tools,
            })),
        },
        {
            headers: {
                "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
                "X-Registry-Version": REGISTRY_VERSION,
            },
        }
    );
}
