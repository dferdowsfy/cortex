import { ChildProcess, spawn } from "child_process";
import path from "path";
import { randomUUID } from "crypto";
import store from "@/lib/proxy-store";
import { disableProxy, getProxyState, isPortReachable } from "@/lib/system-proxy-manager";

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 8080;
const WATCHDOG_INTERVAL_MS = 5_000;
const STARTUP_TIMEOUT_MS = 10_000;
const WORKSPACE_ID = "default";

const globalState = globalThis as unknown as {
    __complyzeProxyManager?: ProxyManager;
};

class ProxyManager {
    private child: ChildProcess | null = null;
    private watchdogTimer: NodeJS.Timeout | null = null;
    private lastWatchdogAlertAt = 0;
    private activeWorkspaceId: string = "default";

    constructor() {
        this.startWatchdog();
    }

    async startProxy(workspaceId?: string): Promise<{ ok: boolean; message: string }> {
        const resolvedWorkspace = workspaceId || this.activeWorkspaceId || "default";
        this.activeWorkspaceId = resolvedWorkspace;

        if (await this.isProxyRunning()) {
            return { ok: true, message: "Proxy server already running." };
        }

        if (this.child && !this.child.killed) {
            this.child.kill("SIGTERM");
            this.child = null;
        }

        const proxyScript = path.join(process.cwd(), "scripts", "proxy-server.js");
        const child = spawn(process.execPath, [proxyScript, "--port", String(PROXY_PORT)], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                COMPLYZE_WORKSPACE: resolvedWorkspace,
                FIREBASE_UID: resolvedWorkspace,
            },
        });
        this.child = child;

        child.stdout?.on("data", (chunk) => {
            process.stdout.write(`[proxy] ${chunk}`);
        });
        child.stderr?.on("data", (chunk) => {
            process.stderr.write(`[proxy:error] ${chunk}`);
        });

        child.once("exit", async (code, signal) => {
            this.child = null;
            const running = await isPortReachable(PROXY_HOST, PROXY_PORT);
            if (!running) {
                console.error(`[proxy-manager] Proxy process exited (code=${code}, signal=${signal}). Disabling system proxy.`);
                await this.failSafeDisable("Proxy process stopped. System proxy disabled to restore internet.");
            }
        });

        const ready = await this.waitForPort(PROXY_HOST, PROXY_PORT, STARTUP_TIMEOUT_MS);
        if (!ready) {
            await this.stopProxy();
            return { ok: false, message: `Proxy did not start on ${PROXY_HOST}:${PROXY_PORT}.` };
        }

        return { ok: true, message: `Proxy running on ${PROXY_HOST}:${PROXY_PORT}.` };
    }

    async stopProxy(): Promise<void> {
        if (!this.child) return;

        const child = this.child;
        this.child = null;

        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                if (!child.killed) child.kill("SIGKILL");
                resolve();
            }, 2_000);

            child.once("exit", () => {
                clearTimeout(timeout);
                resolve();
            });

            child.kill("SIGTERM");
        });
    }

    async isProxyRunning(): Promise<boolean> {
        return isPortReachable(PROXY_HOST, PROXY_PORT);
    }

    private async waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await isPortReachable(host, port, 500)) return true;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return false;
    }

    private startWatchdog() {
        if (this.watchdogTimer) return;
        this.watchdogTimer = setInterval(async () => {
            try {
                const state = await getProxyState();
                if (!state.enabled) return;

                const reachable = await isPortReachable(PROXY_HOST, PROXY_PORT);
                if (!reachable) {
                    await this.failSafeDisable("Proxy process stopped. System proxy disabled to restore internet.");
                }
            } catch (err) {
                console.error("[proxy-manager] watchdog error", err);
            }
        }, WATCHDOG_INTERVAL_MS);

        this.watchdogTimer.unref?.();
    }

    private async failSafeDisable(message: string) {
        try {
            await disableProxy();
        } catch (err) {
            console.error("[proxy-manager] Failed to disable system proxy in fail-safe mode.", err);
        }

        if (Date.now() - this.lastWatchdogAlertAt < WATCHDOG_INTERVAL_MS) return;
        this.lastWatchdogAlertAt = Date.now();

        try {
            await store.addAlert({
                id: randomUUID(),
                type: "threshold_exceeded",
                tool: "proxy-manager",
                message,
                severity: "high",
                timestamp: new Date().toISOString(),
                acknowledged: false,
            }, WORKSPACE_ID);
        } catch (err) {
            console.error("[proxy-manager] Failed to store fail-safe alert.", err);
        }
    }
}

export function getProxyManager(): ProxyManager {
    if (!globalState.__complyzeProxyManager) {
        globalState.__complyzeProxyManager = new ProxyManager();
    }

    return globalState.__complyzeProxyManager;
}

export async function startProxy(workspaceId?: string) {
    return getProxyManager().startProxy(workspaceId);
}

export async function stopProxy() {
    return getProxyManager().stopProxy();
}

export async function isProxyRunning() {
    return getProxyManager().isProxyRunning();
}
