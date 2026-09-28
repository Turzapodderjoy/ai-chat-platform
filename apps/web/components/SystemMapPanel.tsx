"use client";

// Control Plane — System Map. Draws the whole platform as an n8n-style box
// graph (channels -> app -> gateway -> agents/provider) with live probes
// re-fetched every few seconds, plus a Storage band underneath (database
// tables, agent profiles, logs/secrets) and OS vitals. Clicking a node shows
// its detail and the related dashboard tab.

import { useEffect, useMemo, useState } from "react";

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
interface Snapshot {
  generatedAt: string;
  nodes: MapNode[];
  storage: StorageInfo;
  os: { freeMem: number; totalMem: number; diskUsedPercent: number | null } | null;
}

const Q = 170;
const QH = 48;
const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  degraded: "#f59e0b",
  warning: "#f59e0b",
  down: "#ef4444",
  unknown: "#9ca3af",
};

// Fixed layout. Agent rows are appended dynamically below the fixed nodes.
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
  { from: "next-api", to: "postgres", label: "conversations/orders" },
  { from: "next-api", to: "hermes-gateway", label: "chat" },
  { from: "hermes-gateway", to: "prv-ai", label: "models" },
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

export function SystemMapPanel() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

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
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const layout = useMemo(() => {
    if (!snap) return null;
    const pos: Record<string, { x: number; y: number }> = { ...FIXED_POS };
    let i = 0;
    for (const n of snap.nodes) {
      if (n.id.startsWith("agt-") && n.id !== "agt-platform" && n.id !== "agt-") {
        pos[n.id] = { x: 660, y: 126 + i * 86 };
        i++;
      }
    }
    return pos;
  }, [snap]);

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

  return (
    <div style={{ ...cardStyle, padding: 20, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>
          <span style={{ marginRight: 8 }}>🗺️</span>System Map
        </h2>
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13, color: "var(--muted, #8b93a7)" }}>
          {snap.os && (
            <>
              <span title="Memory">RAM {snap.os.diskUsedPercent === null ? "—" : `${Math.round((snap.os.totalMem - snap.os.freeMem) / 1073741824)}/${Math.round(snap.os.totalMem / 1073741824)}GB`}</span>
              {snap.os.diskUsedPercent !== null && (
                <span style={snap.os.diskUsedPercent > 85 ? { color: "#f59e0b" } : undefined} title="Disk">
                  DISK {snap.os.diskUsedPercent}%
                </span>
              )}
            </>
          )}
          <span>probes every 5s</span>
          <span>{new Date(snap.generatedAt).toLocaleTimeString()}</span>
        </div>
      </div>

      <div style={{ overflowX: "auto", position: "relative", minHeight: 540 }}>
        <svg width={1020} height={540} style={{ display: "block" }}>
          {EDGES.map((e) => {
            const a = nodeCenter(layout[e.from]);
            const b = nodeCenter(layout[e.to]);
            if (!a || !b) return null;
            const color = STATUS_COLOR[statusOf[e.from] ?? "unknown"] ?? "#9ca3af";
            return (
              <g key={`${e.from}-${e.to}`}>
                <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke={color} strokeWidth={1.6} strokeOpacity={0.55} />
                {e.label && (
                  <text x={(a.cx + b.cx) / 2} y={(a.cy + b.cy) / 2 - 6} fill="#8b93a7" fontSize={11} textAnchor="middle" style={{ pointerEvents: "none" }}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {Object.keys(layout).flatMap((id) => {
            const n = nodeById[id];
            const a = nodeCenter(layout[id]);
            if (!n || !a) return [];
            const color = STATUS_COLOR[n.status] ?? "#9ca3af";
            return (
              <g key={`edge-${id}`}>
                {n.status !== "ok" && n.status !== "unknown" && (
                  <line x1={a.cx} y1={a.cy} x2={a.cx + 60} y2={a.cy} stroke={color} strokeWidth={1.6} strokeOpacity={0.8} strokeDasharray="4 4" />
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes are HTML boxes so the status text can wrap and hover works. */}
        <div style={{ position: "absolute", inset: 0 }}>
          {Object.entries(layout).flatMap(([id, pos]) => {
            const n = nodeById[id];
            if (!n) return [];
            const color = STATUS_COLOR[n.status] ?? "#9ca3af";
            const isSel = selected === id;
            return (
              <div
                key={id}
                onClick={() => setSelected(isSel ? null : id)}
                title={n.detail}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: Q,
                  minHeight: QH,
                  background: "rgba(255,255,255,0.05)",
                  border: isSel ? `1.5px solid ${color}` : `1px solid ${color}55`,
                  borderRadius: 10,
                  padding: "8px 10px",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 118 }}>
                    {(KIND_ICON[n.kind] ?? "")} {n.label}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted, #8b93a7)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {n.status.toUpperCase()}
                  {typeof n.latency === "number" ? ` · ${n.latency}ms` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Node detail bar */}
      <div style={{ minHeight: 22, marginTop: 6, fontSize: 12.5, color: "var(--muted, #8b93a7)" }}>
        {sel ? (
          <span>
            <b style={{ color: "var(--fg, #e8eaf0)" }}>{sel.label}</b> — {sel.detail}
          </span>
        ) : (
          <span>Click a box to inspect it. {agentNodes.length} agent(s) · {snap.nodes.filter((n) => n.status === "ok").length}/{snap.nodes.length} nodes healthy.</span>
        )}
      </div>

      {/* Storage band */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>Logs & secrets</div>
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
}