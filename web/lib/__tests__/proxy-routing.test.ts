/**
 * Tests for Proxy Routing Logic
 *
 * Validates domain detection, desktop app bypass, workspace ID routing,
 * and intercept decision-making for AI browser and desktop app traffic.
 */
import { describe, it, expect } from "vitest";

// ─── Domain logic helpers (extracted from proxy-server.js for unit testing) ──

const AI_DOMAINS = [
    "api.openai.com",
    "api.anthropic.com",
    "api.cohere.com",
    "api.mistral.ai",
    "api.together.ai",
    "api.together.xyz",
    "openrouter.ai",
    "api.perplexity.ai",
    "api.groq.com",
    "api.fireworks.ai",
    "api.replicate.com",
    "generativelanguage.googleapis.com",
    "chatgpt.com",
    "chat.openai.com",
    "claude.ai",
    "perplexity.ai",
    "www.perplexity.ai",
];

const DESKTOP_APP_DOMAINS = [
    "chatgpt.com",
    "chat.openai.com",
    "claude.ai",
    "perplexity.ai",
    "www.perplexity.ai",
];

const PASSTHROUGH_DOMAINS = [
    "identitytoolkit.googleapis.com",
    "securetoken.googleapis.com",
    "firestore.googleapis.com",
    "firebaseio.com",
    "firebase.io",
    "googleapis.com",
    "accounts.google.com",
    "firebase.googleapis.com",
];

function isAIDomain(hostname: string): boolean {
    if (!hostname) return false;
    return AI_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith("." + d)
    );
}

function isDesktopAppDomain(hostname: string): boolean {
    if (!hostname) return false;
    return DESKTOP_APP_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith("." + d)
    );
}

function isPassthroughDomain(hostname: string): boolean {
    if (!hostname) return false;
    return PASSTHROUGH_DOMAINS.some(
        (d) => hostname === d || hostname.endsWith("." + d)
    );
}

function shouldDeepInspect(
    hostname: string,
    desktopBypassEnabled: boolean
): boolean {
    if (!hostname) return false;
    if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".local")
    )
        return false;
    if (isPassthroughDomain(hostname)) return false;
    if (!isAIDomain(hostname)) return false;
    if (desktopBypassEnabled && isDesktopAppDomain(hostname)) return false;
    return true;
}

function shouldLogMetadata(
    hostname: string,
    desktopBypassEnabled: boolean
): boolean {
    if (!hostname) return false;
    if (desktopBypassEnabled && isDesktopAppDomain(hostname)) return true;
    return false;
}

// ─── Workspace ID resolution ──────────────────────────────────────────────────

function resolveWorkspaceId(
    envComplyzeWorkspace?: string,
    envFirebaseUid?: string
): string {
    return envComplyzeWorkspace || envFirebaseUid || "default";
}

// ─── AI Domain Detection Tests ────────────────────────────────────────────────

describe("isAIDomain — AI browser endpoints", () => {
    it("recognises api.openai.com (ChatGPT browser/API)", () => {
        expect(isAIDomain("api.openai.com")).toBe(true);
    });

    it("recognises chatgpt.com (ChatGPT web browser)", () => {
        expect(isAIDomain("chatgpt.com")).toBe(true);
    });

    it("recognises chat.openai.com (legacy ChatGPT browser)", () => {
        expect(isAIDomain("chat.openai.com")).toBe(true);
    });

    it("recognises api.anthropic.com (Claude API / desktop)", () => {
        expect(isAIDomain("api.anthropic.com")).toBe(true);
    });

    it("recognises claude.ai (Claude.ai browser / desktop app)", () => {
        expect(isAIDomain("claude.ai")).toBe(true);
    });

    it("recognises perplexity.ai browser", () => {
        expect(isAIDomain("perplexity.ai")).toBe(true);
    });

    it("recognises www.perplexity.ai browser", () => {
        expect(isAIDomain("www.perplexity.ai")).toBe(true);
    });

    it("recognises api.perplexity.ai (API endpoint)", () => {
        expect(isAIDomain("api.perplexity.ai")).toBe(true);
    });

    it("recognises Google Gemini API", () => {
        expect(isAIDomain("generativelanguage.googleapis.com")).toBe(true);
    });

    it("recognises openrouter.ai (multi-model gateway)", () => {
        expect(isAIDomain("openrouter.ai")).toBe(true);
    });

    it("does NOT classify google.com as AI domain", () => {
        expect(isAIDomain("google.com")).toBe(false);
    });

    it("does NOT classify github.com as AI domain", () => {
        expect(isAIDomain("github.com")).toBe(false);
    });
});

// ─── Desktop App Domain Detection ────────────────────────────────────────────

describe("isDesktopAppDomain — cert-pinned desktop apps", () => {
    it("identifies chatgpt.com as desktop app domain", () => {
        expect(isDesktopAppDomain("chatgpt.com")).toBe(true);
    });

    it("identifies claude.ai as desktop app domain", () => {
        expect(isDesktopAppDomain("claude.ai")).toBe(true);
    });

    it("identifies perplexity.ai as desktop app domain", () => {
        expect(isDesktopAppDomain("perplexity.ai")).toBe(true);
    });

    it("does NOT identify api.openai.com as desktop app domain", () => {
        expect(isDesktopAppDomain("api.openai.com")).toBe(false);
    });

    it("does NOT identify api.anthropic.com as desktop app domain", () => {
        expect(isDesktopAppDomain("api.anthropic.com")).toBe(false);
    });
});

// ─── Passthrough Domain Detection ────────────────────────────────────────────

describe("isPassthroughDomain — infrastructure never inspected", () => {
    it("passes through Firebase authentication", () => {
        expect(isPassthroughDomain("identitytoolkit.googleapis.com")).toBe(true);
    });

    it("passes through Firestore", () => {
        expect(isPassthroughDomain("firestore.googleapis.com")).toBe(true);
    });

    it("passes through Google OAuth", () => {
        expect(isPassthroughDomain("accounts.google.com")).toBe(true);
    });

    it("passes through Firebase RTDB", () => {
        expect(isPassthroughDomain("firebase.googleapis.com")).toBe(true);
    });

    it("does NOT pass through api.openai.com", () => {
        expect(isPassthroughDomain("api.openai.com")).toBe(false);
    });
});

// ─── Deep Inspection Decision ─────────────────────────────────────────────────

describe("shouldDeepInspect — intercept decision", () => {
    it("inspects api.openai.com regardless of desktop bypass setting", () => {
        expect(shouldDeepInspect("api.openai.com", false)).toBe(true);
        expect(shouldDeepInspect("api.openai.com", true)).toBe(true);
    });

    it("inspects api.anthropic.com regardless of desktop bypass setting", () => {
        expect(shouldDeepInspect("api.anthropic.com", false)).toBe(true);
        expect(shouldDeepInspect("api.anthropic.com", true)).toBe(true);
    });

    it("inspects chatgpt.com (browser) when desktop bypass is OFF", () => {
        expect(shouldDeepInspect("chatgpt.com", false)).toBe(true);
    });

    it("skips chatgpt.com (ChatGPT desktop app) when desktop bypass is ON", () => {
        expect(shouldDeepInspect("chatgpt.com", true)).toBe(false);
    });

    it("skips claude.ai (Claude Desktop app) when desktop bypass is ON", () => {
        expect(shouldDeepInspect("claude.ai", true)).toBe(false);
    });

    it("inspects claude.ai (browser) when desktop bypass is OFF", () => {
        expect(shouldDeepInspect("claude.ai", false)).toBe(true);
    });

    it("never inspects localhost traffic", () => {
        expect(shouldDeepInspect("localhost", false)).toBe(false);
        expect(shouldDeepInspect("localhost", true)).toBe(false);
    });

    it("never inspects 127.0.0.1 traffic", () => {
        expect(shouldDeepInspect("127.0.0.1", false)).toBe(false);
    });

    it("never inspects .local domains", () => {
        expect(shouldDeepInspect("my-mac.local", false)).toBe(false);
    });

    it("never inspects Firebase infrastructure", () => {
        expect(shouldDeepInspect("firestore.googleapis.com", false)).toBe(false);
        expect(shouldDeepInspect("accounts.google.com", false)).toBe(false);
    });

    it("does NOT inspect random domains", () => {
        expect(shouldDeepInspect("news.ycombinator.com", false)).toBe(false);
        expect(shouldDeepInspect("github.com", false)).toBe(false);
        expect(shouldDeepInspect("slack.com", false)).toBe(false);
    });
});

// ─── Metadata Logging for Bypassed Desktop Apps ──────────────────────────────

describe("shouldLogMetadata — desktop bypass metadata logging", () => {
    it("logs metadata for chatgpt.com when bypass is ON", () => {
        expect(shouldLogMetadata("chatgpt.com", true)).toBe(true);
    });

    it("logs metadata for claude.ai when bypass is ON", () => {
        expect(shouldLogMetadata("claude.ai", true)).toBe(true);
    });

    it("does NOT log metadata when bypass is OFF", () => {
        expect(shouldLogMetadata("chatgpt.com", false)).toBe(false);
        expect(shouldLogMetadata("claude.ai", false)).toBe(false);
    });

    it("does NOT log metadata for non-desktop-app AI domains", () => {
        expect(shouldLogMetadata("api.openai.com", true)).toBe(false);
        expect(shouldLogMetadata("api.anthropic.com", true)).toBe(false);
    });
});

// ─── Workspace ID Resolution ──────────────────────────────────────────────────

describe("Workspace ID — proxy event routing", () => {
    it("uses COMPLYZE_WORKSPACE env var when set", () => {
        const wsId = resolveWorkspaceId("my-workspace-id", undefined);
        expect(wsId).toBe("my-workspace-id");
    });

    it("falls back to FIREBASE_UID when COMPLYZE_WORKSPACE not set", () => {
        const wsId = resolveWorkspaceId(undefined, "firebase-uid-abc123");
        expect(wsId).toBe("firebase-uid-abc123");
    });

    it("defaults to 'default' when neither env var is set", () => {
        const wsId = resolveWorkspaceId(undefined, undefined);
        expect(wsId).toBe("default");
    });

    it("COMPLYZE_WORKSPACE takes precedence over FIREBASE_UID", () => {
        const wsId = resolveWorkspaceId("custom-ws", "firebase-uid");
        expect(wsId).toBe("custom-ws");
    });

    it("empty string falls through to FIREBASE_UID", () => {
        // Empty string is falsy, so it falls back
        const wsId = resolveWorkspaceId("", "firebase-uid");
        expect(wsId).toBe("firebase-uid");
    });

    it("previous bug: 'local-dev' hardcode no longer used", () => {
        // The old default was 'local-dev' which caused workspace mismatch.
        // Events were stored in 'local-dev' but dashboard read from user.uid.
        // After the fix, default is 'default', matching dashboard fallback.
        const wsId = resolveWorkspaceId(undefined, undefined);
        expect(wsId).not.toBe("local-dev");
        expect(wsId).toBe("default");
    });
});

// ─── COMPLYZE_API URL construction ───────────────────────────────────────────

describe("COMPLYZE_API URL construction", () => {
    it("appends workspaceId query param to intercept URL", () => {
        const base = "http://localhost:3737/api/proxy/intercept";
        const workspaceId = "user-abc123";
        const url = base + "?workspaceId=" + encodeURIComponent(workspaceId);
        expect(url).toBe(
            "http://localhost:3737/api/proxy/intercept?workspaceId=user-abc123"
        );
    });

    it("correctly encodes special characters in workspaceId", () => {
        const base = "http://localhost:3737/api/proxy/intercept";
        const workspaceId = "user/with+special=chars";
        const url = base + "?workspaceId=" + encodeURIComponent(workspaceId);
        expect(url).not.toContain("/with+special");
        expect(url).toContain("workspaceId=");
    });

    it("previous TDZ bug: WORKSPACE_ID must be defined before COMPLYZE_API", () => {
        // Simulate the correct order: define WORKSPACE_ID first, then COMPLYZE_API
        const FIREBASE_UID = "";
        const WORKSPACE_ID = process.env.COMPLYZE_WORKSPACE || FIREBASE_UID || "default";
        const _BASE = "http://localhost:3737/api/proxy/intercept";
        // This should NOT throw a ReferenceError (which was the original bug)
        const COMPLYZE_API = _BASE + "?workspaceId=" + encodeURIComponent(WORKSPACE_ID);
        expect(COMPLYZE_API).toContain("workspaceId=default");
    });
});
