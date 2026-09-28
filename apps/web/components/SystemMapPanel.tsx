"use client";

// Control Plane — System Map, n8n-style. Live box graph of the whole platform
// (channels -> app -> gateway -> agents/provider) re-probed every few seconds.
// The canvas behaves like a wiring editor, not a static picture:
//   - drag nodes anywhere (pointer-captured, never sticks), pinch/wheel to
//     zoom, drag the background to pan
//   - add nodes from the toolbox and label them yourself
//   - add/remove connections by dragging between the port dots
//   - delete any node or connection (Delete/Backspace or the ✕ button)
//   - the workspace (positions, zoom, added/removed nodes + wires) persists
//     per-browser
//   - agent tiles are wired into the stream (gateway -> agent -> provider)
// Live traffic numbers ride the edges, busy agents pulse green.
// A fullscreen toggle + inline "tell Hermes/opencode what to change or fix"
// command box sit on top; the Storage band lives underneath.

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

interface CustomNode {
  id: string;
  label: string;
  kind: string;
  status?: string;
  latency?: number;
  detail?: string;
}
interface Wire {
  from: string;
  to: string;
}

const Q = 170;
const QH = 58;
const WS_KEY = "aiva.systemmap.ws";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  degraded: "#f59e0b",
  warning: "#f59e0b",
  down: "#ef4444",
  unknown: "#9ca3af",
};

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

const BASE_EDGES: Array<Wire & { label?: string }> = [
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

const ADD_TYPES: Array<{ kind: string; hint: string }> = [
  { kind: "channel", hint: "Channel box" },
  { kind: "app", hint: "App/service box" },
  { kind: "agent", hint: "Agent box" },
  { kind: "provider", hint: "Provider box" },
  { kind: "net", hint: "Network box" },
];

const KIND_ICON: Record<string, string> = {
  channel: "📬",
  app: "🖧",
  agent: "🤖",
  provider: "☁",
  net: "🔀",
};

interface StoredWs {
  pos?: Record<string, { x: number; y: number }>;
  customNodes?: CustomNode[];
  customEdges?: Wire[];
  hiddenIds?: string[];
  removedEdges?: string[];
  transform?: { x: number; y: number; scale: number };
}

function loadWs(): StoredWs {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(WS_KEY) ?? "{}") as StoredWs;
  } catch {
    return {};
  }
}

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

function edgeLabel({ from, to, label }: { from: string; to: string; label?: string }, act: Activity): string | undefined {
  if (label) return label;
  if (from.startsWith("ch-")) return `${act.messagesByChannel[from] ?? 0} msg/24h`;
  if (from === "next-api" && to === "postgres") return `${act.messages24h} msg/24h`;
  if (from === "hermes-gateway" && to === "prv-ai") return `${act.messagesLastHour} msg/1h`;
  return undefined;
}

export function SystemMapPanel({ onGotoItGuy }: { onGotoItGuy?: () => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [full, setFull] = useState(false);
  const [cmd, setCmd] = useState("");
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdReply, setCmdReply] = useState<{ answer: string; actions?: string[] } | null>(null);
  const [cmdError, setCmdError] = useState("");
  const [pendingOps, setPendingOps] = useState<OpsEvent[]>([]);

  // ---- workspace (draggable/zoomable/editable canvas state) ----
  const ws0 = useRef<StoredWs>(loadWs()).current;
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({ ...(ws0.pos ?? {}) });
  const [customNodes, setCustomNodes] = useState<CustomNode[]>(ws0.customNodes ?? []);
  const [customEdges, setCustomEdges] = useState<Wire[]>(ws0.customEdges ?? []);
  const [hiddenIds, setHiddenIds] = useState<string[]>(ws0.hiddenIds ?? []);
  const [removedEdges, setRemovedEdges] = useState<string[]>(ws0.removedEdges ?? []);
  const [transform, setTransform] = useState(ws0.transform ?? { x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [conn, setConn] = useState<{ from: string; x: number; y: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nodeDrag = useRef<{ id: string; px: number; py: number; moved: number } | null>(null);
  const panRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const connActive = useRef<{ from: string } | null>(null);
  const hoverNodeRef = useRef<string | null>(null);
  const renameOrig = useRef<string | null>(null);
  const latestPos = useRef<Record<string, { x: number; y: number }>>({ ...(ws0.pos ?? {}) });

  const commitConnTo = (to?: string) => {
    const ac = connActive.current;
    if (!ac) return;
    connActive.current = null;
    setConn(null);
    if (to && to !== ac.from) {
      setCustomEdges((w) => (w.some((x) => x.from === ac.from && x.to === to) ? w : [...w, { from: ac.from, to }]));
      setRemovedEdges((r) => r.filter((x) => x !== `${ac.from}->${to}`));
    }
  };

  // ---- live reload (map + pending ops) ----
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

  // ESC leaves fullscreen; Delete removes the selected node/edge.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (full && e.key === "Escape") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        const input = document.activeElement as HTMLElement | null;
        if (input && (input.tagName === "INPUT" || input.tagName === "TEXTAREA")) return;
        e.preventDefault();
        if (selected.type === "edge") {
          const [from, to] = selected.id.split("->");
          setRemovedEdges((r) => (r.includes(selected.id) ? r : [...r, selected.id]));
          setCustomEdges((c) => c.filter((w) => !(w.from === from && w.to === to)));
          setSelected(null);
        } else {
          removeNode(selected.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- base layout + seeding new topology ids into draggable positions ----
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

  useEffect(() => {
    if (!layout) return;
    setPos((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, p] of Object.entries(layout)) {
        if (!next[id]) {
          next[id] = p;
          latestPos.current[id] = p;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [layout]);

  // persist workspace whenever an editing shape changes
  useEffect(() => {
    try {
      localStorage.setItem(
        WS_KEY,
        JSON.stringify({ pos, customNodes, customEdges, hiddenIds, removedEdges, transform } satisfies StoredWs),
      );
    } catch {
      /* storage full/unavailable */
    }
  }, [pos, customNodes, customEdges, hiddenIds, removedEdges, transform]);

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

  // ---- visible nodes = snapshot nodes minus hidden, plus user-added custom ----
  const visibleNodes = useMemo(() => {
    const fromSnap = (snap?.nodes ?? []).filter((n) => !hiddenIds.includes(n.id));
    return [...fromSnap, ...customNodes.filter((c) => !hiddenIds.includes(c.id))];
  }, [snap, customNodes, hiddenIds]);

  const allPos = useMemo(() => {
    const merged = { ...pos };
    for (const c of customNodes) if (!merged[c.id]) merged[c.id] = { x: 0, y: 0 };
    return merged;
  }, [pos, customNodes]);

  // ---- edges: base + auto-wired agents + user wires, minus removed/hidden ----
  const edges = useMemo(() => {
    const hidden = (id: string) => hiddenIds.includes(id);
    const out: Array<Wire & { label?: string }> = [];
    for (const e of BASE_EDGES) {
      if (hidden(e.from) || hidden(e.to) || removedEdges.includes(`${e.from}->${e.to}`)) continue;
      out.push(e);
    }
    for (const n of snap?.nodes ?? []) {
      if (n.kind !== "agent" || hidden(n.id)) continue;
      if (!removedEdges.includes(`hermes-gateway->${n.id}`)) out.push({ from: "hermes-gateway", to: n.id });
      if (!removedEdges.includes(`${n.id}->prv-ai`) && !hidden("prv-ai")) out.push({ from: n.id, to: "prv-ai" });
    }
    for (const w of customEdges) {
      if (hidden(w.from) || hidden(w.to) || removedEdges.includes(`${w.from}->${w.to}`)) continue;
      out.push(w);
    }
    return out;
  }, [snap, customEdges, hiddenIds, removedEdges]);

  const canvasW = useMemo(() => Math.max(1120, ...Object.values(allPos).map((p) => p.x + Q), 0) + 140, [allPos]);
  const canvasH = useMemo(() => Math.max(600, ...Object.values(allPos).map((p) => p.y + QH), 0) + 140, [allPos]);

  const toCanvas = (clientX: number, clientY: number) => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: (clientX - r.left - transform.x) / transform.scale,
      y: (clientY - r.top - transform.y) / transform.scale,
    };
  };

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

  function removeNode(id: string) {
    setCustomNodes((c) => c.filter((n) => n.id !== id));
    setCustomEdges((w) => w.filter((e) => e.from !== id && e.to !== id));
    setRemovedEdges((r) => [...r, ...edges.filter((e) => e.from === id || e.to === id).map((e) => `${e.from}->${e.to}`)]);
    setHiddenIds((h) => (h.includes(id) ? h : [...h, id]));
    setPos((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    setSelected(null);
  }

  function addNode(kind: string) {
    const id = `c-${Date.now().toString(36)}`;
    const { x, y } = toCanvas(window.innerWidth / 2, (window.innerHeight || 700) / 2);
    setPos((p) => ({ ...p, [id]: { x: Math.max(0, x - Q / 2), y: Math.max(0, y - QH / 2) } }));
    setCustomNodes((c) => [...c, { id, label: `${kind} box`, kind }]);
    setSelected({ type: "node", id });
    setEditingId(id);
    setAddOpen(false);
  }

  function resetWorkspace() {
    setCustomNodes([]);
    setCustomEdges([]);
    setHiddenIds([]);
    setRemovedEdges([]);
    setTransform({ x: 0, y: 0, scale: 1 });
    setPos({ ...(layout ?? {}) });
    setSelected(null);
    setEditingId(null);
  }

  function zoomBy(factor: number) {
    setTransform((t) => {
      const scale = Math.min(2.4, Math.max(0.3, t.scale * factor));
      const r = surfaceRef.current?.getBoundingClientRect();
      if (!r) return { ...t, scale };
      const cx = (r.width / 2 - t.x) / t.scale;
      const cy = (r.height / 2 - t.y) / t.scale;
      return { x: r.width / 2 - cx * scale, y: r.height / 2 - cy * scale, scale };
    });
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

  const sel = selected?.type === "node" ? visibleNodes.find((n) => n.id === selected.id) : null;
  const totalRows = snap.storage.tables.reduce((a, t) => a + (t.rows ?? 0), 0);
  const agentNodes = snap.nodes.filter((n) => n.kind === "agent");
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

      {/* Editor toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <button
            className="ghost"
            onClick={() => setAddOpen((o) => !o)}
            style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontWeight: 600 }}
          >
            ➕ Add node
          </button>
          {addOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-lg)", padding: 6, minWidth: 180 }}>
              {ADD_TYPES.map((t) => (
                <button
                  key={t.kind}
                  className="ghost"
                  onClick={() => addNode(t.kind)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 8, fontSize: 12.5, textAlign: "left" }}
                >
                  <span>{KIND_ICON[t.kind] ?? "▫️"}</span>
                  {t.hint}
                </button>
              ))}
              <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "4px 0" }} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 10px" }}>
                drag between port dots to wire nodes
              </div>
            </div>
          )}
        </div>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          scale {(transform.scale * 100).toFixed(0)}%
        </span>
        <button className="ghost" onClick={() => zoomBy(1.15)} title="Zoom in" style={{ width: 30, height: 30, padding: 0, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className="ghost" onClick={() => zoomBy(1 / 1.15)} title="Zoom out" style={{ width: 30, height: 30, padding: 0, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <button className="ghost" onClick={resetWorkspace} title="Reset layout" style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
          ⟳ Reset
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          {visibleNodes.length} nodes · {edges.length} connections{hiddenIds.length ? ` · ${hiddenIds.length} hidden` : ""}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={surfaceRef}
        onWheel={(e) => {
          const factor = e.deltaY < 0 ? 1.1 : 0.9;
          setTransform((t) => {
            const scale = Math.min(2.4, Math.max(0.3, t.scale * factor));
            const r = surfaceRef.current?.getBoundingClientRect();
            if (!r) return { ...t, scale };
            const px = e.clientX - r.left;
            const py = e.clientY - r.top;
            const k = scale / t.scale;
            return { x: px - (px - t.x) * k, y: py - (py - t.y) * k, scale };
          });
        }}
        onPointerDown={(e) => {
          if (e.target !== surfaceRef.current) return;
          panRef.current = { px: e.clientX, py: e.clientY, ox: transform.x, oy: transform.y };
          setSelected(null);
          setEditingId(null);
          setAddOpen(false);
        }}
        onPointerMove={(e) => {
          const pan = panRef.current;
          if (pan) {
            setTransform((t) => ({ ...t, x: pan.ox + (e.clientX - pan.px), y: pan.oy + (e.clientY - pan.py) }));
            return;
          }
          if (connActive.current) {
            const p = toCanvas(e.clientX, e.clientY);
            setConn((c) => (c ? { ...c, x: p.x, y: p.y } : c));
          }
        }}
        onPointerUp={() => {
          panRef.current = null;
          commitConnTo(hoverNodeRef.current ?? undefined);
          hoverNodeRef.current = null;
        }}
        style={{
          overflow: "hidden",
          position: "relative",
          height: 560,
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          background: "rgba(0,0,0,0.18)",
          cursor: connActive.current ? "crosshair" : "grab",
          touchAction: "none",
        }}
      >
        <div style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: "0 0", position: "absolute", inset: 0 }}>
          <svg width={canvasW} height={canvasH} style={{ position: "absolute", inset: 0 }}>
            {edges.map((e) => {
              const a = nodeCenter(allPos[e.from]);
              const b = nodeCenter(allPos[e.to]);
              if (!a || !b) return null;
              const key = `${e.from}->${e.to}`;
              const color = STATUS_COLOR[statusOf[e.from] ?? "unknown"] ?? "#9ca3af";
              const isSel = selected?.type === "edge" && selected.id === key;
              const label = edgeLabel(e, snap.activity);
              return (
                <g key={key}>
                  <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} onClick={() => setSelected({ type: "edge", id: key })} />
                  <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke={color} strokeWidth={isSel ? 2.6 : 1.6} strokeOpacity={isSel ? 1 : 0.5} pointerEvents="none" />
                  {label && (
                    <text x={(a.cx + b.cx) / 2} y={(a.cy + b.cy) / 2 - 6} fill={isSel ? "#e8eaf0" : "#8b93a7"} fontSize={11} textAnchor="middle" pointerEvents="none">
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
            {conn && nodeCenter(allPos[conn.from]) && (() => {
              const a = nodeCenter(allPos[conn.from])!;
              return (
                <g pointerEvents="none">
                  <line x1={a.cx} y1={a.cy} x2={conn.x} y2={conn.y} stroke="#ffd166" strokeWidth={2} strokeDasharray="5 4" />
                </g>
              );
            })()}
          </svg>

          {/* Nodes */}
          {visibleNodes.map((n) => {
            const p = allPos[n.id];
            if (!p) return null;
            const status = n.status ?? "unknown";
            const color = STATUS_COLOR[status] ?? "#9ca3af";
            const isSel = selected?.type === "node" && selected.id === n.id;
            const act = n.kind === "agent" ? activityBySlug[n.id.replace(/^agt-/, "")] : undefined;
            const live = Boolean(act && act.messages24h > 0);
            const isCustom = /^c-/.test(n.id);
            return (
              <div
                key={n.id}
                style={{ position: "absolute", left: p.x, top: p.y, width: Q, minHeight: QH, background: "rgba(255,255,255,0.05)", border: isSel ? `2px solid ${color}` : `1px solid ${color}55`, borderRadius: 10, padding: "8px 10px", cursor: "grab", boxSizing: "border-box", userSelect: "none", touchAction: "none", boxShadow: isSel ? "0 2px 14px rgba(0,0,0,0.35)" : undefined }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button !== 0) return;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  nodeDrag.current = { id: n.id, px: e.clientX, py: e.clientY, moved: 0 };
                }}
                onPointerMove={(e) => {
                  const d = nodeDrag.current;
                  if (!d || d.id !== n.id) return;
                  const dx = e.clientX - d.px;
                  const dy = e.clientY - d.py;
                  d.moved += Math.abs(dx) + Math.abs(dy);
                  d.px = e.clientX;
                  d.py = e.clientY;
                  setPos((prev) => {
                    const cur = prev[n.id];
                    const next = cur ? { ...prev, [n.id]: { x: Math.max(0, cur.x + dx), y: Math.max(0, cur.y + dy) } } : prev;
                    latestPos.current = next;
                    return next;
                  });
                }}
                onPointerUp={(e) => {
                  const d = nodeDrag.current;
                  if (d && d.id === n.id) {
                    if (d.moved > 6 && Object.keys(latestPos.current).length) {
                      try {
                        localStorage.setItem(WS_KEY, JSON.stringify({ pos: latestPos.current, customNodes, customEdges, hiddenIds, removedEdges, transform }));
                      } catch {
                        /* ignore */
                      }
                    }
                    nodeDrag.current = null;
                  }
                }}
                onPointerCancel={() => (nodeDrag.current = null)}
                onClick={() => {
                  if (nodeDrag.current && nodeDrag.current.id === n.id && nodeDrag.current.moved > 6) return;
                  setSelected((s) => (s?.type === "node" && s.id === n.id ? null : { type: "node", id: n.id }));
                }}
                onDoubleClick={() => {
                  if (isCustom) {
                    renameOrig.current = n.label;
                    setEditingId((e) => (e === n.id ? null : n.id));
                  }
                }}
                title={n.detail || (isCustom ? "double-click to rename" : undefined)}
              >
                {/* ports */}
                <span
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (connActive.current) return;
                    const p0 = toCanvas(e.clientX, e.clientY);
                    connActive.current = { from: n.id };
                    setConn({ from: n.id, x: p0.x, y: p0.y });
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (!connActive.current) return;
                    commitConnTo(n.id);
                  }}
                  style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%", background: "#1e293b", border: `2px solid ${color}`, cursor: "crosshair" }}
                  onPointerEnter={() => (hoverNodeRef.current = n.id)}
                  onPointerLeave={() => {
                    if (hoverNodeRef.current === n.id) hoverNodeRef.current = null;
                  }}
                />
                <span
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (connActive.current) return;
                    const p0 = toCanvas(e.clientX, e.clientY);
                    connActive.current = { from: n.id };
                    setConn({ from: n.id, x: p0.x, y: p0.y });
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (!connActive.current) return;
                    commitConnTo(n.id);
                  }}
                  style={{ position: "absolute", left: Q - 6, top: "50%", transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%", background: "#1e293b", border: `2px solid ${color}`, cursor: "crosshair" }}
                  onPointerEnter={() => (hoverNodeRef.current = n.id)}
                  onPointerLeave={() => {
                    if (hoverNodeRef.current === n.id) hoverNodeRef.current = null;
                  }}
                />
                {isSel && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(n.id);
                    }}
                    title="Remove from map"
                    style={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "#f87171", fontSize: 12, lineHeight: 1, padding: 0, cursor: "pointer", zIndex: 5 }}
                  >
                    ✕
                  </button>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  {editingId === n.id && isCustom ? (
                    <input
                      autoFocus
                      defaultValue={n.label}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomNodes((c) => c.map((x) => (x.id === n.id ? { ...x, label: v } : x)));
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || n.label;
                        setCustomNodes((c) => c.map((x) => (x.id === n.id ? { ...x, label: v } : x)));
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") {
                          setCustomNodes((c) => c.map((x) => (x.id === n.id && renameOrig.current ? { ...x, label: renameOrig.current } : x)));
                          setEditingId(null);
                        }
                      }}
                      style={{ width: 96, fontSize: 12, padding: "2px 4px", borderRadius: 6, border: "1px solid var(--accent)", background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" }}
                    />
                  ) : (
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 116 }}>
                      {KIND_ICON[n.kind] ?? ""} {n.label}
                    </span>
                  )}
                  {live && (
                    <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "aiva-pulse 1.6s infinite" }}>
                      <style>{"@keyframes aiva-pulse{0%,100%{opacity:1}50%{opacity:.25}}"}</style>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted, #8b93a7)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {status.toUpperCase()}
                  {typeof n.latency === "number" ? ` · ${n.latency}ms` : ""}
                  {act && live ? ` · ${act.messages24h} msg · ${ageLabel(act.lastActiveAt)}` : n.kind === "agent" ? " · idle" : ""}
                  {isCustom ? " · custom" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Traffic strip + help */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, color: "var(--muted, #8b93a7)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: "var(--fg,#e8eaf0)" }}>Channels:</span>
          {channelCounts.map((c) => (
            <span key={c.id} title={`${c.label} — inbound messages, last 24h`} style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: c.n ? "var(--fg,#e8eaf0)" : "var(--muted,#8b93a7)" }}>
              {c.label} {c.n}
            </span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span>
          {sel ? (
            <>
              <b style={{ color: "var(--fg, #e8eaf0)" }}>{sel.label}</b> — {sel.detail || "custom box"}
              {isSelNodeCustom(selected)}
            </>
          ) : (
            <span>drag nodes · scroll to zoom · drag background to pan · drag between ports to wire · Del removes</span>
          )}
        </span>
      </div>

      {/* Command box */}
      <div style={{ ...cardStyle, padding: 14, background: "linear-gradient(180deg, rgba(13,148,136,0.08), rgba(13,148,136,0.02))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: "linear-gradient(135deg,#0d9488,#2dd4bf)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>🛠️</span>
            Tell the AI &amp; opencode what to change or fix
          </div>
          {pendingOps.length > 0 && (
            <button className="ghost" onClick={onGotoItGuy} title="Jump to IT Guy console" style={{ fontSize: 12, color: "#f59e0b", padding: "4px 10px", borderRadius: 999, border: "1px solid #f59e0b55", background: "rgba(245,158,11,0.08)" }}>
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
            style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
          <button onClick={() => sendCmd()} disabled={cmdBusy} className="ghost" style={{ padding: "10px 18px", borderRadius: 10, background: "linear-gradient(135deg,#0d9488,#2dd4bf)", color: "#fff", fontWeight: 600, fontSize: 13, opacity: cmdBusy ? 0.7 : 1, border: "none" }}>
            {cmdBusy ? "Working…" : "Send"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="ghost" onClick={() => sendCmd(s)} disabled={cmdBusy} style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)" }}>
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>Agent storage</div>
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

  if (full) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "var(--bg, #0b0e14)", padding: "18px 22px 32px", overflow: "auto", boxSizing: "border-box" }}>
        {mapBody}
      </div>
    );
  }

  return <div style={{ ...cardStyle, padding: 20, position: "relative" }}>{mapBody}</div>;
}

function isSelNodeCustom(selected: { type: "node" | "edge"; id: string } | null): string | null {
  if (selected?.type !== "node") return null;
  return /^c-/.test(selected.id) ? " · double-click to rename" : null;
}