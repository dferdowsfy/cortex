import { adminDb } from "./firebase/admin";
import { localStorage } from "./local-storage";
import crypto from "crypto";

/* ─── Types ─────────────────────────────────────────────── */

export type UserRole = "admin" | "member" | "viewer";

export interface ManagedUser {
    user_id: string;
    org_id: string;
    group_id: string | null;
    email: string;
    display_name?: string;
    role: UserRole;
    active: boolean;
    created_at: string;
    enrolled_at?: string;
    last_seen?: string;
    enrolled_device_count: number;
    license_key?: string;
    last_activity?: string;
    plan?: string;
    features?: Record<string, boolean>;
}

function generateLicenseKey(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O/0/I/1 for clarity
    const gen = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return `CMP-${gen(5)}-${gen(5)}`;
}

const MANAGED_USERS_PATH = "managed_users";

/* ─── Store ─────────────────────────────────────────────── */

class UserStore {

    async createUser(
        org_id: string,
        email: string,
        role: UserRole = "member",
        group_id: string | null = null,
        display_name?: string,
        workspaceId: string = "default"
    ): Promise<ManagedUser> {
        const user_id = crypto.randomUUID();
        const now = new Date().toISOString();
        const user: ManagedUser = {
            user_id,
            org_id,
            group_id,
            email,
            role,
            active: true,
            created_at: now,
            enrolled_at: now,
            enrolled_device_count: 0,
            license_key: generateLicenseKey(),
            last_activity: now,
        };
        if (display_name) user.display_name = display_name;

        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${MANAGED_USERS_PATH}/${user_id}`).set(user);
        } else {
            const users = localStorage.getWorkspaceData(workspaceId, "managed_users", {}) as Record<string, ManagedUser>;
            users[user_id] = user;
            localStorage.setWorkspaceData(workspaceId, "managed_users", users);
        }
        return user;
    }

    async getUser(user_id: string, workspaceId: string = "default"): Promise<ManagedUser | null> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(`${MANAGED_USERS_PATH}/${user_id}`).get();
            if (snap.exists()) return snap.val() as ManagedUser;
        } else {
            const users = localStorage.getWorkspaceData(workspaceId, "managed_users", {}) as Record<string, ManagedUser>;
            return users[user_id] || null;
        }
        return null;
    }

    async listUsers(org_id: string, workspaceId: string = "default"): Promise<ManagedUser[]> {
        try {
            if (adminDb && adminDb.app.options.databaseURL) {
                const snap = await adminDb.ref(MANAGED_USERS_PATH).orderByChild("org_id").equalTo(org_id).get();
                if (snap.exists()) return Object.values(snap.val());
            }
        } catch (err) {
            console.error("[user-store] listUsers fallback:", err);
            if (adminDb && adminDb.app.options.databaseURL) {
                const snap = await adminDb.ref(MANAGED_USERS_PATH).get();
                if (snap.exists()) {
                    const all = Object.values(snap.val()) as ManagedUser[];
                    return all.filter(u => u.org_id === org_id);
                }
            }
        }

        if (!adminDb || !adminDb.app.options.databaseURL) {
            const all = localStorage.getWorkspaceData(workspaceId, "managed_users", {}) as Record<string, ManagedUser>;
            return Object.values(all).filter((u: any) => u.org_id === org_id);
        }
        return [];
    }

    async listUsersByGroup(group_id: string, workspaceId: string = "default"): Promise<ManagedUser[]> {
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(MANAGED_USERS_PATH).orderByChild("group_id").equalTo(group_id).get();
            if (snap.exists()) return Object.values(snap.val());
        } else {
            const all = localStorage.getWorkspaceData(workspaceId, "managed_users", {}) as Record<string, ManagedUser>;
            return Object.values(all).filter((u: any) => u.group_id === group_id);
        }
        return [];
    }

    async updateUser(
        user_id: string,
        updates: Partial<Pick<ManagedUser, "email" | "display_name" | "role" | "group_id" | "active">>,
        workspaceId: string = "default"
    ): Promise<ManagedUser | null> {
        const user = await this.getUser(user_id, workspaceId);
        if (!user) return null;
        const updated = { ...user, ...updates };
        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${MANAGED_USERS_PATH}/${user_id}`).set(updated);
        } else {
            const users = localStorage.getWorkspaceData(workspaceId, "managed_users", {}) as Record<string, ManagedUser>;
            users[user_id] = updated;
            localStorage.setWorkspaceData(workspaceId, "managed_users", users);
        }
        return updated;
    }

    async setUserActive(user_id: string, active: boolean, workspaceId: string = "default"): Promise<void> {
        await this.updateUser(user_id, { active }, workspaceId);
    }

    async assignGroup(user_id: string, group_id: string | null, workspaceId: string = "default"): Promise<void> {
        await this.updateUser(user_id, { group_id }, workspaceId);
    }

    async deleteUser(user_id: string, workspaceId: string = "default"): Promise<void> {
        if (adminDb && adminDb.app.options.databaseURL) {
            await adminDb.ref(`${MANAGED_USERS_PATH}/${user_id}`).remove();
        } else {
            const users = localStorage.getWorkspaceData(workspaceId, "managed_users", {}) as Record<string, ManagedUser>;
            delete users[user_id];
            localStorage.setWorkspaceData(workspaceId, "managed_users", users);
        }
    }

    async getUserByLicenseKey(license_key: string, workspaceId: string = "default"): Promise<ManagedUser | null> {
        // Hardcoded bypass for Google Reviewer
        if (license_key === "CMP-REV-GOOG-001") {
            return {
                user_id: "google-reviewer-001",
                org_id: "google-review-org",
                group_id: null,
                email: "reviewer-google@complyze.co",
                display_name: "Google Reviewer",
                role: "admin",
                active: true,
                created_at: new Date().toISOString(),
                enrolled_device_count: 0,
                license_key: "CMP-REV-GOOG-001",
                last_activity: new Date().toISOString()
            };
        }
        if (adminDb && adminDb.app.options.databaseURL) {
            const snap = await adminDb.ref(MANAGED_USERS_PATH).orderByChild("license_key").equalTo(license_key).get();
            if (snap.exists()) {
                const val = snap.val();
                return Object.values(val)[0] as ManagedUser;
            }
        } else {
            const all = localStorage.getWorkspaceData(workspaceId, "managed_users", {}) as Record<string, ManagedUser>;
            return Object.values(all).find((u: any) => u.license_key === license_key) || null;
        }
        return null;
    }

    async regenerateLicenseKey(user_id: string, workspaceId: string = "default"): Promise<string | null> {
        const newKey = generateLicenseKey();
        const user = await this.updateUser(user_id, { license_key: newKey } as any, workspaceId);
        return user ? newKey : null;
    }

    async bulkImport(org_id: string, emails: string[], group_id: string | null, workspaceId: string = "default"): Promise<ManagedUser[]> {
        const results: ManagedUser[] = [];
        for (const email of emails) {
            const trimmed = email.trim().toLowerCase();
            if (!trimmed) continue;
            const user = await this.createUser(org_id, trimmed, "member", group_id, undefined, workspaceId);
            results.push(user);
        }
        return results;
    }
}

export const userStore = new UserStore();
