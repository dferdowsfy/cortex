import crypto from "crypto";
import { NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminApp, adminDb } from "@/lib/firebase/admin";
import { userStore } from "@/lib/user-store";

export interface SessionContext {
  requestId: string;
  userId: string;
  email: string;
  organizationId: string;
  groupIds: string[];
  workspaceId: string;
}

async function verifyIdentity(req: NextRequest): Promise<{ uid?: string; email?: string }> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const hasBearer = authHeader.startsWith("Bearer ");

  if (!hasBearer) {
    return {
      uid: req.headers.get("X-User-UID") || "",
      email: req.headers.get("X-User-Email") || "",
    };
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) return {};

  try {
    const decoded = await getAuth(adminApp).verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email || "" };
  } catch (error) {
    if (!process.env.DEBUG_BYPASS) {
      return {};
    }
    console.warn("[session-context] verifyIdToken failed, DEBUG_BYPASS fallback", error);
    return {
      uid: req.headers.get("X-User-UID") || "",
      email: req.headers.get("X-User-Email") || "",
    };
  }
}

export async function resolveSessionContext(req: NextRequest): Promise<SessionContext | null> {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const verified = await verifyIdentity(req);

  const userId = verified.uid || req.headers.get("X-User-UID") || "";
  const email = (verified.email || req.headers.get("X-User-Email") || "").toLowerCase();
  const organizationIdHeader = req.headers.get("X-Organization-ID") || "";

  if (!userId && !email) {
    return null;
  }

  let organizationId = organizationIdHeader;
  let groupIds: string[] = [];

  if (adminDb) {
    try {
      const extSnap = await adminDb.ref(`extension_users/${userId}`).get();
      if (extSnap.exists()) {
        const extUser = extSnap.val() as any;
        organizationId = organizationId || extUser.orgId || "";
      }
    } catch (e) {
      console.warn("[session-context] extension_users lookup failed", e);
    }
  }

  const users = organizationId ? await userStore.listUsers(organizationId, "default") : [];
  const managed = users.find((u) => u.user_id === userId || (email && u.email.toLowerCase() === email));
  if (managed?.group_id) {
    groupIds = [managed.group_id];
  }

  // Fallback to userId if no organizational ID is found (allows personal activity logging)
  const finalWorkspaceId = organizationId || userId || "default";

  return {
    requestId,
    userId: userId || managed?.user_id || email || "unknown",
    email: email || managed?.email || "unknown",
    organizationId: organizationId || "",
    groupIds,
    workspaceId: finalWorkspaceId,
  };
}
