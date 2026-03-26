"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface ExtensionEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  userId: string;
  organizationId: string;
  metadata?: Record<string, any>;
  decision?: string;
  syncedAt?: string;
  riskScore?: number;
  summary?: string;
}

interface UseExtensionEventsOptions {
  /** Organization/workspace ID to watch */
  workspaceId: string;
  /** Optional user ID filter */
  userId?: string;
  /** Max events to fetch (default: 50) */
  limit?: number;
  /** Polling interval in ms for fallback (default: 5000) */
  pollInterval?: number;
  /** Whether to auto-start polling */
  enabled?: boolean;
}

/**
 * React hook for real-time extension event sync on the dashboard.
 *
 * Provides:
 *  - `events`: sorted list of extension events (most recent first)
 *  - `loading`: initial load state
 *  - `refresh`: manual refresh function
 *  - `stats`: aggregated event counts
 *
 * Uses polling via the /api/events/feed endpoint with configurable interval
 * to reflect new events without page refresh.
 */
export function useExtensionEvents({
  workspaceId,
  userId,
  limit = 50,
  pollInterval = 5000,
  enabled = true,
}: UseExtensionEventsOptions) {
  const [events, setEvents] = useState<ExtensionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (userId) params.set("userId", userId);

      const res = await fetch(`/api/events/feed?${params.toString()}`);
      if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);

      const data = await res.json();
      const newEvents = (data.events || []) as ExtensionEvent[];

      // Sort by timestamp descending (most recent first)
      newEvents.sort((a: ExtensionEvent, b: ExtensionEvent) =>
        b.timestamp.localeCompare(a.timestamp)
      );

      setEvents(newEvents);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId, limit]);

  // Initial fetch + continuous polling
  useEffect(() => {
    if (!enabled || !workspaceId) return;

    // Initial fetch
    fetchEvents();

    // Set up polling for real-time sync
    intervalRef.current = setInterval(fetchEvents, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, workspaceId, fetchEvents, pollInterval]);

  // Calculate stats from current events
  const stats = {
    total: events.length,
    blocked: events.filter((e) => e.eventType === "PROMPT_BLOCKED").length,
    allowed: events.filter(
      (e) => e.eventType === "PROMPT_ALLOWED" || e.eventType === "PROMPT_SCANNED"
    ).length,
    redacted: events.filter((e) => e.eventType === "PROMPT_REDACTED").length,
    flagged: events.filter((e) => e.eventType === "AUDIT_ONLY_FLAGGED").length,
  };

  return {
    events,
    loading,
    error,
    stats,
    refresh: fetchEvents,
  };
}

/**
 * React hook for watching group policy changes.
 * Polls the policy endpoint to detect version changes.
 */
export function useGroupPolicyWatch({
  orgId,
  pollInterval = 10000,
  enabled = true,
}: {
  orgId: string;
  pollInterval?: number;
  enabled?: boolean;
}) {
  const [policyVersion, setPolicyVersion] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !orgId) return;

    const checkVersion = async () => {
      try {
        const res = await fetch("/api/policy/version");
        if (!res.ok) return;
        const data = await res.json();
        if (data.policyVersion && data.policyVersion !== policyVersion) {
          setPolicyVersion(data.policyVersion);
          setLastUpdated(new Date().toISOString());
        }
      } catch {
        // non-fatal
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, pollInterval);
    return () => clearInterval(interval);
  }, [enabled, orgId, pollInterval, policyVersion]);

  return { policyVersion, lastUpdated };
}
