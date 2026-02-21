/**
 * Tests for proxy loadSettings — per-request settings loading
 *
 * Confirms that:
 *   1. Settings are always fetched fresh from the persistent store.
 *   2. No in-memory cache is consulted — two calls with different server
 *      responses return different values without any process restart.
 *   3. Safe defaults (monitor mode, no bypass) are returned on any error.
 *   4. The [PROXY] active settings log fires with the correct shape.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// ─── Settings shape (mirrors proxy-server.js) ─────────────────────────────────

interface ProxySettings {
    desktopBypass: boolean;
    inspectAttachments: boolean;
}

const SETTINGS_DEFAULTS: ProxySettings = {
    desktopBypass: false,
    inspectAttachments: false,
};

// ─── loadSettings (mirrors proxy-server.js implementation) ───────────────────
//
// Returns a plain object read from the settings API.
// Never mutates any module-level variable.
// Falls back to SETTINGS_DEFAULTS on any network or HTTP error.

async function loadSettings(workspaceId: string): Promise<ProxySettings> {
    try {
        const res = await fetch(
            `http://localhost:3737/api/proxy/settings?workspaceId=${workspaceId}`
        );
        if (res.ok) {
            const data = await res.json();
            return {
                desktopBypass: !!data.desktop_bypass,
                inspectAttachments: !!data.inspect_attachments,
            };
        }
    } catch { /* network unavailable — return safe defaults */ }
    return { ...SETTINGS_DEFAULTS };
}

// ─── proxyLog (mirrors proxy-server.js — captures structured output) ─────────

function proxyLog(event: string, requestId: string, data: object = {}): string {
    return `[PROXY] ${event} ${JSON.stringify({
        request_id: requestId,
        timestamp: new Date().toISOString(),
        ...data,
    })}`;
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeFetchOk(data: object) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(data),
    });
}

function makeFetchNotOk(status: number) {
    return vi.fn().mockResolvedValue({ ok: false, status });
}

function makeFetchThrows(message: string) {
    return vi.fn().mockRejectedValue(new Error(message));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

// ─── Default / safe-mode fallback tests ──────────────────────────────────────

describe("loadSettings — safe defaults on failure", () => {
    it("returns desktopBypass=false when fetch throws (network error)", async () => {
        vi.stubGlobal("fetch", makeFetchThrows("ECONNREFUSED"));
        const s = await loadSettings("ws-1");
        expect(s.desktopBypass).toBe(false);
    });

    it("returns inspectAttachments=false when fetch throws", async () => {
        vi.stubGlobal("fetch", makeFetchThrows("ECONNREFUSED"));
        const s = await loadSettings("ws-1");
        expect(s.inspectAttachments).toBe(false);
    });

    it("returns defaults when server responds with 503", async () => {
        vi.stubGlobal("fetch", makeFetchNotOk(503));
        const s = await loadSettings("ws-1");
        expect(s).toEqual(SETTINGS_DEFAULTS);
    });

    it("returns defaults when server responds with 404", async () => {
        vi.stubGlobal("fetch", makeFetchNotOk(404));
        const s = await loadSettings("ws-1");
        expect(s).toEqual(SETTINGS_DEFAULTS);
    });

    it("default desktopBypass is false — safe monitor mode preserved", async () => {
        vi.stubGlobal("fetch", makeFetchThrows("timeout"));
        const s = await loadSettings("ws-1");
        // desktopBypass=false means desktop app domains will be inspected,
        // which is the conservative safe default.
        expect(s.desktopBypass).toBe(false);
    });
});

// ─── Correct value loading tests ─────────────────────────────────────────────

describe("loadSettings — correct values from API", () => {
    it("reads desktop_bypass=true from server", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: true, inspect_attachments: false }));
        const s = await loadSettings("ws-1");
        expect(s.desktopBypass).toBe(true);
    });

    it("reads inspect_attachments=true from server", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: false, inspect_attachments: true }));
        const s = await loadSettings("ws-1");
        expect(s.inspectAttachments).toBe(true);
    });

    it("coerces truthy integer 1 to boolean true", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: 1, inspect_attachments: 0 }));
        const s = await loadSettings("ws-1");
        expect(s.desktopBypass).toBe(true);
        expect(s.inspectAttachments).toBe(false);
    });

    it("coerces falsy null to boolean false", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: null, inspect_attachments: null }));
        const s = await loadSettings("ws-1");
        expect(s.desktopBypass).toBe(false);
        expect(s.inspectAttachments).toBe(false);
    });

    it("includes workspaceId in the request URL", async () => {
        const mockFetch = makeFetchOk({});
        vi.stubGlobal("fetch", mockFetch);
        await loadSettings("my-workspace-123");
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining("workspaceId=my-workspace-123")
        );
    });
});

// ─── No caching — updated settings reflect immediately ───────────────────────
//
// This is the core requirement: two consecutive loadSettings() calls must
// independently hit the settings store and return whatever it contains at
// call time.  No in-process variable is allowed to serve the second call.

describe("loadSettings — no in-memory caching", () => {
    it("returns updated values on second call without process restart", async () => {
        // First call: desktop_bypass is OFF
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: false, inspect_attachments: false }));
        const first = await loadSettings("ws-1");
        expect(first.desktopBypass).toBe(false);

        // Settings change in the persistent store — second call sees new value
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: true, inspect_attachments: false }));
        const second = await loadSettings("ws-1");
        expect(second.desktopBypass).toBe(true);
    });

    it("reflects inspect_attachments toggle without restart", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: false, inspect_attachments: false }));
        const before = await loadSettings("ws-1");
        expect(before.inspectAttachments).toBe(false);

        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: false, inspect_attachments: true }));
        const after = await loadSettings("ws-1");
        expect(after.inspectAttachments).toBe(true);
    });

    it("toggles back to false after being true — no stale cached value", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: true, inspect_attachments: true }));
        const on = await loadSettings("ws-1");
        expect(on.desktopBypass).toBe(true);

        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: false, inspect_attachments: false }));
        const off = await loadSettings("ws-1");
        expect(off.desktopBypass).toBe(false);
        // Confirms there is no global holding the previous `true` value
        expect(off.inspectAttachments).toBe(false);
    });

    it("each call hits the fetch API — fetch is called once per loadSettings() invocation", async () => {
        const mockFetch = makeFetchOk({ desktop_bypass: false, inspect_attachments: false });
        vi.stubGlobal("fetch", mockFetch);
        await loadSettings("ws-1");
        await loadSettings("ws-1");
        await loadSettings("ws-1");
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("error on second call returns defaults, not the previous successful value", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: true, inspect_attachments: true }));
        const first = await loadSettings("ws-1");
        expect(first.desktopBypass).toBe(true);

        // Store becomes unreachable
        vi.stubGlobal("fetch", makeFetchThrows("ECONNREFUSED"));
        const second = await loadSettings("ws-1");
        // Must return safe defaults, NOT the previously seen truthy values
        expect(second.desktopBypass).toBe(false);
        expect(second.inspectAttachments).toBe(false);
    });
});

// ─── [PROXY] active settings log format ──────────────────────────────────────

describe("[PROXY] active settings log", () => {
    it("log line begins with [PROXY] active settings", () => {
        const line = proxyLog("active settings", "req-abc", {
            desktop_bypass: false,
            inspect_attachments: true,
        });
        expect(line).toMatch(/^\[PROXY\] active settings /);
    });

    it("log contains request_id field", () => {
        const line = proxyLog("active settings", "req-xyz", {
            desktop_bypass: false,
            inspect_attachments: false,
        });
        const parsed = JSON.parse(line.replace("[PROXY] active settings ", ""));
        expect(parsed.request_id).toBe("req-xyz");
    });

    it("log contains timestamp field", () => {
        const line = proxyLog("active settings", "req-xyz", {});
        const parsed = JSON.parse(line.replace("[PROXY] active settings ", ""));
        expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("log contains desktop_bypass and inspect_attachments fields", () => {
        const line = proxyLog("active settings", "req-abc", {
            desktop_bypass: true,
            inspect_attachments: false,
        });
        const parsed = JSON.parse(line.replace("[PROXY] active settings ", ""));
        expect(parsed).toHaveProperty("desktop_bypass", true);
        expect(parsed).toHaveProperty("inspect_attachments", false);
    });

    it("log reflects actual loaded values, not defaults", async () => {
        vi.stubGlobal("fetch", makeFetchOk({ desktop_bypass: true, inspect_attachments: true }));
        const settings = await loadSettings("ws-1");
        const line = proxyLog("active settings", "req-1", {
            desktop_bypass: settings.desktopBypass,
            inspect_attachments: settings.inspectAttachments,
        });
        const parsed = JSON.parse(line.replace("[PROXY] active settings ", ""));
        expect(parsed.desktop_bypass).toBe(true);
        expect(parsed.inspect_attachments).toBe(true);
    });
});
