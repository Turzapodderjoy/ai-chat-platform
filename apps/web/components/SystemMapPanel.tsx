"use client";

// Control Plane — System Map. Live n8n-style box graph of the whole platform
// (channels -> app -> gateway -> agents/provider) re-probed every few seconds.
// Upgraded to behave like a real ops console:
//   - node boxes can be dragged into any arrangement (persisted per browser)
//   - edges carry live traffic numbers from the actual DB
//   - agent boxes show how busy they are right now
//   - an inline command box lets you tell Hermes/opencode what to change or
//     fix without leaving the map
//   - one click puts the whole thing fullscreen
// A Storage band (DB tables, agent profiles, logs/secrets) + OS vitals sit
// underneath, same as before.

import { useEffect, useMemo, useRef, useState } from "react";

import { cardStyle, subtleTextStyle } from "./dashboard-styles";

interface MapNode {
  id: string;
  label: string;
  kind: string;
  status: string;
  latency?: number;
  detail: string;
}

interface StorageTable {
  name: string;
  rows: number | null;
  bytes: number | null;
}
interface StorageInfo {
  dbBytes: number | null;
  tables: StorageTable[];
  profiles: Array<{ slug: string; bytes: number; soulBytes: number; stateDbBytes: number }>;
  logsBytes: Record<string, number>;
  secretPresent: boolean;
}
interface AgentActivity {
  slug: string;
  businessName: string | null;
  lastActiveAt: string | null;
  conversationsToday: number;
  messages24h: number;
}
interface Activity {
  messagesLastHour: number;
  messages24h: number;
  conversationsToday: number;
  messagesByChannel: Record<string, number>;
  agentActivity: AgentActivity[];
}
interface Snapshot {
  generatedAt: string;
  nodes: MapNode[];
  storage: StorageInfo;
  activity: Activity;
  os: { freeMem: number; totalMem: number; diskUsedPercent: number | null } | null;
}

interface OpsEvent {
  id: string;
  op: string;
  params?: Record<string, unknown>;
  requestedAt: string;
  approved?: boolean;
}
interface OpsSnapshot {
  pending: OpsEvent[];
}

const Q = 170;
const QH = 58;
const POS_KEY = "aiva.systemmap.pos";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  degraded: "#f59e0b",
  warning: "#f59e0b",
  down: "#ef4444",
  unknown: "#9ca3af",
};

// Default arrangement. Agents are appended in a right-hand column below the
// fixed nodes; the user can drag everything around afterwards.
const FIXED_POS: Record<string, { x: number; y: number }> = {
  "ch-web": { x: 20, y: 30 },
  "ch-messenger": { x: 20, y: 116 },
  "ch-instagram": { x: 20, y: 202 },
  "ch-whatsapp": { x: 20, y: 288 },
  "ch-team": { x: 20, y: 374 },
  "next-api": { x: 300, y: 160 },
  postgres: { x: 300, y: 352 },
  "hermes-gateway": { x: 480, y: 160 },
  tunnel: { x: 480, y: 392 },
  "prv-ai": { x: 880, y: 160 },
  "agt-platform": { x: 660, y: 40 },
};

const EDGES: Array<{ from: string; to: string; label?: string }> = [
  { from: "ch-web", to: "next-api" },
  { from: "ch-messenger", to: "next-api" },
  { from: "ch-instagram", to: "next-api" },
  { from: "ch-whatsapp", to: "next-api" },
  { from: "ch-team", to: "next-api" },
  { from: "tunnel", to: "next-api", label: "internet" },
  { from: "next-api", to: "postgres" },
  { from: "next-api", to: "hermes-gateway" },
  { from: "hermes-gateway", to: "prv-ai" },
];

const KIND_ICON: Record<string, string> = {
  channel: "📬",
  app: "🖧",
  agent: "🤖",
  provider: "☁",
  net: "🔀",
};

function fmtBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)}MB`;
  return `${(n / 1073741824).toFixed(2)}GB`;
}

function nodeCenter(pos: { x: number; y: number } | undefined): { cx: number; cy: number } | null {
  if (!pos) return null;
  return { cx: pos.x + Q / 2, cy: pos.y + QH / 2 };
}

function ageLabel(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins === 0) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

const SUGGESTIONS = [
  "Fix anything that's down",
  "Clear all AI caches",
  "Warn me about unusual memory pressure",
  "Anything waiting for approval?",
];

export function SystemMapPanel({ onGotoItGuy }: { onGotoItGuy?: () => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [cmd, setCmd] = useState("");
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdReply, setCmdReply] = useState<{ answer: string; actions?: string[] } | null>(null);
  const [cmdError, setCmdError] = useState("");
  const [pendingOps, setPendingOps] = useState<OpsEvent[]>([]);

  // Draggable node positions, seeded from the static layout, persisted in the
  // browser so an arrangement survives reloads.
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(POS_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const dragRef = useRef<{ id: string; ox: number; oy: number; moved: number; px: number; py: number } | null>(null);
  const latestPos = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/admin/system-map")
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as Snapshot;
        })
        .then((s) => {
          if (!alive) return;
          setSnap(s);
          setError("");
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        });
    const loadOps = () =>
      fetch("/api/admin/ops")
        .then(async (r) => (r.ok ? ((await r.json()) as OpsSnapshot) : null))
        .then((o) => {
          if (alive && o) setPendingOps(o.pending);
        })
        .catch(() => {});
    load();
    loadOps();
    const id = setInterval(() => {
      load();
      loadOps();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ESC leaves fullscreen.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const layout = useMemo(() => {
    if (!snap) return null;
    const base: Record<string, { x: number; y: number }> = { ...FIXED_POS };
    let i = 0;
    for (const n of snap.nodes) {
      if (n.id.startsWith("agt-") && n.id !== "agt-platform" && n.id !== "agt-") {
        base[n.id] = { x: 660, y: 140 + i * 96 };
        i++;
      }
    }
    return base;
  }, [snap]);

  // Seed any missing node into the draggable positions whenever the topology
  // changes (e.g. a new agent profile appears).
  useEffect(() => {
    if (!layout) return;
    setPos((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, p] of Object.entries(layout)) {
        if (!next[id]) {
          next[id] = p;
          changed = true;
        }
      }
      if (changed && typeof window !== "undefined") {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(next));
        } catch {
          /* storage full/unavailable */
        }
      }
      return changed ? next : prev;
    });
  }, [layout]);

  const statusOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of snap?.nodes ?? []) m[n.id] = n.status;
    return m;
  }, [snap]);
  const nodeById = useMemo(() => {
    const m: Record<string, MapNode> = {};
    for (const n of snap?.nodes ?? []) m[n.id] = n;
    return m;
  }, [snap]);

  const activityBySlug = useMemo(() => {
    const m: Record<string, AgentActivity> = {};
    for (const a of snap?.activity.agentActivity ?? []) m[a.slug] = a;
    return m;
  }, [snap]);
  const actByChannel: Record<string, number> = snap?.activity.messagesByChannel ?? {};

  async function sendCmd(override?: string) {
    const message = (override ?? cmd).trim();
    if (!message || cmdBusy) return;
    setCmdBusy(true);
    setCmdError("");
    setCmdReply(null);
    try {
      const res = await fetch("/api/admin/hermes-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, mode: "itguy" }),
        signal: AbortSignal.timeout(200_000),
      });
      const data = (await res.json()) as { answer?: string; actions?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCmdReply({ answer: data.answer ?? "", actions: data.actions ?? [] });
      setCmd("");
    } catch (e) {
      setCmdError(e instanceof Error ? e.message : String(e));
    } finally {
      setCmdBusy(false);
    }
  }

  if (!snap || !layout) {
    return (
      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ color: "var(--muted, #8b93a7)" }}>
          {error ? `System map unavailable: ${error}` : "Fetching system map…"}
        </div>
      </div>
    );
  }

  const sel = selected ? nodeById[selected] : null;
  const totalRows = snap.storage.tables.reduce((a, t) => a + (t.rows ?? 0), 0);
  const agentNodes = snap.nodes.filter((n) => n.kind === "agent");
  const canvasW = Math.max(1080, ...Object.values(pos).map((p) => p.x + Q), 0) + 60;
  const canvasH = Math.max(560, ...Object.values(pos).map((p) => p.y + QH), 0) + 80;

  const channelCounts = [
    { id: "ch-web", label: "Web" },
    { id: "ch-messenger", label: "Messenger" },
    { id: "ch-instagram", label: "Instagram" },
    { id: "ch-whatsapp", label: "WhatsApp" },
    { id: "ch-team", label: "Team" },
  ].map((c) => ({ ...c, n: actByChannel[c.id] ?? 0 }));

  const mapBody = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#0d9488,#2dd4bf)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🗺️</span>
          System Map
        </h2>
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, color: "var(--muted, #8b93a7)", flexWrap: "wrap" }}>
          <span title="Messages, last hour">
            💬 <b style={{ color: "var(--fg,#e8eaf0)" }}>{snap.activity.messagesLastHour}</b> msg/1h
          </span>
          <span title="Conversations started today">
            🗂️ <b style={{ color: "var(--fg,#e8eaf0)" }}>{snap.activity.conversationsToday}</b> conv today
          </span>
          <span title="Total storage now">
            📦 <b style={{ color: "var(--fg,#e8eaf0)" }}>{fmtBytes(snap.storage.dbBytes)}</b>
          </span>
          {snap.os && (
            <>
              <span title="Memory">
                RAM {snap.os.diskUsedPercent === null ? "—" : `${Math.round((snap.os.totalMem - snap.os.freeMem) / 1073741824)}/${Math.round(snap.os.totalMem / 1073741824)}GB`}
              </span>
              {snap.os.diskUsedPercent !== null && (
                <span style={snap.os.diskUsedPercent > 85 ? { color: "#f59e0b" } : undefined} title="Disk">
                  DISK {snap.os.diskUsedPercent}%
                </span>
              )}
            </>
          )}
          <span>probes every 5s</span>
          <span>{new Date(snap.generatedAt).toLocaleTimeString()}</span>
          <button
            className="ghost"
            onClick={() => setFull((f) => !f)}
            title={full ? "Exit fullscreen (Esc)" : "Fullscreen"}
            style={{ width: 32, height: 32, padding: 0, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
          >
            {full ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Edge + node canvas */}
      <div style={{ overflow: "auto", position: "relative", border: "1px solid var(--border-subtle)", borderRadius: 12, background: "rgba(0,0,0,0.18)" }}>
        <div style={{ position: "relative", width: canvasW, height: canvasH }}>
          <svg width={canvasW} height={canvasH} style={{ position: "absolute", inset: 0 }}>
            {EDGES.map((e) => {
              const a = nodeCenter(pos[e.from]);
              const b = nodeCenter(pos[e.to]);
              if (!a || !b) return null;
              const color = STATUS_COLOR[statusOf[e.from] ?? "unknown"] ?? "#9ca3af";
              let label = e.label;
              if (e.from.startsWith("ch-")) {
                const n = actByChannel[e.from] ?? 0;
                label = `${n} msg/24h`;
              } else if (e.from === "next-api" && e.to === "postgres") {
                label = `${snap.activity.messages24h} msg/24h`;
              } else if (e.from === "hermes-gateway" && e.to === "prv-ai") {
                label = `${snap.activity.messagesLastHour} msg/1h`;
              }
              return (
                <g key={`${e.from}-${e.to}`}>
                  <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke={color} strokeWidth={1.6} strokeOpacity={0.5} />
                  {label && (
                    <text x={(a.cx + b.cx) / 2} y={(a.cy + b.cy) / 2 - 6} fill="#8b93a7" fontSize={11} textAnchor="middle" style={{ pointerEvents: "none" }}>
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes: HTML boxes, draggable with the pointer, click still selects. */}
          <div
            style={{ position: "absolute", inset: 0 }}
            onPointerMove={(e) => {
              const d = dragRef.current;
              if (!d) return;
              const dx = e.clientX - d.px;
              const dy = e.clientY - d.py;
              d.moved += Math.abs(dx) + Math.abs(dy);
              const p = pos[d.id];
              if (p) {
                d.px = e.clientX;
                d.py = e.clientY;
                setPos((prev) => {
                  const cur = prev[d.id];
                  const next = cur ? { ...prev, [d.id]: { x: Math.max(0, cur.x + dx), y: Math.max(0, cur.y + dy) } } : prev;
                  latestPos.current = next;
                  return next;
                });
              }
            }}
            onPointerUp={() => {
              const hadDrag = dragRef.current;
              if (hadDrag && hadDrag.moved > 6 && Object.keys(latestPos.current).length && typeof window !== "undefined") {
                try {
                  localStorage.setItem(POS_KEY, JSON.stringify(latestPos.current));
                } catch {
                  /* ignore */
                }
              }
              dragRef.current = null;
            }}
            onPointerLeave={() => (dragRef.current = null)}
          >
            {Object.entries(pos).flatMap(([id, p]) => {
              const n = nodeById[id];
              if (!n) return [];
              const color = STATUS_COLOR[n.status] ?? "#9ca3af";
              const isSel = selected === id;
              const act = n.kind === "agent" ? activityBySlug[n.id.replace(/^agt-/, "")] : undefined;
              const live = act && act.messages24h > 0;
              return (
                <div
                  key={id}
                  onPointerDown={(e) => {
                    dragRef.current = { id, ox: p.x, oy: p.y, moved: 0, px: e.clientX, py: e.clientY };
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={() => {
                    if (dragRef.current && dragRef.current.moved > 6) return;
                    setSelected(isSel ? null : id);
                  }}
                  title={n.detail}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    width: Q,
                    minHeight: QH,
                    background: "rgba(255,255,255,0.05)",
                    border: isSel ? `1.5px solid ${color}` : `1px solid ${color}55`,
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "grab",
                    boxSizing: "border-box",
                    userSelect: "none",
                    touchAction: "none",
                    boxShadow: isSel ? "0 2px 14px rgba(0,0,0,0.35)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 116 }}>
                      {KIND_ICON[n.kind] ?? ""} {n.label}
                    </span>
                    {live && (
                      <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "aiva-pulse 1.6s infinite" }}>
                        <style>{"@keyframes aiva-pulse{0%,100%{opacity:1}50%{opacity:.25}}"}</style>
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted, #8b93a7)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {n.status.toUpperCase()}
                    {typeof n.latency === "number" ? ` · ${n.latency}ms` : ""}
                    {act && live ? ` · ${act.messages24h} msg · ${ageLabel(act.lastActiveAt)}` : n.kind === "agent" ? " · idle" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live traffic strip + node detail */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, color: "var(--muted, #8b93a7)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: "var(--fg,#e8eaf0)" }}>Channels:</span>
          {channelCounts.map((c) => (
            <span
              key={c.id}
              title={`${c.label} — inbound messages, last 24h`}
              style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: c.n ? "var(--fg,#e8eaf0)" : "var(--muted,#8b93a7)" }}
            >
              {c.label} {c.n}
            </span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span>
          {sel ? (
            <span>
              <b style={{ color: "var(--fg, #e8eaf0)" }}>{sel.label}</b> — {sel.detail}
            </span>
          ) : (
            <span>
              Drag boxes to rearrange · {agentNodes.length} agent(s) · {snap.nodes.filter((n) => n.status === "ok").length}/{snap.nodes.length} nodes healthy
            </span>
          )}
        </span>
      </div>

      {/* Command box — tell Hermes/opencode what to change or fix */}
      <div style={{ ...cardStyle, padding: 14, background: "linear-gradient(180deg, rgba(13,148,136,0.08), rgba(13,148,136,0.02))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: "linear-gradient(135deg,#0d9488,#2dd4bf)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>🛠️</span>
            Tell Hermes &amp; opencode what to change or fix
          </div>
          {pendingOps.length > 0 && (
            <button
              className="ghost"
              onClick={onGotoItGuy}
              title="Jump to IT Guy console"
              style={{ fontSize: 12, color: "#f59e0b", padding: "4px 10px", borderRadius: 999, border: "1px solid #f59e0b55", background: "rgba(245,158,11,0.08)" }}
            >
              {pendingOps.length} change{pendingOps.length > 1 ? "s" : ""} waiting for approval →
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCmd()}
            placeholder={`e.g. "Fix anything that's down now" or "Revert the AI override for aiva-portal"`}
            disabled={cmdBusy}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={() => sendCmd()}
            disabled={cmdBusy}
            className="ghost"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "linear-gradient(135deg,#0d9488,#2dd4bf)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              opacity: cmdBusy ? 0.7 : 1,
              border: "none",
            }}
          >
            {cmdBusy ? "Working…" : "Send"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="ghost"
              onClick={() => sendCmd(s)}
              disabled={cmdBusy}
              style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)" }}
            >
              {s}
            </button>
          ))}
        </div>
        {cmdError && <div style={{ marginTop: 8, fontSize: 12.5, color: "#ef4444" }}>{cmdError}</div>}
        {cmdReply && !cmdError && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--fg,#e8eaf0)", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px", whiteSpace: "pre-wrap" }}>
            {cmdReply.answer}
            {cmdReply.actions && cmdReply.actions.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {cmdReply.actions.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#2dd4bf" }}>
                    • {a}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Storage band */}
      <div>
        <h3 style={{ margin: "6px 0 8px", fontSize: 14 }}>
          <span style={{ marginRight: 8 }}>📦</span>Storage — how the platform actually stores data
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>PostgreSQL database</div>
            <div style={{ ...subtleTextStyle, marginTop: 2 }}>
              {fmtBytes(snap.storage.dbBytes)} total · {totalRows.toLocaleString()} rows
            </div>
            <table style={{ width: "100%", marginTop: 8, fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {snap.storage.tables.map((t) => (
                  <tr key={t.name}>
                    <td style={{ padding: "2px 0", color: "var(--fg,#e8eaf0)" }}>{t.name}</td>
                    <td style={{ padding: "2px 0", textAlign: "right", color: "var(--muted,#8b93a7)" }}>{fmtBytes(t.bytes)}</td>
                  </tr>
                ))}
                {snap.storage.tables.length === 0 && (
                  <tr>
                    <td style={{ color: "#ef4444" }}>Postgres unreachable</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Hermes agent storage</div>
            <div style={{ ...subtleTextStyle, marginTop: 2 }}>one folder per agent under data/hermes/profiles/</div>
            <div style={{ marginTop: 8 }}>
              {snap.storage.profiles.map((p) => (
                <div key={p.slug} title={`SOUL.md ${fmtBytes(p.soulBytes)} · state.db ${fmtBytes(p.stateDbBytes)}`} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "65%" }}>{p.slug}</span>
                    <span style={{ color: "var(--muted,#8b93a7)" }}>{fmtBytes(p.bytes)}</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(127,127,127,0.18)", borderRadius: 3, marginTop: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (p.bytes / Math.max(1, Math.max(...snap.storage.profiles.map((x) => x.bytes)))) * 100)}%`, background: "#2a6df4", borderRadius: 3 }} />
                  </div>
                </div>
              ))}
              {snap.storage.profiles.length === 0 && <div style={{ fontSize: 12, color: "var(--muted,#8b93a7)" }}>no agent profiles</div>}
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Logs &amp; secrets</div>
            <div style={{ ...subtleTextStyle, marginTop: 2 }}>data/hermes/logs · data/ops ledger · profile .env keys</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {Object.entries(snap.storage.logsBytes).map(([name, bytes]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>{name}</span>
                  <span style={{ color: "var(--muted,#8b93a7)" }}>{fmtBytes(bytes)}</span>
                </div>
              ))}
              <div style={{ marginTop: 6, color: "var(--muted,#8b93a7)" }}>
                API keys stored: <b style={{ color: snap.storage.secretPresent ? "#22c55e" : "#ef4444" }}>{snap.storage.secretPresent ? "present (per-agent .env)" : "missing"}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Fullscreen = same content, mounted as a fixed viewport overlay.
  if (full) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 400,
          background: "var(--bg, #0b0e14)",
          padding: "18px 22px 32px",
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        {mapBody}
      </div>
    );
  }

  return <div style={{ ...cardStyle, padding: 20, position: "relative" }}>{mapBody}</div>;
}