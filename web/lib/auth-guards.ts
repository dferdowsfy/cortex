import { adminDb } from "./firebase/admin";
import { UserRole } from "./saas-types";

export interface Identity {
    uid: string;
    org_id?: string;
    role?: UserRole;
    isSuperAdmin: boolean;
}

/**
 * Validates the requester's identity and permissions.
 * Currently, we expect `workspaceId` (which is User UID) to be passed for admin context.
 */
export async function getIdentity(workspaceId: string): Promise<Identity | null> {
    if (!adminDb) return null;
    const path = `managed_users/${workspaceId}`;
    const snap = await adminDb.ref(path).get();
    if (!snap.exists()) return null;

    const data = snap.val();
    return {
        uid: workspaceId,
        org_id: data.org_id,
        role: data.role as UserRole,
        isSuperAdmin: data.role === "super_admin",
    };
}

/**
 * Permission guard for Super Admins only.
 */
export async function requireSuperAdmin(workspaceId: string): Promise<Identity> {
    const identity = await getIdentity(workspaceId);
    if (!identity || !identity.isSuperAdmin) {
        throw new Error("Access Denied: Super Admin role required.");
    }
    return identity;
}

/**
 * Permission guard for Org Admins or above.
 */
export async function requireOrgAdmin(workspaceId: string, org_id?: string): Promise<Identity> {
    const identity = await getIdentity(workspaceId);
    if (!identity) throw new Error("Unauthorized.");
    if (identity.isSuperAdmin) return identity;

    if (identity.role !== "org_admin" && identity.role !== "super_admin") {
        throw new Error("Access Denied: Organization Admin role required.");
    }
    if (org_id && identity.org_id !== org_id) {
        throw new Error("Access Denied: You do not have permission to manage this organization.");
    }
    return identity;
}

/**
 * Permission guard for Group Admins or above.
 */
export async function requireGroupAdmin(workspaceId: string, org_id: string, group_id: string): Promise<Identity> {
    const identity = await getIdentity(workspaceId);
    if (!identity) throw new Error("Unauthorized.");
    if (identity.isSuperAdmin) return identity;
    if (identity.role === "org_admin" && identity.org_id === org_id) return identity;

    if (identity.role !== "group_admin") {
        throw new Error("Access Denied: Group Admin role required.");
    }

    if (!adminDb) return identity;

    // Additional check: Does this group belong to the admin?
    // In our model, we check if the user belongs to the group and has the role.
    const path = `user_groups/${org_id}/${group_id}/members/${workspaceId}`;
    const inGroupSnap = await adminDb.ref(path).get();
    if (!inGroupSnap.exists()) {
        throw new Error("Access Denied: You are not an admin of this group.");
    }

    return identity;
}
