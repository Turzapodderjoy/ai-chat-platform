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

import { dataStrongStyle as dataStrong } from "./dashboard-styles";
import { NavIcon } from "./nav-icons";

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
  ok: "var(--success)",
  degraded: "var(--warning)",
  warning: "var(--warning)",
  down: "var(--danger)",
  unknown: "var(--ink-4)",
};

// The halo behind each node's status lamp — same tone, one step softer.
const STATUS_SUBTLE: Record<string, string> = {
  ok: "var(--success-subtle)",
  degraded: "var(--warning-subtle)",
  warning: "var(--warning-subtle)",
  down: "var(--danger-subtle)",
  unknown: "var(--panel-sunk)",
};

function statusColor(status: string | undefined): string {
  return STATUS_COLOR[status ?? "unknown"] ?? "var(--ink-4)";
}

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
  channel: "channels",
  app: "overview",
  agent: "brain",
  provider: "ai",
  net: "systemMap",
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
      <section className="panel">
        <div className="panel-body">
          {error ? (
            <span className="lamp lamp-err">System map unavailable: {error}</span>
          ) : (
            <span className="lamp lamp-idle">Fetching system map</span>
          )}
        </div>
      </section>
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
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <NavIcon id="systemMap" style={{ color: "var(--machine)" }} />
          System map
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span className="meta" title="Messages, last hour">
            msg/1h <span className="data" style={dataStrong}>{snap.activity.messagesLastHour}</span>
          </span>
          <span className="meta" title="Conversations started today">
            conv today <span className="data" style={dataStrong}>{snap.activity.conversationsToday}</span>
          </span>
          <span className="meta" title="Total storage now">
            storage <span className="data" style={dataStrong}>{fmtBytes(snap.storage.dbBytes)}</span>
          </span>
          {snap.os && (
            <>
              <span className="meta" title="Memory in use">
                RAM{" "}
                <span className="data" style={dataStrong}>
                  {snap.os.diskUsedPercent === null
                    ? "—"
                    : `${Math.round((snap.os.totalMem - snap.os.freeMem) / 1073741824)}/${Math.round(snap.os.totalMem / 1073741824)}GB`}
                </span>
              </span>
              {snap.os.diskUsedPercent !== null &&
                (snap.os.diskUsedPercent > 85 ? (
                  <span className="lamp lamp-warn">Disk {snap.os.diskUsedPercent}%</span>
                ) : (
                  <span className="meta" title="Disk used">
                    disk <span className="data" style={dataStrong}>{snap.os.diskUsedPercent}%</span>
                  </span>
                ))}
            </>
          )}
          <span className="meta">probes every 5s</span>
          <span className="data meta" title="Snapshot generated at">
            {new Date(snap.generatedAt).toLocaleTimeString()}
          </span>
          <button
            className="ghost sm"
            onClick={() => setFull((f) => !f)}
            title={full ? "Exit fullscreen (Esc)" : "Fullscreen"}
            aria-label={full ? "Exit fullscreen" : "Fullscreen"}
            style={{ width: 30, height: 30, padding: 0 }}
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
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div style={{ position: "relative" }}>
          <button className="sm" onClick={() => setAddOpen((o) => !o)}>
            Add node
          </button>
          {addOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 30,
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                boxShadow: "var(--shadow-pop)",
                padding: 6,
                minWidth: 200,
              }}
            >
              {ADD_TYPES.map((t) => (
                <button
                  key={t.kind}
                  className="ghost sm"
                  onClick={() => addNode(t.kind)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left" }}
                >
                  <NavIcon id={KIND_ICON[t.kind] ?? "systemMap"} />
                  {t.hint}
                </button>
              ))}
              <div style={{ borderTop: "1px solid var(--line-soft)", margin: "4px 0" }} />
              <div className="meta" style={{ padding: "4px 10px" }}>
                Drag between port dots to wire nodes.
              </div>
            </div>
          )}
        </div>
        <span className="meta">
          scale <span className="data">{(transform.scale * 100).toFixed(0)}%</span>
        </span>
        <button
          className="ghost sm"
          onClick={() => zoomBy(1.15)}
          title="Zoom in"
          aria-label="Zoom in"
          style={{ width: 30, height: 30, padding: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button
          className="ghost sm"
          onClick={() => zoomBy(1 / 1.15)}
          title="Zoom out"
          aria-label="Zoom out"
          style={{ width: 30, height: 30, padding: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <button className="ghost sm" onClick={resetWorkspace} title="Reset layout">
          Reset layout
        </button>
        <span style={{ flex: 1 }} />
        <span className="meta">
          <span className="data">{visibleNodes.length}</span> nodes
          {" / "}
          <span className="data">{edges.length}</span> connections
          {hiddenIds.length ? (
            <>
              {" / "}
              <span className="data">{hiddenIds.length}</span> hidden
            </>
          ) : null}
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
          border: "1px solid var(--line)",
          borderRadius: "var(--r-md)",
          background: "var(--panel-sunk)",
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
              const color = statusColor(statusOf[e.from]);
              const isSel = selected?.type === "edge" && selected.id === key;
              const label = edgeLabel(e, snap.activity);
              return (
                <g key={key}>
                  <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} onClick={() => setSelected({ type: "edge", id: key })} />
                  <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} strokeWidth={isSel ? 2.6 : 1.6} strokeOpacity={isSel ? 1 : 0.5} pointerEvents="none" style={{ stroke: color }} />
                  {label && (
                    <text
                      x={(a.cx + b.cx) / 2}
                      y={(a.cy + b.cy) / 2 - 6}
                      fontSize={11}
                      textAnchor="middle"
                      pointerEvents="none"
                      style={{ fill: isSel ? "var(--ink)" : "var(--ink-3)", fontFamily: "var(--font-mono)" }}
                    >
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
                  <line x1={a.cx} y1={a.cy} x2={conn.x} y2={conn.y} strokeWidth={2} strokeDasharray="5 4" style={{ stroke: "var(--machine-bright)" }} />
                </g>
              );
            })()}
          </svg>

          {/* Nodes */}
          {visibleNodes.map((n) => {
            const p = allPos[n.id];
            if (!p) return null;
            const status = n.status ?? "unknown";
            const color = statusColor(status);
            const halo = STATUS_SUBTLE[status] ?? "var(--panel-sunk)";
            const isSel = selected?.type === "node" && selected.id === n.id;
            const act = n.kind === "agent" ? activityBySlug[n.id.replace(/^agt-/, "")] : undefined;
            const live = Boolean(act && act.messages24h > 0);
            const isCustom = /^c-/.test(n.id);
            return (
              <div
                key={n.id}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: Q,
                  minHeight: QH,
                  background: "var(--panel)",
                  border: `1px solid ${isSel ? "var(--accent)" : "var(--line-strong)"}`,
                  borderRadius: "var(--r-sm)",
                  padding: "8px 10px",
                  cursor: "grab",
                  boxSizing: "border-box",
                  userSelect: "none",
                  touchAction: "none",
                  boxShadow: isSel ? "inset 2px 0 0 var(--accent)" : undefined,
                }}

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
                  style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%", background: "var(--panel)", border: `2px solid ${color}`, cursor: "crosshair" }}
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
                  style={{ position: "absolute", left: Q - 6, top: "50%", transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%", background: "var(--panel)", border: `2px solid ${color}`, cursor: "crosshair" }}
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
                    aria-label={`Remove ${n.label} from map`}
                    style={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--danger)", padding: 0, zIndex: 5, boxShadow: "none" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color,
                      boxShadow: `0 0 0 3px ${halo}`,
                      flexShrink: 0,
                    }}
                  />
                  {editingId === n.id && isCustom ? (
                    <input
                      autoFocus
                      aria-label={`Rename ${n.label}`}
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
                      style={{ width: 96, fontSize: 12, padding: "2px 4px", boxSizing: "border-box" }}
                    />
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 116 }}>
                      <NavIcon id={KIND_ICON[n.kind] ?? "systemMap"} style={{ width: 13, height: 13, color: "var(--ink-3)", flexShrink: 0 }} />
                      {n.label}
                    </span>
                  )}
                  {live && (
                    <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: "var(--success)", animation: "aiva-pulse 1.6s infinite" }}>
                      <style>{"@keyframes aiva-pulse{0%,100%{opacity:1}50%{opacity:.25}}"}</style>
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 3,
                    fontSize: 10.5,
                    color: "var(--ink-3)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                >
                  <span>{status}</span>
                  {typeof n.latency === "number" && <span className="data">{n.latency}ms</span>}
                  {act && live ? (
                    <>
                      <span className="data">{act.messages24h} msg</span>
                      <span className="data">{ageLabel(act.lastActiveAt)}</span>
                    </>
                  ) : n.kind === "agent" ? (
                    <span className="lamp lamp-idle">idle</span>
                  ) : null}
                  {isCustom && <span className="lamp lamp-info">custom</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Traffic strip + help */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="table-scroll" style={{ minWidth: 220, flex: "0 0 auto" }}>
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num" style={{ textAlign: "right" }}>msgs/24h</th>
              </tr>
            </thead>
            <tbody>
              {channelCounts.map((c) => (
                <tr key={c.id} title={`${c.label} — inbound messages, last 24h`}>
                  <td style={{ color: "var(--ink)" }}>{c.label}</td>
                  <td className="num" style={{ textAlign: "right" }}>{c.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span style={{ flex: 1, minWidth: 200 }}>
          {sel ? (
            <>
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>{sel.label}</span>
              {" — "}
              {sel.detail || "custom box"}
              {isSelNodeCustom(selected)}
            </>
          ) : (
            <span className="meta">
              Drag nodes to move them. Scroll to zoom, drag the background to pan, drag between
              port dots to wire, Delete removes the selection.
            </span>
          )}
        </span>
      </div>

      {/* Command box */}
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NavIcon id="itguy" style={{ color: "var(--machine)" }} />
            Tell the AI what to change or fix
          </span>
          {pendingOps.length > 0 && (
            <button className="machine sm" onClick={onGotoItGuy} title="Jump to IT Guy console">
              {pendingOps.length} change{pendingOps.length > 1 ? "s" : ""} waiting for approval
            </button>
          )}
        </div>
        <div className="panel-body" style={{ background: "var(--machine-subtle)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label
              htmlFor="system-map-cmd"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                overflow: "hidden",
                clipPath: "inset(50%)",
                whiteSpace: "nowrap",
              }}
            >
              Instruction for the AI
            </label>
            <input
              id="system-map-cmd"
              aria-label="Instruction for the AI"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCmd()}
              placeholder="Fix anything that is down right now"
              disabled={cmdBusy}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button onClick={() => sendCmd()} disabled={cmdBusy} className="machine">
              {cmdBusy ? "Working…" : "Send to AI"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="ghost sm" onClick={() => sendCmd(s)} disabled={cmdBusy}>
                {s}
              </button>
            ))}
          </div>
          {cmdError && <div className="field-error" style={{ marginTop: 8 }}>{cmdError}</div>}
          {cmdReply && !cmdError && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                {cmdReply.answer}
              </div>
              {cmdReply.actions && cmdReply.actions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {cmdReply.actions.map((a, i) => (
                    <div key={i} className="data" style={{ fontSize: 12, color: "var(--machine)" }}>
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Storage band */}
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NavIcon id="storage" style={{ color: "var(--ink-3)" }} />
            Storage
          </span>
          <span className="meta">How the platform stores data</span>
        </div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div className="panel-sunk" style={{ padding: 12 }}>
              <div className="instrument-label">PostgreSQL database</div>
              <div className="meta" style={{ marginTop: 2 }}>
                <span className="data">{fmtBytes(snap.storage.dbBytes)}</span> total
                {" / "}
                <span className="data">{totalRows.toLocaleString()}</span> rows
              </div>
              {snap.storage.tables.length > 0 ? (
                <div className="table-scroll" style={{ marginTop: 10 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Table</th>
                        <th className="num" style={{ textAlign: "right" }}>Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.storage.tables.map((t) => (
                        <tr key={t.name}>
                          <td className="data" style={{ color: "var(--ink)" }}>{t.name}</td>
                          <td className="num" style={{ textAlign: "right" }}>{fmtBytes(t.bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <span className="lamp lamp-err">Postgres unreachable</span>
                </div>
              )}
            </div>

            <div className="panel-sunk" style={{ padding: 12 }}>
              <div className="instrument-label">Agent storage</div>
              <div className="meta" style={{ marginTop: 2 }}>
                One folder per agent under <code>data/hermes/profiles/</code>
              </div>
              <div style={{ marginTop: 10 }}>
                {snap.storage.profiles.map((p) => (
                  <div
                    key={p.slug}
                    title={`SOUL.md ${fmtBytes(p.soulBytes)}, state.db ${fmtBytes(p.stateDbBytes)}`}
                    style={{ marginBottom: 6 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                      <span className="data" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                        {p.slug}
                      </span>
                      <span className="data">{fmtBytes(p.bytes)}</span>
                    </div>
                    <div style={{ height: 5, background: "var(--line-soft)", borderRadius: "var(--r-xs)", marginTop: 2, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, (p.bytes / Math.max(1, Math.max(...snap.storage.profiles.map((x) => x.bytes)))) * 100)}%`,
                          background: "var(--machine)",
                          borderRadius: "var(--r-xs)",
                        }}
                      />
                    </div>
                  </div>
                ))}
                {snap.storage.profiles.length === 0 && (
                  <div className="empty-state" style={{ padding: 16 }}>
                    <span className="empty-state-title">No agent profiles on disk</span>
                    <span className="empty-state-description">
                      Create an agent to give it a persona folder.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="panel-sunk" style={{ padding: 12 }}>
              <div className="instrument-label">Logs and secrets</div>
              <div className="meta" style={{ marginTop: 2 }}>
                <code>data/hermes/logs</code>, <code>data/ops</code> ledger, profile <code>.env</code> keys
              </div>
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Store</th>
                      <th className="num" style={{ textAlign: "right" }}>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(snap.storage.logsBytes).map(([name, bytes]) => (
                      <tr key={name}>
                        <td className="data" style={{ color: "var(--ink)" }}>{name}</td>
                        <td className="num" style={{ textAlign: "right" }}>{fmtBytes(bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10 }}>
                {snap.storage.secretPresent ? (
                  <span className="lamp lamp-ok">API keys stored per agent</span>
                ) : (
                  <span className="lamp lamp-err">No API key file found</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  if (full) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "var(--canvas)", padding: "18px 22px 32px", overflow: "auto", boxSizing: "border-box" }}>
        {mapBody}
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-body">{mapBody}</div>
    </section>
  );
}

function isSelNodeCustom(selected: { type: "node" | "edge"; id: string } | null): string | null {
  if (selected?.type !== "node") return null;
  return /^c-/.test(selected.id) ? ". Double-click to rename." : null;
}
