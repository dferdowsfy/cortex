import { adminDb } from "@/lib/firebase/admin";
import { localStorage } from "@/lib/local-storage";

export type ExtensionEventType =
  | "PROMPT_SCANNED"
  | "PROMPT_ALLOWED"
  | "PROMPT_BLOCKED"
  | "PROMPT_REDACTED"
  | "AUDIT_ONLY_FLAGGED"
  | "POLICY_FETCHED"
  | "POLICY_APPLIED"
  | "POLICY_FETCH_FAILED"
  | "EVENT_SYNC_FAILED";

export interface ExtensionEvent {
  eventId: string;
  eventType: ExtensionEventType;
  timestamp: string;
  userId: string;
  organizationId: string;
  groupIds: string[];
  extensionVersion?: string;
  browser?: string;
  platform?: string;
  policyVersion?: number;
  decision?: string;
  riskScore?: number;
  modelScore?: number;
  modelUsed?: string;
  redactionApplied?: boolean;
  metadata?: Record<string, any>;
  summary?: string;
  syncedAt?: string;
}

class ExtensionSyncStore {
  async ingest(event: ExtensionEvent, workspaceId = "default") {
    const dbPath = `workspaces/${workspaceId}/extension_events/${event.eventId}`;
    if (adminDb) {
      const existing = await adminDb.ref(dbPath).get();
      if (existing.exists()) {
        return existing.val() as ExtensionEvent;
      }
      await adminDb.ref(dbPath).set({ ...event, syncedAt: new Date().toISOString() });
    }

    const events = localStorage.getWorkspaceData(workspaceId, "extension_events", {}) as Record<string, ExtensionEvent>;
    if (!events[event.eventId]) {
      events[event.eventId] = { ...event, syncedAt: new Date().toISOString() };
      localStorage.setWorkspaceData(workspaceId, "extension_events", events);
    }
    return events[event.eventId] || event;
  }

  async feed(workspaceId = "default", userId?: string, limit = 50): Promise<ExtensionEvent[]> {
    if (adminDb) {
      const snap = await adminDb.ref(`workspaces/${workspaceId}/extension_events`).get();
      if (snap.exists()) {
        let events = Object.values(snap.val()) as ExtensionEvent[];
        if (userId) events = events.filter((e) => e.userId === userId);
        return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
      }
    }

    const events = Object.values(localStorage.getWorkspaceData(workspaceId, "extension_events", {}) as Record<string, ExtensionEvent>);
    return events
      .filter((e) => (userId ? e.userId === userId : true))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }
}

export const extensionSyncStore = new ExtensionSyncStore();
