"use client";

// Control Plane — IT Guy. AI acting as the sysadmin: it watches the ops
// feed, fixes safe things automatically (the monitor does), and any dangerous
// change is queued as an approval request that the admin approves here with a
// password (sudo gate). Left column chats with the IT-guy agent; right column
// shows live checks + the pending approval queue + the ops ledger.

import { useEffect, useRef, useState } from "react";

import { cardStyle, inputStyle, primaryButtonStyle } from "./dashboard-styles";

interface CheckResult {
  component: string;
  label: string;
  status: "ok" | "warning" | "down";
  latency?: number;
  message: string;
  autoFixed?: boolean;
}
interface OpsEvent {
  id: string;
  ts: string;
  type: string;
  component: string;
  message: string;
  detail?: string;
  kind?: string;
  params?: Record<string, unknown>;
  status?: string;
  approved?: boolean;
  source?: string;
}
interface OpsSnapshot {
  now: string;
  checks: CheckResult[];
  pending: OpsEvent[];
  activities: OpsEvent[];
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  actions?: string[];
}

const bubbleUser: React.CSSProperties = {
  alignSelf: "flex-end",
  background: "var(--accent, #2a6df4)",
  color: "#fff",
  borderRadius: "14px 14px 4px 14px",
  padding: "10px 14px",
  maxWidth: "78%",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const bubbleAgent: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "rgba(127,127,127,0.12)",
  borderRadius: "14px 14px 14px 4px",
  padding: "10px 14px",
  maxWidth: "100%",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  lineHeight: 1.55,
};

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  warning: "#f59e0b",
  down: "#ef4444",
};

export function ItGuyPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [ops, setOps] = useState<OpsSnapshot | null>(null);
  const [opsError, setOpsError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      fetch("/api/admin/ops")
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as OpsSnapshot;
        })
        .then((s) => {
          if (!alive) return;
          setOps(s);
          setOpsError("");
        })
        .catch((e) => {
          if (alive) setOpsError(e instanceof Error ? e.message : String(e));
        });
    };
    poll();
    const id = setInterval(poll, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function send(override?: string) {
    const message = (override ?? input).trim();
    if (!message || busy) return;
    setBusy(true);
    setChatError("");
    setTurns((t) => [...t, { role: "user", text: message }]);
    setInput("");
    try {
      const res = await fetch("/api/admin/hermes-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, mode: "itguy" }),
        signal: AbortSignal.timeout(200_000),
      });
      const data = (await res.json()) as { answer?: string; actions?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTurns((t) => [...t, { role: "assistant", text: data.answer ?? "", actions: data.actions ?? [] }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, ok: boolean) {
    const username = (document.getElementById("ops-username") as HTMLInputElement | null)?.value ?? "";
    const password = (document.getElementById("ops-password") as HTMLInputElement | null)?.value ?? "";
    if (!username || !password) {
      setOpsError("Username and password are required to approve a dangerous change.");
      return;
    }
    setApprovingId(id);
    setOpsError("");
    try {
      const res = await fetch("/api/admin/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id, ok, username, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const poll = await fetch("/api/admin/ops");
      const s = (await poll.json()) as OpsSnapshot;
      setOps(s);
    } catch (e) {
      setOpsError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovingId(null);
    }
  }

  const suggestions = [
    "What's the current system status?",
    "Fix anything that's down",
    "What happened in ops recently?",
    "How is the storage holding up?",
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
      {/* Left — the IT guy chat */}
      <div style={{ ...cardStyle, padding: 16, display: "flex", flexDirection: "column", maxHeight: 680 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>
          <span style={{ marginRight: 8 }}>🧑‍🔧</span>IT Guy <span style={{ ...primaryButtonStyle, padding: "2px 8px", fontSize: 11, verticalAlign: "middle" }}>made by opencode</span>
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--muted,#8b93a7)" }}>AI as your sysadmin — monitors, fixes safe issues, asks permission for dangerous ones.</span>
        </h2>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 320, maxHeight: 480, paddingRight: 4 }}>
          {turns.length === 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    ...primaryButtonStyle,
                    padding: "5px 10px",
                    fontSize: 12,
                    background: "rgba(127,127,127,0.15)",
                    color: "var(--fg,#e8eaf0)",
                    border: "1px solid rgba(127,127,127,0.3)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} style={t.role === "user" ? bubbleUser : bubbleAgent}>
              {t.text}
              {t.actions && t.actions.length > 0 && (
                <div style={{ fontSize: 11.5, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(127,127,127,0.25)", color: "var(--muted,#9aa2b5)" }}>
                  {t.actions.map((a, j) => (
                    <div key={j}>→ {a}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <div style={bubbleAgent}>working…</div>}
        </div>

        {chatError && <div style={{ fontSize: 12.5, color: "#ef4444", margin: "6px 0" }}>{chatError}</div>}

        <form
          style={{ display: "flex", gap: 8, marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className="ops-chat-input"
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Tell the IT guy: check the gateway, grow the plan, find the bug…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, padding: "8px 14px" }}>
            Send
          </button>
        </form>
      </div>

      {/* Right — live status + approvals */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>🩺 Live checks</h3>
            <span style={{ fontSize: 11.5, color: "var(--muted,#8b93a7)" }}>{ops ? new Date(ops.now).toLocaleTimeString() : ""}</span>
          </div>
          {opsError && <div style={{ fontSize: 12.5, color: "#ef4444", marginBottom: 6 }}>{opsError}</div>}
          {ops?.checks.map((c) => (
            <div key={c.component} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(127,127,127,0.12)", fontSize: 12.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[c.status] ?? "#9ca3af", flexShrink: 0 }} />
              <b style={{ minWidth: 118 }}>{c.label}</b>
              <span style={{ color: "var(--muted,#8b93a7)", flex: 1 }}>{c.message}</span>
              {c.autoFixed && <span style={{ fontSize: 11, color: "#f59e0b" }}>auto-fix sent</span>}
            </div>
          ))}
          {ops && ops.checks.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted,#8b93a7)" }}>no checks yet</div>}
        </div>

        <div style={{ ...cardStyle, padding: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>⏳ Approval queue</h3>
          <div style={{ fontSize: 11, color: "var(--muted,#8b93a7)", marginBottom: 8 }}>
            Dangerous changes need your password (sudo). Safe restarts happen automatically and never appear here.
          </div>
          {ops?.pending.map((p) => (
            <div key={p.id} style={{ padding: "10px", border: "1px solid rgba(127,127,127,0.2)", borderRadius: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5 }}>
                <b>{p.component}</b> <span style={{ color: "var(--muted,#8b93a7)" }}>{p.kind}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted,#9aa2b5)", margin: "4px 0" }}>{p.message}</div>
              <div style={{ fontSize: 11, color: "var(--muted,#8b93a7)" }}>request {p.id} · {p.source} · {p.ts ? new Date(p.ts).toLocaleTimeString() : ""}</div>
              {approvingId === p.id ? (
                <div style={{ fontSize: 12, color: "var(--muted,#8b93a7)", marginTop: 6 }}>working…</div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input id="ops-username" placeholder="username" autoComplete="username" style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 12, padding: "5px 8px" }} />
                  <input id="ops-password" type="password" placeholder="password" autoComplete="current-password" style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 12, padding: "5px 8px" }} />
                </div>
              )}
              {approvingId !== p.id && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button onClick={() => void decide(p.id, true)} style={{ ...primaryButtonStyle, padding: "5px 12px", fontSize: 12, background: "#22c55e", color: "#08120b" }}>
                    Execute
                  </button>
                  <button onClick={() => void decide(p.id, false)} style={{ ...primaryButtonStyle, padding: "5px 12px", fontSize: 12, background: "rgba(127,127,127,0.25)", color: "var(--fg,#e8eaf0)" }}>
                    Deny
                  </button>
                </div>
              )}
            </div>
          ))}
          {ops && ops.pending.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted,#8b93a7)" }}>nothing waiting</div>}
        </div>

        <div style={{ ...cardStyle, padding: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>📋 Recent ops</h3>
          {ops?.activities.slice(0, 12).map((a) => (
            <div key={`${a.id}-${a.ts}`} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(127,127,127,0.1)", color: "var(--muted,#9aa2b5)" }}>
              <span style={{ color: "var(--fg,#e8eaf0)" }}>[{a.ts.slice(11, 19)}]</span> {a.type} · {a.component}: {a.message}
              {a.status === "approved" || a.status === "canceled" ? <b style={{ color: a.approved ? "#22c55e" : "#ef4444" }}> · {a.status}</b> : null}
            </div>
          ))}
          {ops && ops.activities.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted,#8b93a7)" }}>nothing logged yet</div>}
        </div>
      </div>
    </div>
  );
}