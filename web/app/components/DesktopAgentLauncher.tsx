"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AgentStatus = {
  connected: boolean;
  last_seen: string | null;
  hostname: string | null;
  minutes_ago?: number;
};

type ActivityEvent = {
  id: string;
  tool: string;
  timestamp: string;
  risk_category: string;
};

type ActivityResponse = {
  summary?: {
    total_requests: number;
    total_violations: number;
    top_tools: { tool: string; count: number }[];
  };
  events?: ActivityEvent[];
};

const INSTALLER_URL = "/api/agent/installer";

export default function DesktopAgentLauncher() {
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      setError(null);
      const [agentRes, activityRes] = await Promise.all([
        fetch("/api/agent/heartbeat", { cache: "no-store" }),
        fetch("/api/proxy/activity?period=7d&events=6", { cache: "no-store" }),
      ]);

      if (!agentRes.ok || !activityRes.ok) {
        throw new Error("Failed to load live desktop monitoring data");
      }

      setAgent(await agentRes.json());
      setActivity(await activityRes.json());
    } catch {
      setError("Unable to load live agent data right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 15000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const topApps = useMemo(() => activity?.summary?.top_tools?.slice(0, 4) ?? [], [activity]);
  const recentEvents = useMemo(() => activity?.events?.slice(0, 4) ?? [], [activity]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Desktop Agent Monitoring (Live)</h2>
          <p className="mt-1 text-sm text-gray-600">
            This panel reads real agent heartbeat and activity APIs (no placeholder simulation).
          </p>
        </div>
        <a
          href={INSTALLER_URL}
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Install Agent
        </a>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Status" value={loading ? "Checking…" : agent?.connected ? "Connected" : "Offline"} />
        <Stat label="Hostname" value={agent?.hostname || "—"} />
        <Stat
          label="Last seen"
          value={agent?.last_seen ? new Date(agent.last_seen).toLocaleString() : "No heartbeat"}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Requests (7d)" value={activity?.summary?.total_requests ?? 0} />
        <Stat label="Violations (7d)" value={activity?.summary?.total_violations ?? 0} />
        <Stat label="AI Apps seen" value={activity?.summary?.top_tools?.length ?? 0} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Top desktop AI apps</h3>
          <ul className="mt-2 space-y-2 text-sm text-gray-700">
            {topApps.length === 0 && <li className="text-gray-500">No desktop activity captured yet.</li>}
            {topApps.map((tool) => (
              <li key={tool.tool} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2">
                <span>{tool.tool}</span>
                <span className="font-semibold">{tool.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900">Recent monitored events</h3>
          <ul className="mt-2 space-y-2 text-sm text-gray-700">
            {recentEvents.length === 0 && <li className="text-gray-500">No recent events yet.</li>}
            {recentEvents.map((event) => (
              <li key={event.id} className="rounded-md border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{event.tool}</span>
                  <span className="text-xs uppercase text-gray-500">{event.risk_category || "unknown"}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">{new Date(event.timestamp).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
