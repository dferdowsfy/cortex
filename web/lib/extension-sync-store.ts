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

/**
 * ExtensionSyncStore — manages extension event data in Firebase RTDB.
 *
 * Write path:  workspaces/{orgId}/extension_events/{eventId}
 * Read path:   workspaces/{orgId}/extension_events (full node)
 *
 * Supports:
 *  - Ingest: write events from extension to RTDB
 *  - Feed: read events from RTDB (sorted by timestamp desc)
 *  - Subscribe: real-time listener for new events via onValue/onChildAdded
 *  - Policy watch: monitor group_policies for changes
 */
class ExtensionSyncStore {
  /**
   * Ingest an extension event into RTDB.
   * Writes to: workspaces/{workspaceId}/extension_events/{eventId}
   */
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

  /**
   * Fetch extension events from RTDB for the dashboard.
   * Query path: workspaces/{workspaceId}/extension_events
   * Ordering: sorted by timestamp descending (most recent first)
   */
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

  /**
   * Subscribe to real-time extension events using Firebase onValue listener.
   * Returns an unsubscribe function. Calls `onEvent` for each new event batch.
   *
   * Usage (server-side real-time sync):
   *   const unsub = extensionSyncStore.subscribe("orgId123", (events) => {
   *     // Push to dashboard via SSE or WebSocket
   *   });
   */
  subscribe(
    workspaceId: string,
    onEvent: (events: ExtensionEvent[]) => void,
    userId?: string
  ): (() => void) | null {
    if (!adminDb) {
      console.warn("[extension-sync-store] No adminDb — real-time subscribe unavailable");
      return null;
    }

    const ref = adminDb.ref(`workspaces/${workspaceId}/extension_events`);

    const callback = (snapshot: any) => {
      if (!snapshot.exists()) return;
      let events = Object.values(snapshot.val()) as ExtensionEvent[];
      if (userId) events = events.filter((e) => e.userId === userId);
      events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      onEvent(events);
    };

    ref.on("value", callback);

    // Return unsubscribe function
    return () => {
      ref.off("value", callback);
    };
  }

  /**
   * Subscribe to new extension events as they arrive (child_added).
   * More efficient than full value listener for high-volume scenarios.
   */
  subscribeNewEvents(
    workspaceId: string,
    onNewEvent: (event: ExtensionEvent) => void
  ): (() => void) | null {
    if (!adminDb) return null;

    const ref = adminDb.ref(`workspaces/${workspaceId}/extension_events`);

    const callback = (snapshot: any) => {
      if (!snapshot.exists()) return;
      const event = snapshot.val() as ExtensionEvent;
      onNewEvent(event);
    };

    ref.on("child_added", callback);

    return () => {
      ref.off("child_added", callback);
    };
  }

  /**
   * Watch group_policies for changes to ensure extensions update rules instantly.
   * Returns an unsubscribe function.
   */
  watchGroupPolicies(
    orgId: string,
    onPolicyChange: (policies: any[]) => void
  ): (() => void) | null {
    if (!adminDb) return null;

    const ref = adminDb.ref("group_policies");

    const callback = (snapshot: any) => {
      if (!snapshot.exists()) {
        onPolicyChange([]);
        return;
      }
      const allPolicies = snapshot.val() as Record<string, any>;
      const orgPolicies = Object.entries(allPolicies)
        .filter(([, policy]) => policy.org_id === orgId)
        .map(([id, policy]) => ({ policyId: id, ...policy }));
      onPolicyChange(orgPolicies);
    };

    ref.on("value", callback);

    return () => {
      ref.off("value", callback);
    };
  }

  /**
   * Get event counts by type for dashboard statistics.
   */
  async getEventStats(workspaceId: string, sinceTimestamp?: string): Promise<{
    total: number;
    blocked: number;
    allowed: number;
    redacted: number;
    flagged: number;
  }> {
    const events = await this.feed(workspaceId, undefined, 10000);
    const filtered = sinceTimestamp
      ? events.filter((e) => e.timestamp >= sinceTimestamp)
      : events;

    return {
      total: filtered.length,
      blocked: filtered.filter((e) => e.eventType === "PROMPT_BLOCKED").length,
      allowed: filtered.filter((e) => e.eventType === "PROMPT_ALLOWED" || e.eventType === "PROMPT_SCANNED").length,
      redacted: filtered.filter((e) => e.eventType === "PROMPT_REDACTED").length,
      flagged: filtered.filter((e) => e.eventType === "AUDIT_ONLY_FLAGGED").length,
    };
  }
}

export const extensionSyncStore = new ExtensionSyncStore();
