/**
 * Complyze AI Tool Registry
 * Versioned, canonical mapping of AI tools → domains + API endpoints.
 * Policy engine resolves structured rules against this at evaluation time.
 * Admins select tools/categories; the engine handles domain resolution.
 */

export const REGISTRY_VERSION = "2026.03.1";

export type ToolId =
    | "chatgpt"
    | "claude"
    | "gemini"
    | "perplexity"
    | "copilot"
    | "grok"
    | "mistral"
    | "cohere"
    | "midjourney"
    | "stablediffusion"
    | "github_copilot"
    | "cursor"
    | "codeium"
    | "tabnine"
    | "google_ai_studio"
    | "openrouter";

export type ToolCategory =
    | "generative_ai"
    | "code_assistants"
    | "public_llm_apis"
    | "ai_image_tools";

export interface RegistryTool {
    id: ToolId;
    display_name: string;
    vendor: string;
    category: ToolCategory;
    /** All hostnames this tool routes through */
    domains: string[];
    /** Known API endpoint prefixes (for deep inspection) */
    api_endpoints: string[];
    /** Whether the tool supports cert pinning (desktop bypass needed) */
    cert_pinned?: boolean;
    risk_tier: "critical" | "high" | "moderate" | "low";
    description: string;
}

export const AI_TOOL_REGISTRY: Record<ToolId, RegistryTool> = {
    chatgpt: {
        id: "chatgpt",
        display_name: "ChatGPT",
        vendor: "OpenAI",
        category: "generative_ai",
        domains: ["chatgpt.com", "chat.openai.com", "openai.com"],
        api_endpoints: ["/api/", "/backend-api/", "/v1/"],
        cert_pinned: true,
        risk_tier: "high",
        description: "Consumer + enterprise generative AI by OpenAI.",
    },
    claude: {
        id: "claude",
        display_name: "Claude",
        vendor: "Anthropic",
        category: "generative_ai",
        domains: ["claude.ai", "anthropic.com"],
        api_endpoints: ["/api/", "/v1/messages"],
        risk_tier: "high",
        description: "Constitutional AI assistant by Anthropic.",
    },
    gemini: {
        id: "gemini",
        display_name: "Gemini",
        vendor: "Google",
        category: "generative_ai",
        domains: ["gemini.google.com", "bard.google.com", "generativelanguage.googleapis.com"],
        api_endpoints: ["/v1beta/", "/v1/"],
        cert_pinned: true,
        risk_tier: "high",
        description: "Google DeepMind's multimodal AI.",
    },
    perplexity: {
        id: "perplexity",
        display_name: "Perplexity",
        vendor: "Perplexity AI",
        category: "generative_ai",
        domains: ["perplexity.ai", "www.perplexity.ai"],
        api_endpoints: ["/api/", "/socket.io/"],
        risk_tier: "moderate",
        description: "AI-powered search and answer engine.",
    },
    copilot: {
        id: "copilot",
        display_name: "Copilot (Microsoft)",
        vendor: "Microsoft",
        category: "generative_ai",
        domains: ["copilot.microsoft.com", "bing.com", "sydney.bing.com"],
        api_endpoints: ["/turing/", "/v1/chat"],
        cert_pinned: true,
        risk_tier: "high",
        description: "Microsoft's AI assistant integrated across M365.",
    },
    grok: {
        id: "grok",
        display_name: "Grok",
        vendor: "xAI",
        category: "generative_ai",
        domains: ["grok.x.ai", "x.com"],
        api_endpoints: ["/api/grok/"],
        risk_tier: "high",
        description: "xAI's LLM embedded in X (Twitter).",
    },
    mistral: {
        id: "mistral",
        display_name: "Mistral AI",
        vendor: "Mistral AI",
        category: "public_llm_apis",
        domains: ["mistral.ai", "api.mistral.ai"],
        api_endpoints: ["/v1/"],
        risk_tier: "moderate",
        description: "Open-weight LLM API provider.",
    },
    cohere: {
        id: "cohere",
        display_name: "Cohere",
        vendor: "Cohere",
        category: "public_llm_apis",
        domains: ["cohere.com", "api.cohere.ai"],
        api_endpoints: ["/v1/", "/v2/"],
        risk_tier: "moderate",
        description: "Enterprise NLP APIs.",
    },
    midjourney: {
        id: "midjourney",
        display_name: "Midjourney",
        vendor: "Midjourney Inc.",
        category: "ai_image_tools",
        domains: ["midjourney.com", "www.midjourney.com", "discord.com"],
        api_endpoints: ["/api/app/"],
        risk_tier: "low",
        description: "AI image generation via Discord and web.",
    },
    stablediffusion: {
        id: "stablediffusion",
        display_name: "Stable Diffusion (DreamStudio)",
        vendor: "Stability AI",
        category: "ai_image_tools",
        domains: ["dreamstudio.ai", "platform.stability.ai", "stability.ai"],
        api_endpoints: ["/v1/", "/v2beta/"],
        risk_tier: "low",
        description: "Open-source image generation, hosted API.",
    },
    github_copilot: {
        id: "github_copilot",
        display_name: "GitHub Copilot",
        vendor: "GitHub (Microsoft)",
        category: "code_assistants",
        domains: ["copilot.github.com", "api.githubcopilot.com", "github.com"],
        api_endpoints: ["/api/", "/copilot/"],
        cert_pinned: true,
        risk_tier: "high",
        description: "AI pair programming in IDEs.",
    },
    cursor: {
        id: "cursor",
        display_name: "Cursor",
        vendor: "Anysphere",
        category: "code_assistants",
        domains: ["cursor.sh", "www.cursor.com", "api2.cursor.sh"],
        api_endpoints: ["/api/", "/aiserver/"],
        cert_pinned: true,
        risk_tier: "high",
        description: "AI-first code editor.",
    },
    codeium: {
        id: "codeium",
        display_name: "Codeium",
        vendor: "Codeium",
        category: "code_assistants",
        domains: ["codeium.com", "server.codeium.com"],
        api_endpoints: ["/exa.language_server/"],
        risk_tier: "moderate",
        description: "Free AI code completion.",
    },
    tabnine: {
        id: "tabnine",
        display_name: "Tabnine",
        vendor: "Tabnine",
        category: "code_assistants",
        domains: ["tabnine.com", "api.tabnine.com"],
        api_endpoints: ["/api/v2/"],
        risk_tier: "moderate",
        description: "AI code completion with local model option.",
    },
    google_ai_studio: {
        id: "google_ai_studio",
        display_name: "Google AI Studio",
        vendor: "Google",
        category: "generative_ai",
        domains: ["aistudio.google.com"],
        api_endpoints: ["/v1beta/", "/v1/"],
        risk_tier: "high",
        description: "Google AI Studio — direct API access and prompt testing for Gemini models.",
    },
    openrouter: {
        id: "openrouter",
        display_name: "OpenRouter",
        vendor: "OpenRouter AI",
        category: "public_llm_apis",
        domains: ["openrouter.ai"],
        api_endpoints: ["/api/v1/"],
        risk_tier: "high",
        description: "OpenRouter — unified API and chat UI for 200+ LLM models.",
    },
};

export type CategoryId = ToolCategory;

export interface RegistryCategory {
    id: CategoryId;
    display_name: string;
    description: string;
    tools: ToolId[];
}

export const AI_CATEGORY_REGISTRY: Record<CategoryId, RegistryCategory> = {
    generative_ai: {
        id: "generative_ai",
        display_name: "Generative AI",
        description: "Chat interfaces and general-purpose LLMs.",
        tools: ["chatgpt", "claude", "gemini", "google_ai_studio", "perplexity", "copilot", "grok"],
    },
    code_assistants: {
        id: "code_assistants",
        display_name: "Code Assistants",
        description: "AI tools embedded in IDEs and editors.",
        tools: ["github_copilot", "cursor", "codeium", "tabnine"],
    },
    public_llm_apis: {
        id: "public_llm_apis",
        display_name: "Public LLM APIs",
        description: "Developer-facing API endpoints for AI models.",
        tools: ["mistral", "cohere", "openrouter"],
    },
    ai_image_tools: {
        id: "ai_image_tools",
        display_name: "AI Image Tools",
        description: "Image generation and creative AI platforms.",
        tools: ["midjourney", "stablediffusion"],
    },
};

/**
 * Resolves a structured policy rule target to concrete domains + endpoints.
 * Called by policy engine at evaluation time — not stored directly.
 */
export function resolveToolDomains(toolId: ToolId): string[] {
    return AI_TOOL_REGISTRY[toolId]?.domains ?? [];
}

export function resolveCategoryDomains(categoryId: CategoryId): string[] {
    const cat = AI_CATEGORY_REGISTRY[categoryId];
    if (!cat) return [];
    return cat.tools.flatMap(tid => AI_TOOL_REGISTRY[tid]?.domains ?? []);
}

/** Produces the serialized target string stored in PolicyRule.target */
export function serializeRuleTarget(
    targetType: RuleTargetType,
    toolId?: ToolId,
    categoryIds?: CategoryId[],
    rawValue?: string
): string {
    switch (targetType) {
        case "ai_tool": return `tool:${toolId}`;
        case "ai_category": return `category:${(categoryIds ?? []).join(",")}`;
        case "domain": return `domain:${rawValue ?? ""}`;
        case "pattern": return `pattern:${rawValue ?? ""}`;
        default: return rawValue ?? "";
    }
}

export type RuleTargetType = "ai_tool" | "ai_category" | "domain" | "pattern";

/** Parse a stored target string back into structured form */
export function parseRuleTarget(target: string): {
    type: RuleTargetType;
    toolId?: ToolId;
    categoryIds?: CategoryId[];
    rawValue?: string;
    displayLabel: string;
} {
    if (target.startsWith("tool:")) {
        const id = target.slice(5) as ToolId;
        return { type: "ai_tool", toolId: id, displayLabel: AI_TOOL_REGISTRY[id]?.display_name ?? id };
    }
    if (target.startsWith("category:")) {
        const ids = target.slice(9).split(",") as CategoryId[];
        return {
            type: "ai_category", categoryIds: ids,
            displayLabel: ids.map(id => AI_CATEGORY_REGISTRY[id]?.display_name ?? id).join(", "),
        };
    }
    if (target.startsWith("domain:")) {
        const raw = target.slice(7);
        return { type: "domain", rawValue: raw, displayLabel: raw };
    }
    if (target.startsWith("pattern:")) {
        const raw = target.slice(8);
        return { type: "pattern", rawValue: raw, displayLabel: raw };
    }
    // Legacy string — treat as domain target
    return { type: "domain", rawValue: target, displayLabel: target };
}
