import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir, platform } from "os";
import { join, basename } from "path";

/**
 * Server-side local discovery — scans the machine running the Next.js server
 * for AI tools (installed apps, processes, IDE extensions, browser extensions).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* ── Known AI Tool Signatures ── */

const AI_APPS: Record<string, { vendor: string; tier: string }> = {
  ChatGPT: { vendor: "OpenAI", tier: "Free" },
  Claude: { vendor: "Anthropic", tier: "Free" },
  Cursor: { vendor: "Anysphere", tier: "Pro" },
  Windsurf: { vendor: "Codeium", tier: "Free" },
  "GitHub Copilot": { vendor: "GitHub / Microsoft", tier: "Pro" },
  Copilot: { vendor: "Microsoft", tier: "Pro" },
  Notion: { vendor: "Notion Labs", tier: "Plus" },
  Grammarly: { vendor: "Grammarly Inc.", tier: "Free" },
  Zoom: { vendor: "Zoom", tier: "Pro" },
  Slack: { vendor: "Salesforce / Slack", tier: "Pro" },
  "Microsoft Teams": { vendor: "Microsoft", tier: "Business" },
  Raycast: { vendor: "Raycast", tier: "Pro" },
  Arc: { vendor: "The Browser Company", tier: "Free" },
  Warp: { vendor: "Warp", tier: "Free" },
  Figma: { vendor: "Figma (Adobe)", tier: "Professional" },
  Canva: { vendor: "Canva Pty Ltd", tier: "Free" },
  Perplexity: { vendor: "Perplexity AI", tier: "Free" },
  Gemini: { vendor: "Google", tier: "Enterprise" },
};

const AI_PROCESS_KEYWORDS = [
  "chatgpt", "openai", "copilot", "cursor", "claude", "anthropic",
  "grammarly", "otter", "notion", "jasper", "codeium",
  "tabnine", "windsurf", "perplexity", "pieces", "raycast", "gemini",
];

const AI_VSCODE_EXTENSIONS: Record<string, { tool: string; vendor: string }> = {
  "github.copilot": { tool: "GitHub Copilot", vendor: "GitHub / Microsoft" },
  "github.copilot-chat": { tool: "GitHub Copilot Chat", vendor: "GitHub / Microsoft" },
  "codeium.codeium": { tool: "Codeium", vendor: "Codeium" },
  "tabnine.tabnine-vscode": { tool: "Tabnine", vendor: "Tabnine" },
  "continue.continue": { tool: "Continue", vendor: "Continue Dev" },
  "amazonwebservices.amazon-q-vscode": { tool: "Amazon Q", vendor: "AWS" },
  "sourcegraph.cody-ai": { tool: "Sourcegraph Cody", vendor: "Sourcegraph" },
  "supermaven.supermaven": { tool: "Supermaven", vendor: "Supermaven" },
};

const AI_CHROME_KEYWORDS: Record<string, { tool: string; vendor: string }> = {
  grammarly: { tool: "Grammarly", vendor: "Grammarly Inc." },
  chatgpt: { tool: "ChatGPT Extension", vendor: "OpenAI" },
  perplexity: { tool: "Perplexity", vendor: "Perplexity AI" },
  copilot: { tool: "Microsoft Copilot", vendor: "Microsoft" },
  jasper: { tool: "Jasper", vendor: "Jasper AI" },
  monica: { tool: "Monica AI", vendor: "Monica" },
};

/* ── Helpers ── */

interface DiscoveredTool {
  tool_name: string;
  vendor: string;
  suggested_tier: string;
  source: string;
  detail: string;
  confidence: string;
}

function run(cmd: string): string {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      timeout: 5_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

/* ── Scanners ── */

function scanInstalledApps(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  if (platform() !== "darwin") return found;

  for (const dir of ["/Applications", join(homedir(), "Applications")]) {
    if (!existsSync(dir)) continue;
    try {
      for (const app of readdirSync(dir)) {
        const name = app.replace(/\.app$/, "");
        for (const [aiName, info] of Object.entries(AI_APPS)) {
          if (name.toLowerCase().includes(aiName.toLowerCase())) {
            found.push({
              tool_name: aiName,
              vendor: info.vendor,
              source: "Installed App",
              detail: `${dir}/${app}`,
              suggested_tier: info.tier,
              confidence: "high",
            });
          }
        }
      }
    } catch { /* skip */ }
  }
  return found;
}

function scanProcesses(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  const ps = run("ps aux 2>/dev/null");
  if (!ps) return found;

  const seen = new Set<string>();
  for (const line of ps.split("\n")) {
    const lower = line.toLowerCase();
    for (const kw of AI_PROCESS_KEYWORDS) {
      if (lower.includes(kw) && !seen.has(kw)) {
        seen.add(kw);
        for (const [aiName, info] of Object.entries(AI_APPS)) {
          if (aiName.toLowerCase().includes(kw)) {
            found.push({
              tool_name: aiName,
              vendor: info.vendor,
              source: "Running Process",
              detail: `Active process matching "${kw}"`,
              suggested_tier: info.tier,
              confidence: "medium",
            });
            break;
          }
        }
      }
    }
  }
  return found;
}

function scanIDEExtensions(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  const home = homedir();

  const ideDirs: Array<{ dir: string; name: string }> = [
    { dir: join(home, ".vscode", "extensions"), name: "VS Code" },
    { dir: join(home, ".vscode-insiders", "extensions"), name: "VS Code Insiders" },
    { dir: join(home, ".cursor", "extensions"), name: "Cursor" },
    { dir: join(home, ".windsurf", "extensions"), name: "Windsurf" },
  ];

  // Detect Cursor/Windsurf as AI tools themselves
  if (existsSync(join(home, ".cursor"))) {
    found.push({
      tool_name: "Cursor",
      vendor: "Anysphere",
      source: "IDE Installation",
      detail: "Cursor IDE detected",
      suggested_tier: "Pro",
      confidence: "high",
    });
  }
  if (existsSync(join(home, ".windsurf"))) {
    found.push({
      tool_name: "Windsurf",
      vendor: "Codeium",
      source: "IDE Installation",
      detail: "Windsurf IDE detected",
      suggested_tier: "Free",
      confidence: "high",
    });
  }

  for (const { dir, name } of ideDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const ext of readdirSync(dir)) {
        const extLower = ext.toLowerCase();
        for (const [extId, info] of Object.entries(AI_VSCODE_EXTENSIONS)) {
          if (extLower.startsWith(extId.toLowerCase())) {
            found.push({
              tool_name: info.tool,
              vendor: info.vendor,
              source: `${name} Extension`,
              detail: `${ext} in ${name}`,
              suggested_tier: "Pro",
              confidence: "high",
            });
          }
        }
      }
    } catch { /* skip */ }
  }
  return found;
}

function scanBrowserExtensions(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  const home = homedir();
  if (platform() !== "darwin") return found;

  const browsers: Array<{ dir: string; name: string }> = [
    {
      dir: join(home, "Library", "Application Support", "Google", "Chrome"),
      name: "Chrome",
    },
    {
      dir: join(home, "Library", "Application Support", "Microsoft Edge"),
      name: "Edge",
    },
    {
      dir: join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
      name: "Brave",
    },
    {
      dir: join(home, "Library", "Application Support", "Arc", "User Data"),
      name: "Arc",
    },
  ];

  for (const { dir: browserDir, name: browserName } of browsers) {
    if (!existsSync(browserDir)) continue;
    try {
      const profiles = readdirSync(browserDir).filter(
        (d) => d === "Default" || d.startsWith("Profile")
      );
      for (const profile of profiles) {
        const extDir = join(browserDir, profile, "Extensions");
        if (!existsSync(extDir)) continue;
        try {
          for (const extId of readdirSync(extDir)) {
            try {
              const versions = readdirSync(join(extDir, extId));
              for (const ver of versions) {
                const manifest = join(extDir, extId, ver, "manifest.json");
                if (!existsSync(manifest)) continue;
                const parsed = JSON.parse(readFileSync(manifest, "utf-8"));
                const extName = (parsed.name || "").toLowerCase();
                for (const [kw, info] of Object.entries(AI_CHROME_KEYWORDS)) {
                  if (extName.includes(kw)) {
                    found.push({
                      tool_name: info.tool,
                      vendor: info.vendor,
                      source: `${browserName} Extension`,
                      detail: `"${parsed.name}" in ${browserName} (${profile})`,
                      suggested_tier: "Free",
                      confidence: "high",
                    });
                  }
                }
                break;
              }
            } catch { /* can't parse */ }
          }
        } catch { /* no access */ }
      }
    } catch { /* skip */ }
  }
  return found;
}

/* ── Deduplicate ── */

function deduplicate(tools: DiscoveredTool[]): DiscoveredTool[] {
  const best = new Map<string, DiscoveredTool>();
  const confOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };

  for (const tool of tools) {
    const key = tool.tool_name.toLowerCase();
    const existing = best.get(key);
    if (
      !existing ||
      (confOrder[tool.confidence] || 0) > (confOrder[existing.confidence] || 0)
    ) {
      if (existing) {
        tool.detail = `${tool.detail}; also: ${existing.source}`;
      }
      best.set(key, tool);
    } else {
      existing.detail = `${existing.detail}; also: ${tool.source}`;
    }
  }
  return Array.from(best.values());
}

/* ── Curated AI Tool Registry (for cloud mode) ── */

const CURATED_AI_REGISTRY: DiscoveredTool[] = [
  { tool_name: "ChatGPT", vendor: "OpenAI", suggested_tier: "Enterprise", source: "AI Registry", detail: "Conversational AI assistant — widely used across organizations", confidence: "high" },
  { tool_name: "GitHub Copilot", vendor: "GitHub / Microsoft", suggested_tier: "Business", source: "AI Registry", detail: "AI pair programmer for code generation and completion", confidence: "high" },
  { tool_name: "Claude", vendor: "Anthropic", suggested_tier: "Enterprise", source: "AI Registry", detail: "AI assistant with extended context and document analysis", confidence: "high" },
  { tool_name: "Gemini", vendor: "Google", suggested_tier: "Enterprise", source: "AI Registry", detail: "Multimodal AI model with search integration", confidence: "high" },
  { tool_name: "Copilot", vendor: "Microsoft", suggested_tier: "Enterprise", source: "AI Registry", detail: "AI integrated into Microsoft 365 suite (Word, Excel, Teams)", confidence: "high" },
  { tool_name: "Cursor", vendor: "Anysphere", suggested_tier: "Pro", source: "AI Registry", detail: "AI-powered code editor built on VS Code", confidence: "high" },
  { tool_name: "Notion AI", vendor: "Notion Labs", suggested_tier: "Plus", source: "AI Registry", detail: "AI writing and summarization inside Notion workspace", confidence: "high" },
  { tool_name: "Grammarly", vendor: "Grammarly Inc.", suggested_tier: "Business", source: "AI Registry", detail: "AI writing assistant for grammar, tone, and clarity", confidence: "high" },
  { tool_name: "Jasper", vendor: "Jasper AI", suggested_tier: "Business", source: "AI Registry", detail: "AI content generation platform for marketing teams", confidence: "medium" },
  { tool_name: "Perplexity", vendor: "Perplexity AI", suggested_tier: "Pro", source: "AI Registry", detail: "AI-powered research and answer engine", confidence: "high" },
  { tool_name: "Midjourney", vendor: "Midjourney Inc.", suggested_tier: "Pro", source: "AI Registry", detail: "AI image generation via Discord or web interface", confidence: "medium" },
  { tool_name: "DALL-E", vendor: "OpenAI", suggested_tier: "Enterprise", source: "AI Registry", detail: "AI image generation integrated into ChatGPT and API", confidence: "medium" },
  { tool_name: "Slack AI", vendor: "Salesforce / Slack", suggested_tier: "Business+", source: "AI Registry", detail: "AI summarization and search within Slack conversations", confidence: "medium" },
  { tool_name: "Zoom AI Companion", vendor: "Zoom", suggested_tier: "Business", source: "AI Registry", detail: "AI meeting summaries, transcription, and smart compose", confidence: "medium" },
  { tool_name: "Codeium / Windsurf", vendor: "Codeium", suggested_tier: "Enterprise", source: "AI Registry", detail: "AI code completion and autonomous coding agent", confidence: "high" },
  { tool_name: "Tabnine", vendor: "Tabnine", suggested_tier: "Enterprise", source: "AI Registry", detail: "AI code assistant with private model deployment", confidence: "medium" },
  { tool_name: "Otter.ai", vendor: "Otter.ai", suggested_tier: "Business", source: "AI Registry", detail: "AI meeting transcription and note-taking", confidence: "medium" },
  { tool_name: "Canva AI", vendor: "Canva Pty Ltd", suggested_tier: "Pro", source: "AI Registry", detail: "AI design features including Magic Write and image generation", confidence: "medium" },
  { tool_name: "Adobe Firefly", vendor: "Adobe", suggested_tier: "Enterprise", source: "AI Registry", detail: "Generative AI for creative workflows (Photoshop, Illustrator)", confidence: "medium" },
  { tool_name: "Amazon Q", vendor: "AWS", suggested_tier: "Business", source: "AI Registry", detail: "AI assistant for developers and business users on AWS", confidence: "medium" },
];

/* ── Route ── */

const IS_VERCEL = !!process.env.VERCEL;

export async function GET() {
  try {
    // On Vercel, we can't scan the local filesystem — return curated registry
    if (IS_VERCEL) {
      return NextResponse.json({
        count: CURATED_AI_REGISTRY.length,
        tools: CURATED_AI_REGISTRY,
        scanned_at: new Date().toISOString(),
        platform: "cloud",
        mode: "registry",
      });
    }

    // For the "System Discovery Feed" demonstration, we merge local scan results
    // with a subset of our curated registry to ensure a robust visualization.
    const machineOnly: DiscoveredTool[] = [
      ...scanInstalledApps(),
      ...scanProcesses(),
      ...scanIDEExtensions(),
      ...scanBrowserExtensions(),
    ];

    // Key tools the user explicitly wants to see
    const seedTools = CURATED_AI_REGISTRY.filter(t =>
      ["chatgpt", "claude", "gemini", "copilot", "perplexity"].includes(t.tool_name.toLowerCase())
    );

    const all = [...seedTools, ...machineOnly];
    const unique = deduplicate(all);

    return NextResponse.json({
      count: unique.length,
      tools: unique,
      scanned_at: new Date().toISOString(),
      platform: platform(),
      mode: "hybrid-scan",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Scan failed";
    console.error("[/api/discover-local]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
