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
            enrolled_at: now, // Matches our latest ManagedUser type
            enrolled_device_count: 0,
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
