import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir, platform } from "os";
import { join, basename } from "path";

/**
 * Server-side local discovery — scans the machine running the Next.js server
 * for AI tools (installed apps, processes, IDE extensions, browser extensions).
 */

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
};

const AI_PROCESS_KEYWORDS = [
  "chatgpt", "openai", "copilot", "cursor", "claude", "anthropic",
  "grammarly", "otter", "notion", "jasper", "codeium",
  "tabnine", "windsurf", "perplexity", "pieces", "raycast",
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

/* ── Route ── */

export async function GET() {
  try {
    const all: DiscoveredTool[] = [
      ...scanInstalledApps(),
      ...scanProcesses(),
      ...scanIDEExtensions(),
      ...scanBrowserExtensions(),
    ];

    const unique = deduplicate(all);

    return NextResponse.json({
      count: unique.length,
      tools: unique,
      scanned_at: new Date().toISOString(),
      platform: platform(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Scan failed";
    console.error("[/api/discover-local]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
