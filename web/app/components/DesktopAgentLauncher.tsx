"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const AGENT_VERSION = "1.2.0";

type Status = "connected" | "connecting" | "disconnected" | "error";
type Phase = "idle" | "downloading" | "installing" | "configuring" | "ready";
type Risk = "low" | "medium" | "high" | "critical";

interface Platform {
    label: string;
    icon: string;
    fileName: string;
    size: string;
    arch: string;
}

const platforms: Record<string, Platform> = {
    macOS: {
        label: "macOS",
        icon: "🍎",
        fileName: `Complyze-Agent-${AGENT_VERSION}.dmg`,
        size: "48 MB",
        arch: "Universal (Intel + Apple Silicon)",
    },
    windows: {
        label: "Windows",
        icon: "⊞",
        fileName: `Complyze-Agent-Setup-${AGENT_VERSION}.exe`,
        size: "52 MB",
        arch: "x64",
    },
};

function detectPlatform(): string {
    if (typeof navigator === "undefined") return "macOS";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "windows";
    return "macOS";
}

function StatusDot({ status }: { status: Status }) {
    const colors: Record<Status, string> = {
        connected: "#00ffc8",
        connecting: "#fbbf24",
        disconnected: "#475569",
        error: "#f43f5e",
    };
    const color = colors[status] || colors.disconnected;
    const pulse = status === "connected" || status === "connecting";

    return (
        <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
            {pulse && (
                <span
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        backgroundColor: color,
                        opacity: 0.5,
                        animation: "pulse-ring 1.8s cubic-bezier(0,0,0.2,1) infinite",
                    }}
                />
            )}
            <span
                style={{
                    position: "relative",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: color,
                }}
            />
        </span>
    );
}

function MetricTile({ icon, label, value, accent }: { icon: string; label: string; value: string | number; accent?: string }) {
    return (
        <div
            style={{
                flex: "1 1 140px",
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.055)",
                borderRadius: 14,
                padding: "18px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.35)",
                    textTransform: "uppercase",
                    letterSpacing: "0.09em",
                    fontFamily: "var(--mono)",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                }}
            >
                <span style={{ fontSize: 13 }}>{icon}</span>
                {label}
            </div>
            <div
                style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: accent || "#fff",
                    fontFamily: "var(--display)",
                    lineHeight: 1,
                }}
            >
                {value}
            </div>
        </div>
    );
}

function StepIndicator({ num, title, desc, state, last }: { num: number; title: string; desc: string; state: "active" | "done" | "pending"; last?: boolean }) {
    const done = state === "done";
    const active = state === "active";

    return (
        <div style={{ display: "flex", gap: 14, position: "relative" }}>
            {!last && (
                <div
                    style={{
                        position: "absolute",
                        left: 14,
                        top: 34,
                        bottom: -6,
                        width: 2,
                        background: done
                            ? "linear-gradient(180deg,#00ffc8,rgba(0,255,200,0.15))"
                            : "rgba(255,255,255,0.06)",
                        transition: "background 0.5s",
                    }}
                />
            )}
            <div
                style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                    background: done
                        ? "linear-gradient(135deg,#00ffc8,#0af)"
                        : active
                            ? "rgba(0,255,200,0.12)"
                            : "rgba(255,255,255,0.04)",
                    color: done ? "#0b1120" : active ? "#00ffc8" : "rgba(255,255,255,0.25)",
                    border: active ? "2px solid rgba(0,255,200,0.35)" : "2px solid transparent",
                    transition: "all 0.4s",
                    fontFamily: "var(--mono)",
                }}
            >
                {done ? "✓" : num}
            </div>
            <div style={{ paddingBottom: last ? 0 : 22, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: done || active ? "#fff" : "rgba(255,255,255,0.35)",
                        transition: "color 0.3s",
                    }}
                >
                    {title}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.45, marginTop: 1 }}>
                    {desc}
                </div>
            </div>
        </div>
    );
}

export default function DesktopAgentLauncher() {
    const [platform, setPlatform] = useState<string>("macOS");
    const [status, setStatus] = useState<Status>("disconnected");
    const [phase, setPhase] = useState<Phase>("idle");
    const [showHow, setShowHow] = useState(false);
    const [stats, setStats] = useState({ intercepted: 0, apps: 0, uptime: "--", flags: 0 });
    const [logs, setLogs] = useState<any[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => setPlatform(detectPlatform()), []);
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        }
    }, []);

    // Simulate live counter increment
    useEffect(() => {
        if (phase !== "ready") return;
        const iv = setInterval(() => {
            setStats((s) => ({
                ...s,
                intercepted: s.intercepted + Math.floor(Math.random() * 3),
            }));
        }, 4000);
        return () => clearInterval(iv);
    }, [phase]);

    const handleDownload = useCallback(() => {
        setPhase("downloading");
        setStatus("connecting");
        setTimeout(() => setPhase("installing"), 2400);
        setTimeout(() => setPhase("configuring"), 4800);
        setTimeout(() => {
            setPhase("ready");
            setStatus("connected");
            setStats({ intercepted: 24, apps: 6, uptime: "0:01:12", flags: 2 });
            setLogs([
                { t: "just now", app: "ChatGPT", kind: "prompt", risk: "low" },
                { t: "3s ago", app: "Claude", kind: "prompt", risk: "low" },
                { t: "7s ago", app: "GitHub Copilot", kind: "completion", risk: "medium" },
                { t: "11s ago", app: "Gemini", kind: "prompt", risk: "low" },
                { t: "18s ago", app: "Perplexity", kind: "search", risk: "low" },
                { t: "24s ago", app: "Cursor AI", kind: "completion", risk: "high" },
            ]);
        }, 7000);
    }, []);

    const handleReset = () => {
        setPhase("idle");
        setStatus("disconnected");
        setStats({ intercepted: 0, apps: 0, uptime: "--", flags: 0 });
        setLogs([]);
    };

    const pl = platforms[platform];

    const statusLabel: Record<Status, string> = {
        disconnected: "Agent Not Installed",
        connecting: "Connecting…",
        connected: "Proxy Active — Monitoring",
        error: "Connection Error",
    };

    const getStepState = (target: Phase): "done" | "active" | "pending" => {
        const phases: Phase[] = ["downloading", "installing", "configuring", "ready"];
        const ci = phases.indexOf(phase);
        const ti = phases.indexOf(target);
        if (ci > ti || phase === "ready") return "done";
        if (ci === ti) return "active";
        return "pending";
    };

    const riskColor: Record<Risk, string> = { low: "#00ffc8", medium: "#fbbf24", high: "#f43f5e", critical: "#dc2626" };
    const riskBg: Record<Risk, string> = { low: "rgba(0,255,200,0.1)", medium: "rgba(251,191,36,0.1)", high: "rgba(244,63,94,0.1)", critical: "rgba(220,38,38,0.1)" };

    return (
        <div
            style={{
                "--display": "'Sora', 'Space Grotesk', system-ui, sans-serif",
                "--body": "'DM Sans', system-ui, sans-serif",
                "--mono": "'JetBrains Mono', 'Fira Code', monospace",
                fontFamily: "var(--body)",
                background: "linear-gradient(170deg, rgba(15,20,35,0.95), rgba(10,15,28,0.98))",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 22,
                overflow: "hidden",
                position: "relative",
                boxShadow: "0 0 80px rgba(0,255,200,0.03), 0 2px 40px rgba(0,0,0,0.5)",
                width: "100%",
                maxWidth: 900,
                margin: "0 auto",
            } as React.CSSProperties}
        >
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes pulse-ring { 75%,100% { transform:scale(2.2); opacity:0; } }
        @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
        @keyframes progress { from { width:0%; } to { width:100%; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
        @keyframes borderGlow {
          0% { opacity:0.4; }
          50% { opacity:0.8; }
          100% { opacity:0.4; }
        }
      `}</style>

            {/* Top glow line */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 1,
                    background:
                        status === "connected"
                            ? "linear-gradient(90deg, transparent 5%, rgba(0,255,200,0.5) 50%, transparent 95%)"
                            : "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.08) 50%, transparent 90%)",
                    animation: status === "connected" ? "borderGlow 3s ease-in-out infinite" : "none",
                }}
            />

            {/* ── HEADER ── */}
            <div style={{ padding: "28px 32px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                        style={{
                            width: 50,
                            height: 50,
                            borderRadius: 15,
                            background:
                                status === "connected"
                                    ? "linear-gradient(135deg, rgba(0,255,200,0.14), rgba(0,170,255,0.08))"
                                    : "rgba(255,255,255,0.035)",
                            border:
                                status === "connected"
                                    ? "1px solid rgba(0,255,200,0.2)"
                                    : "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 24,
                            animation: status === "connected" ? "float 3.5s ease-in-out infinite" : "none",
                            transition: "all 0.5s",
                        }}
                    >
                        🛡️
                    </div>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: 19,
                                    fontWeight: 700,
                                    fontFamily: "var(--display)",
                                    letterSpacing: "-0.03em",
                                    color: "#fff",
                                }}
                            >
                                Complyze Desktop Agent
                            </h2>
                            <span
                                style={{
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    background: "rgba(0,170,255,0.1)",
                                    color: "#38bdf8",
                                    fontSize: 10,
                                    fontFamily: "var(--mono)",
                                    fontWeight: 600,
                                }}
                            >
                                v{AGENT_VERSION}
                            </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                            <StatusDot status={status} />
                            <span>{statusLabel[status]}</span>
                        </div>
                    </div>
                </div>

                {/* Platform pills */}
                <div
                    style={{
                        display: "inline-flex",
                        background: "rgba(255,255,255,0.035)",
                        borderRadius: 10,
                        padding: 3,
                        gap: 2,
                        border: "1px solid rgba(255,255,255,0.05)",
                    }}
                >
                    {Object.entries(platforms).map(([key, val]) => (
                        <button
                            key={key}
                            onClick={() => setPlatform(key)}
                            style={{
                                padding: "7px 14px",
                                borderRadius: 8,
                                border: "none",
                                fontSize: 12,
                                fontFamily: "var(--mono)",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                background: platform === key ? "rgba(255,255,255,0.1)" : "transparent",
                                color: platform === key ? "#fff" : "rgba(255,255,255,0.35)",
                                fontWeight: platform === key ? 600 : 400,
                            }}
                        >
                            {val.icon} {val.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── FEATURE TAGS ── */}
            <div style={{ padding: "14px 32px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                    ["🔒", "Auto-configures proxy"],
                    ["📜", "Trusts CA certificate"],
                    ["👁️", "Deep prompt inspection"],
                    ["📊", "Live dashboard sync"],
                    ["⚡", "Menu bar toggle"],
                ].map(([ico, txt], i) => (
                    <span
                        key={i}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 10px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            fontSize: 11,
                            color: "rgba(255,255,255,0.45)",
                            fontFamily: "var(--mono)",
                        }}
                    >
                        {ico} {txt}
                    </span>
                ))}
            </div>

            {/* ── BODY ── */}
            <div style={{ padding: "22px 32px 28px" }}>
                {/* IDLE STATE */}
                {phase === "idle" && (
                    <div style={{ animation: "fadeUp 0.4s ease" }}>
                        <p
                            style={{
                                fontSize: 13.5,
                                color: "rgba(255,255,255,0.48)",
                                lineHeight: 1.65,
                                margin: "0 0 22px",
                                maxWidth: 620,
                            }}
                        >
                            Install the Complyze Desktop Agent to intercept and monitor all AI traffic on this
                            machine. The agent runs silently in your menu bar and streams live governance data
                            to this dashboard — <strong style={{ color: "rgba(255,255,255,0.7)" }}>no terminal commands required.</strong>
                        </p>

                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <button
                                onClick={handleDownload}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "14px 30px",
                                    border: "none",
                                    borderRadius: 14,
                                    fontSize: 15,
                                    fontWeight: 650,
                                    fontFamily: "var(--body)",
                                    cursor: "pointer",
                                    background: "linear-gradient(135deg, #00ffc8 0%, #00c9a7 45%, #0af 100%)",
                                    color: "#0a0f1a",
                                    transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
                                    boxShadow: "0 4px 20px rgba(0,255,200,0.2)",
                                    position: "relative",
                                    overflow: "hidden",
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download for {pl.label}
                            </button>

                            <button
                                onClick={() => setShowHow((h) => !h)}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "14px 22px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: 14,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    fontFamily: "var(--body)",
                                    cursor: "pointer",
                                    background: "rgba(255,255,255,0.04)",
                                    color: "rgba(255,255,255,0.65)",
                                    transition: "all 0.2s",
                                }}
                            >
                                {showHow ? "▾ Hide Details" : "▸ How It Works"}
                            </button>

                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)" }}>
                                {pl.fileName} · {pl.size}
                            </span>
                        </div>

                        {/* HOW IT WORKS PANEL */}
                        {showHow && (
                            <div
                                style={{
                                    marginTop: 20,
                                    padding: 22,
                                    background: "rgba(255,255,255,0.02)",
                                    borderRadius: 16,
                                    border: "1px solid rgba(255,255,255,0.05)",
                                    animation: "fadeUp 0.35s ease",
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: "rgba(255,255,255,0.25)",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.1em",
                                        fontFamily: "var(--mono)",
                                        marginBottom: 16,
                                    }}
                                >
                                    Zero-Config Setup
                                </div>
                                <StepIndicator num={1} title="Download & Install" desc={`Double-click the ${pl.label} installer. Drag to Applications (macOS) or run setup (Windows).`} state="active" />
                                <StepIndicator num={2} title="Automatic Proxy & Certificate Configuration" desc="The agent sets your system HTTPS proxy to 127.0.0.1:8080 and installs the Complyze CA certificate. You'll see one native OS prompt to approve — that's it." state="pending" />
                                <StepIndicator num={3} title="Live AI Traffic Monitoring" desc="All AI traffic (ChatGPT, Claude, Copilot, Gemini, Perplexity, Cursor, etc.) is intercepted with full prompt visibility and streamed to your governance dashboard in real-time." state="pending" last />
                            </div>
                        )}
                    </div>
                )}

                {/* SETUP PROGRESS */}
                {phase !== "idle" && phase !== "ready" && (
                    <div style={{ animation: "fadeUp 0.35s ease" }}>
                        <div
                            style={{
                                padding: 24,
                                background: "rgba(255,255,255,0.02)",
                                borderRadius: 16,
                                border: "1px solid rgba(255,255,255,0.05)",
                            }}
                        >
                            <StepIndicator
                                num={1}
                                title="Downloading Agent"
                                desc={`${pl.fileName} (${pl.size})`}
                                state={getStepState("downloading")}
                            />
                            <StepIndicator
                                num={2}
                                title="Installing Application"
                                desc="Registering menu bar app and background service"
                                state={getStepState("installing")}
                            />
                            <StepIndicator
                                num={3}
                                title="Configuring Proxy & Certificates"
                                desc="Setting HTTPS proxy → 127.0.0.1:8080 · Trusting Complyze CA"
                                state={getStepState("configuring")}
                                last
                            />

                            {/* Progress bar */}
                            <div
                                style={{
                                    height: 3,
                                    borderRadius: 2,
                                    background: "rgba(255,255,255,0.05)",
                                    overflow: "hidden",
                                    marginTop: 18,
                                }}
                            >
                                <div
                                    style={{
                                        height: "100%",
                                        borderRadius: 2,
                                        background: "linear-gradient(90deg, #00ffc8, #0af, #7c3aed)",
                                        backgroundSize: "200% 100%",
                                        animation: "progress 7s ease-in-out forwards, shimmer 2s ease-in-out infinite",
                                    }}
                                />
                            </div>
                            <div
                                style={{
                                    textAlign: "center",
                                    marginTop: 14,
                                    fontSize: 12,
                                    fontFamily: "var(--mono)",
                                    color: "rgba(255,255,255,0.3)",
                                }}
                            >
                                {phase === "downloading" && "⬇ Downloading agent package…"}
                                {phase === "installing" && "📦 Installing menu bar service…"}
                                {phase === "configuring" && "🔐 Configuring system proxy & certificates…"}
                            </div>
                        </div>
                    </div>
                )}

                {/* CONNECTED — LIVE DASHBOARD */}
                {phase === "ready" && (
                    <div style={{ animation: "fadeUp 0.5s ease" }}>
                        {/* Metrics */}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                            <MetricTile icon="📡" label="Intercepted" value={stats.intercepted} accent="#00ffc8" />
                            <MetricTile icon="🤖" label="AI Apps" value={stats.apps} />
                            <MetricTile icon="⏱" label="Uptime" value={stats.uptime} />
                            <MetricTile icon="⚠️" label="Risk Flags" value={stats.flags} accent={stats.flags > 0 ? "#fbbf24" : undefined} />
                        </div>

                        {/* Live Feed */}
                        <div
                            style={{
                                padding: 18,
                                background: "rgba(255,255,255,0.02)",
                                borderRadius: 16,
                                border: "1px solid rgba(255,255,255,0.05)",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: "rgba(255,255,255,0.25)",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.1em",
                                        fontFamily: "var(--mono)",
                                    }}
                                >
                                    Live Intercept Feed
                                </span>
                                <span
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 5,
                                        fontSize: 11,
                                        color: "#00ffc8",
                                        fontFamily: "var(--mono)",
                                        marginLeft: "auto"
                                    }}
                                >
                                    <StatusDot status="connected" />
                                    streaming
                                </span>
                            </div>

                            {logs.map((log, i) => (
                                <div
                                    key={i}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "9px 12px",
                                        borderRadius: 9,
                                        background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                                        fontSize: 12,
                                        fontFamily: "var(--mono)",
                                        animation: `fadeUp ${0.15 + i * 0.08}s ease both`,
                                    }}
                                >
                                    <span style={{ color: "rgba(255,255,255,0.18)", width: 56, flexShrink: 0, fontSize: 11 }}>
                                        {log.t}
                                    </span>
                                    <span style={{ color: "#fff", fontWeight: 600, width: 110, flexShrink: 0 }}>
                                        {log.app}
                                    </span>
                                    <span style={{ color: "rgba(255,255,255,0.3)", flex: 1 }}>
                                        {log.kind}
                                    </span>
                                    <span
                                        style={{
                                            padding: "2px 9px",
                                            borderRadius: 6,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.04em",
                                            background: riskBg[log.risk as Risk],
                                            color: riskColor[log.risk as Risk],
                                        }}
                                    >
                                        {log.risk}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Controls */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginTop: 18,
                                flexWrap: "wrap",
                                gap: 12,
                            }}
                        >
                            <div style={{ display: "flex", gap: 8 }}>
                                <button
                                    onClick={handleReset}
                                    style={{
                                        padding: "10px 18px",
                                        borderRadius: 10,
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        background: "rgba(255,255,255,0.035)",
                                        color: "rgba(255,255,255,0.6)",
                                        fontSize: 13,
                                        fontFamily: "var(--body)",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                        fontWeight: 500,
                                    }}
                                >
                                    ⏸ Pause Agent
                                </button>
                                <button
                                    style={{
                                        padding: "10px 18px",
                                        borderRadius: 10,
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        background: "rgba(255,255,255,0.035)",
                                        color: "rgba(255,255,255,0.6)",
                                        fontSize: 13,
                                        fontFamily: "var(--body)",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                        fontWeight: 500,
                                    }}
                                >
                                    ⚙ Settings
                                </button>
                            </div>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", fontFamily: "var(--mono)" }}>
                                Agent v{AGENT_VERSION} · Proxy 127.0.0.1:8080 · Dashboard synced
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
