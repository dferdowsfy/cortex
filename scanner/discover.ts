#!/usr/bin/env node

/**
 * Complyze Discovery Agent
 *
 * Scans the local machine for AI tools in use:
 *   1. Installed applications (/Applications on macOS)
 *   2. Running processes
 *   3. Browser extensions (Chrome, Edge, Arc, Brave)
 *   4. Active network connections to AI API endpoints
 *   5. Homebrew / npm global packages
 *   6. VS Code / Cursor extensions
 *
 * Outputs a JSON array of discovered tools and can POST
 * results directly to the Complyze web dashboard.
 *
 * Usage:
 *   npx tsx scanner/discover.ts                   # print to stdout
 *   npx tsx scanner/discover.ts --push             # push to web dashboard
 *   npx tsx scanner/discover.ts --push --url http://localhost:3737
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir, platform } from "os";
import { join, basename } from "path";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface DiscoveredTool {
  tool_name: string;
  vendor: string;
  source: string; // where it was found
  detail: string; // extra context
  suggested_tier: string;
  confidence: "high" | "medium" | "low";
}

/* ═══════════════════════════════════════════════════════════════
   Known AI Tool Signatures
   ═══════════════════════════════════════════════════════════════ */

const AI_APPS: Record<string, { vendor: string; tier: string }> = {
  "ChatGPT": { vendor: "OpenAI", tier: "Free" },
  "Claude": { vendor: "Anthropic", tier: "Free" },
  "Cursor": { vendor: "Anysphere", tier: "Pro" },
  "Windsurf": { vendor: "Codeium", tier: "Free" },
  "GitHub Copilot": { vendor: "GitHub / Microsoft", tier: "Pro" },
  "Copilot": { vendor: "Microsoft", tier: "Pro" },
  "Notion": { vendor: "Notion Labs", tier: "Plus" },
  "Notion AI": { vendor: "Notion Labs", tier: "Plus" },
  "Grammarly": { vendor: "Grammarly Inc.", tier: "Free" },
  "Otter": { vendor: "Otter.ai Inc.", tier: "Free" },
  "Jasper": { vendor: "Jasper AI", tier: "Pro" },
  "Midjourney": { vendor: "Midjourney Inc.", tier: "Basic" },
  "Figma": { vendor: "Figma (Adobe)", tier: "Professional" },
  "Canva": { vendor: "Canva Pty Ltd", tier: "Free" },
  "Zoom": { vendor: "Zoom", tier: "Pro" },
  "Slack": { vendor: "Salesforce / Slack", tier: "Pro" },
  "Microsoft Teams": { vendor: "Microsoft", tier: "Business" },
  "Codeium": { vendor: "Codeium", tier: "Free" },
  "Tabnine": { vendor: "Tabnine", tier: "Free" },
  "Pieces": { vendor: "Pieces for Developers", tier: "Free" },
  "Raycast": { vendor: "Raycast", tier: "Pro" },
  "Arc": { vendor: "The Browser Company", tier: "Free" },
  "Warp": { vendor: "Warp", tier: "Free" },
  "Adobe Firefly": { vendor: "Adobe", tier: "Free" },
  "Perplexity": { vendor: "Perplexity AI", tier: "Free" },
};

const AI_PROCESS_KEYWORDS = [
  "chatgpt", "openai", "copilot", "cursor", "claude", "anthropic",
  "grammarly", "otter", "notion", "jasper", "midjourney", "codeium",
  "tabnine", "windsurf", "perplexity", "pieces", "raycast",
];

const AI_DOMAINS: Record<string, { tool: string; vendor: string }> = {
  "api.openai.com": { tool: "OpenAI API", vendor: "OpenAI" },
  "chat.openai.com": { tool: "ChatGPT", vendor: "OpenAI" },
  "chatgpt.com": { tool: "ChatGPT", vendor: "OpenAI" },
  "api.anthropic.com": { tool: "Claude API", vendor: "Anthropic" },
  "claude.ai": { tool: "Claude", vendor: "Anthropic" },
  "copilot.github.com": { tool: "GitHub Copilot", vendor: "GitHub / Microsoft" },
  "api.githubcopilot.com": { tool: "GitHub Copilot", vendor: "GitHub / Microsoft" },
  "generativelanguage.googleapis.com": { tool: "Google Gemini API", vendor: "Google" },
  "gemini.google.com": { tool: "Google Gemini", vendor: "Google" },
  "bard.google.com": { tool: "Google Gemini", vendor: "Google" },
  "api.cohere.ai": { tool: "Cohere API", vendor: "Cohere" },
  "api.perplexity.ai": { tool: "Perplexity API", vendor: "Perplexity AI" },
  "openrouter.ai": { tool: "OpenRouter", vendor: "OpenRouter" },
  "api.together.xyz": { tool: "Together AI", vendor: "Together AI" },
  "api.fireworks.ai": { tool: "Fireworks AI", vendor: "Fireworks AI" },
  "api.replicate.com": { tool: "Replicate", vendor: "Replicate" },
  "api.stability.ai": { tool: "Stability AI", vendor: "Stability AI" },
  "api.mistral.ai": { tool: "Mistral API", vendor: "Mistral AI" },
  "grammarly.com": { tool: "Grammarly", vendor: "Grammarly Inc." },
  "otter.ai": { tool: "Otter.ai", vendor: "Otter.ai Inc." },
  "notion.so": { tool: "Notion AI", vendor: "Notion Labs" },
  "jasper.ai": { tool: "Jasper", vendor: "Jasper AI" },
  "codeium.com": { tool: "Codeium", vendor: "Codeium" },
  "tabnine.com": { tool: "Tabnine", vendor: "Tabnine" },
  "app.cursor.sh": { tool: "Cursor", vendor: "Anysphere" },
};

const AI_VSCODE_EXTENSIONS: Record<string, { tool: string; vendor: string }> = {
  "github.copilot": { tool: "GitHub Copilot", vendor: "GitHub / Microsoft" },
  "github.copilot-chat": { tool: "GitHub Copilot Chat", vendor: "GitHub / Microsoft" },
  "codeium.codeium": { tool: "Codeium", vendor: "Codeium" },
  "tabnine.tabnine-vscode": { tool: "Tabnine", vendor: "Tabnine" },
  "continue.continue": { tool: "Continue", vendor: "Continue Dev" },
  "amazonwebservices.aws-toolkit-vscode": { tool: "Amazon Q", vendor: "AWS" },
  "amazonwebservices.amazon-q-vscode": { tool: "Amazon Q", vendor: "AWS" },
  "sourcegraph.cody-ai": { tool: "Sourcegraph Cody", vendor: "Sourcegraph" },
  "pieces.pieces-copilot": { tool: "Pieces", vendor: "Pieces for Developers" },
  "blackboxapp.blackbox": { tool: "Blackbox AI", vendor: "Blackbox AI" },
  "supermaven.supermaven": { tool: "Supermaven", vendor: "Supermaven" },
};

const AI_CHROME_EXTENSIONS: Record<string, { tool: string; vendor: string }> = {
  "Grammarly": { tool: "Grammarly", vendor: "Grammarly Inc." },
  "ChatGPT": { tool: "ChatGPT Extension", vendor: "OpenAI" },
  "Perplexity": { tool: "Perplexity", vendor: "Perplexity AI" },
  "Jasper": { tool: "Jasper", vendor: "Jasper AI" },
  "Monica": { tool: "Monica AI", vendor: "Monica" },
  "Merlin": { tool: "Merlin AI", vendor: "Merlin" },
  "MaxAI": { tool: "MaxAI", vendor: "MaxAI" },
  "Sider": { tool: "Sider AI", vendor: "Sider" },
  "Copilot": { tool: "Microsoft Copilot", vendor: "Microsoft" },
};

/* ═══════════════════════════════════════════════════════════════
   Scanner Functions
   ═══════════════════════════════════════════════════════════════ */

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

function scanInstalledApps(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  if (platform() !== "darwin") return found;

  try {
    const apps = readdirSync("/Applications");
    for (const app of apps) {
      const name = app.replace(/\.app$/, "");
      for (const [aiName, info] of Object.entries(AI_APPS)) {
        if (name.toLowerCase().includes(aiName.toLowerCase())) {
          found.push({
            tool_name: aiName,
            vendor: info.vendor,
            source: "Installed Application",
            detail: `/Applications/${app}`,
            suggested_tier: info.tier,
            confidence: "high",
          });
        }
      }
    }
  } catch { /* no access */ }

  // Also check ~/Applications
  try {
    const userApps = readdirSync(join(homedir(), "Applications"));
    for (const app of userApps) {
      const name = app.replace(/\.app$/, "");
      for (const [aiName, info] of Object.entries(AI_APPS)) {
        if (name.toLowerCase().includes(aiName.toLowerCase())) {
          found.push({
            tool_name: aiName,
            vendor: info.vendor,
            source: "Installed Application (User)",
            detail: `~/Applications/${app}`,
            suggested_tier: info.tier,
            confidence: "high",
          });
        }
      }
    }
  } catch { /* no access */ }

  return found;
}

function scanRunningProcesses(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  const ps = run("ps aux");
  if (!ps) return found;

  const lines = ps.split("\n");
  const seen = new Set<string>();

  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const keyword of AI_PROCESS_KEYWORDS) {
      if (lower.includes(keyword) && !seen.has(keyword)) {
        seen.add(keyword);
        // Find matching tool
        for (const [aiName, info] of Object.entries(AI_APPS)) {
          if (aiName.toLowerCase().includes(keyword)) {
            found.push({
              tool_name: aiName,
              vendor: info.vendor,
              source: "Running Process",
              detail: `Process matching "${keyword}" detected`,
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

function scanNetworkConnections(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  const seen = new Set<string>();

  // Check active connections
  const lsof = run("lsof -i -n -P 2>/dev/null | grep ESTABLISHED");
  if (lsof) {
    for (const line of lsof.split("\n")) {
      for (const [domain, info] of Object.entries(AI_DOMAINS)) {
        // lsof shows IPs, so we also check DNS cache
        if (line.includes(domain) && !seen.has(info.tool)) {
          seen.add(info.tool);
          found.push({
            tool_name: info.tool,
            vendor: info.vendor,
            source: "Active Network Connection",
            detail: `Connection to ${domain} detected`,
            suggested_tier: "Unknown",
            confidence: "high",
          });
        }
      }
    }
  }

  // Check DNS cache / recent lookups
  const dns = run("log show --predicate 'subsystem == \"com.apple.networkd\"' --last 1h --style compact 2>/dev/null | head -500");
  if (dns) {
    for (const [domain, info] of Object.entries(AI_DOMAINS)) {
      if (dns.includes(domain) && !seen.has(info.tool)) {
        seen.add(info.tool);
        found.push({
          tool_name: info.tool,
          vendor: info.vendor,
          source: "Recent DNS Lookup",
          detail: `DNS query for ${domain} in last hour`,
          suggested_tier: "Unknown",
          confidence: "medium",
        });
      }
    }
  }

  return found;
}

function scanVSCodeExtensions(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];

  // VS Code extensions
  const vscodeDirs = [
    join(homedir(), ".vscode", "extensions"),
    join(homedir(), ".vscode-insiders", "extensions"),
  ];

  // Cursor extensions
  const cursorDir = join(homedir(), ".cursor", "extensions");
  if (existsSync(cursorDir)) {
    vscodeDirs.push(cursorDir);
    // Cursor itself is an AI tool
    found.push({
      tool_name: "Cursor",
      vendor: "Anysphere",
      source: "IDE Installation",
      detail: "Cursor IDE detected via extensions directory",
      suggested_tier: "Pro",
      confidence: "high",
    });
  }

  // Windsurf
  const windsurfDir = join(homedir(), ".windsurf", "extensions");
  if (existsSync(windsurfDir)) {
    vscodeDirs.push(windsurfDir);
    found.push({
      tool_name: "Windsurf",
      vendor: "Codeium",
      source: "IDE Installation",
      detail: "Windsurf IDE detected via extensions directory",
      suggested_tier: "Free",
      confidence: "high",
    });
  }

  for (const extDir of vscodeDirs) {
    if (!existsSync(extDir)) continue;
    try {
      const extensions = readdirSync(extDir);
      for (const ext of extensions) {
        const extLower = ext.toLowerCase();
        for (const [extId, info] of Object.entries(AI_VSCODE_EXTENSIONS)) {
          if (extLower.startsWith(extId.toLowerCase())) {
            const ide = extDir.includes(".cursor")
              ? "Cursor"
              : extDir.includes(".windsurf")
                ? "Windsurf"
                : extDir.includes("insiders")
                  ? "VS Code Insiders"
                  : "VS Code";
            found.push({
              tool_name: info.tool,
              vendor: info.vendor,
              source: `${ide} Extension`,
              detail: `Extension ${ext} in ${ide}`,
              suggested_tier: "Pro",
              confidence: "high",
            });
          }
        }
      }
    } catch { /* no access */ }
  }

  return found;
}

function scanBrowserExtensions(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];
  const home = homedir();

  // Chrome extension directories
  const chromeProfiles = [
    join(home, "Library", "Application Support", "Google", "Chrome"),
    join(home, "Library", "Application Support", "Microsoft Edge"),
    join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
    join(home, "Library", "Application Support", "Arc", "User Data"),
  ];

  for (const browserDir of chromeProfiles) {
    if (!existsSync(browserDir)) continue;
    const browserName = basename(browserDir) === "Chrome"
      ? "Chrome"
      : basename(browserDir) === "Edge"
        ? "Edge"
        : basename(browserDir) === "Brave-Browser"
          ? "Brave"
          : "Arc";

    // Scan Default and Profile* directories
    try {
      const profiles = readdirSync(browserDir).filter(
        (d) => d === "Default" || d.startsWith("Profile")
      );

      for (const profile of profiles) {
        const extDir = join(browserDir, profile, "Extensions");
        if (!existsSync(extDir)) continue;
        try {
          const extIds = readdirSync(extDir);
          for (const extId of extIds) {
            // Try to read the manifest to get the extension name
            try {
              const versions = readdirSync(join(extDir, extId));
              for (const ver of versions) {
                const manifest = join(extDir, extId, ver, "manifest.json");
                if (existsSync(manifest)) {
                  const content = readFileSync(manifest, "utf-8");
                  const parsed = JSON.parse(content);
                  const name = parsed.name || "";
                  for (const [keyword, info] of Object.entries(AI_CHROME_EXTENSIONS)) {
                    if (name.toLowerCase().includes(keyword.toLowerCase())) {
                      found.push({
                        tool_name: info.tool,
                        vendor: info.vendor,
                        source: `${browserName} Extension`,
                        detail: `"${name}" extension in ${browserName} (${profile})`,
                        suggested_tier: "Free",
                        confidence: "high",
                      });
                    }
                  }
                  break;
                }
              }
            } catch { /* can't parse */ }
          }
        } catch { /* no access */ }
      }
    } catch { /* no access */ }
  }

  return found;
}

function scanHomebrew(): DiscoveredTool[] {
  const found: DiscoveredTool[] = [];

  const brewList = run("brew list --cask 2>/dev/null");
  if (brewList) {
    const casks = brewList.split("\n").map((s) => s.trim()).filter(Boolean);
    for (const cask of casks) {
      for (const [aiName, info] of Object.entries(AI_APPS)) {
        if (cask.toLowerCase().includes(aiName.toLowerCase().replace(/ /g, "-"))) {
          found.push({
            tool_name: aiName,
            vendor: info.vendor,
            source: "Homebrew Cask",
            detail: `brew cask: ${cask}`,
            suggested_tier: info.tier,
            confidence: "high",
          });
        }
      }
    }
  }

  return found;
}

/* ═══════════════════════════════════════════════════════════════
   Deduplication & Main
   ═══════════════════════════════════════════════════════════════ */

function deduplicate(tools: DiscoveredTool[]): DiscoveredTool[] {
  const best = new Map<string, DiscoveredTool>();
  const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };

  for (const tool of tools) {
    const key = tool.tool_name.toLowerCase();
    const existing = best.get(key);
    if (
      !existing ||
      (confidenceOrder[tool.confidence] || 0) > (confidenceOrder[existing.confidence] || 0)
    ) {
      // Keep the higher confidence one but merge sources
      if (existing) {
        tool.detail = `${tool.detail}; also found via: ${existing.source}`;
      }
      best.set(key, tool);
    } else if (existing) {
      existing.detail = `${existing.detail}; also found via: ${tool.source}`;
    }
  }

  return Array.from(best.values());
}

async function pushToServer(tools: DiscoveredTool[], baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tools }),
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  console.log(`\n✅ Pushed ${data.count} tools to Complyze dashboard at ${baseUrl}`);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldPush = args.includes("--push");
  const urlIdx = args.indexOf("--url");
  const baseUrl = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : "http://localhost:3737";

  console.log("🔍 Complyze Discovery Agent");
  console.log("═".repeat(50));
  console.log();

  const allTools: DiscoveredTool[] = [];

  // Run all scanners
  const scanners: Array<{ name: string; fn: () => DiscoveredTool[] }> = [
    { name: "Installed Applications", fn: scanInstalledApps },
    { name: "Running Processes", fn: scanRunningProcesses },
    { name: "VS Code / Cursor / Windsurf Extensions", fn: scanVSCodeExtensions },
    { name: "Browser Extensions", fn: scanBrowserExtensions },
    { name: "Network Connections", fn: scanNetworkConnections },
    { name: "Homebrew Packages", fn: scanHomebrew },
  ];

  for (const scanner of scanners) {
    process.stdout.write(`  Scanning ${scanner.name}...`);
    const results = scanner.fn();
    console.log(` ${results.length} found`);
    allTools.push(...results);
  }

  const unique = deduplicate(allTools);

  console.log();
  console.log(`📋 Discovered ${unique.length} AI tool(s):`);
  console.log("─".repeat(50));

  if (unique.length === 0) {
    console.log("  No AI tools detected on this machine.");
    console.log("  This could mean tools are accessed only via browser.");
    console.log("  Use the web dashboard to manually add tools.");
    return;
  }

  for (const tool of unique) {
    const conf = tool.confidence === "high" ? "●" : tool.confidence === "medium" ? "◐" : "○";
    console.log(`  ${conf} ${tool.tool_name}`);
    console.log(`    Vendor: ${tool.vendor}`);
    console.log(`    Found via: ${tool.source}`);
    console.log(`    Detail: ${tool.detail}`);
    console.log();
  }

  // Print JSON for piping
  if (!shouldPush && !process.stdout.isTTY) {
    console.log(JSON.stringify(unique, null, 2));
  }

  // Push to server
  if (shouldPush) {
    try {
      await pushToServer(unique, baseUrl);
      console.log(`\n🌐 Open ${baseUrl} to review and assess discovered tools.`);
    } catch (e) {
      console.error(`\n❌ Failed to push to server: ${e instanceof Error ? e.message : e}`);
      console.error(`   Make sure the Complyze web app is running at ${baseUrl}`);
    }
  } else {
    console.log(`\n💡 Run with --push to send results to Complyze dashboard:`);
    console.log(`   npx tsx scanner/discover.ts --push`);
  }
}

main();
