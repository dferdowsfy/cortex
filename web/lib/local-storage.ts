import fs from 'fs';
import path from 'path';

/**
 * LocalStorage — A simple JSON file-based persistence for local development.
 * Used when Firebase is unavailable to ensure data survives refreshes and dev-server restarts.
 *
 * Reads from disk on every get (debounced) to ensure consistency when the proxy
 * server and Next.js API routes both write to the same file.
 */
class LocalStorage {
    private filePath: string;
    private cache: Record<string, any> = {};
    private lastReadAt = 0;
    private readonly READ_DEBOUNCE_MS = 100; // Very short debounce for responsiveness

    constructor() {
        this.filePath = path.join(process.cwd(), 'local_storage.json');
        this.loadFromDisk();
    }

    /** Force-read the file from disk into the in-memory cache. */
    private loadFromDisk() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                if (data) this.cache = JSON.parse(data);
            }
        } catch (err) {
            // Keep existing cache on read error, usually just empty file or lock
        }
        this.lastReadAt = Date.now();
    }

    /** Ensure cache is fresh (re-reads if stale). */
    private ensureFresh() {
        if (Date.now() - this.lastReadAt > this.READ_DEBOUNCE_MS) {
            this.loadFromDisk();
        }
    }

    private saveToDisk() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
            this.lastReadAt = Date.now();
        } catch (err) {
            console.error('[local-storage] Failed to save:', err);
        }
    }

    getItem<T>(key: string, defaultValue: T): T {
        this.ensureFresh();
        return this.cache[key] !== undefined ? this.cache[key] : defaultValue;
    }

    setItem(key: string, value: any) {
        this.ensureFresh();
        this.cache[key] = value;
        this.saveToDisk();
    }

    // Workspace-aware helpers
    getWorkspaceData<T>(workspaceId: string, type: string, defaultValue: T): T {
        const fullKey = `workspaces/${workspaceId}/${type}`;
        return this.getItem(fullKey, defaultValue);
    }

    setWorkspaceData(workspaceId: string, type: string, value: any) {
        const fullKey = `workspaces/${workspaceId}/${type}`;
        this.setItem(fullKey, value);
    }

    findWorkspaceForToken(tokenId: string): string | null {
        this.ensureFresh();
        for (const [key, value] of Object.entries(this.cache)) {
            if (key.endsWith('/enrollment_tokens')) {
                const tokens = value as Record<string, any>;
                if (tokens && tokens[tokenId]) {
                    const match = key.match(/^workspaces\/([^\/]+)\/enrollment_tokens$/);
                    if (match) return match[1];
                }
            }
        }
        return null;
    }

    findWorkspaceForDevice(deviceId: string): string | null {
        this.ensureFresh();
        for (const [key, value] of Object.entries(this.cache)) {
            if (key.endsWith('/devices')) {
                const devices = value as Record<string, any>;
                if (devices && devices[deviceId]) {
                    const match = key.match(/^workspaces\/([^\/]+)\/devices$/);
                    if (match) return match[1];
                }
            }
        }
        return null;
    }
}

// Global instance to survive HMR in Next.js dev
const globalStorage = global as any;
if (!globalStorage._complyze_local_storage || typeof globalStorage._complyze_local_storage.findWorkspaceForToken !== 'function') {
    globalStorage._complyze_local_storage = new LocalStorage();
}

export const localStorage = globalStorage._complyze_local_storage as LocalStorage;

