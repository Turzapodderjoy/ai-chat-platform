"use client";

// Control Plane — IT Guy. AI acting as the sysadmin: it watches the ops
// feed, fixes safe things automatically (the monitor does), and any dangerous
// change is queued as an approval request that the admin approves here with a
// password (sudo gate). Left column chats with the IT-guy agent; right column
// shows live checks + the pending approval queue + the ops ledger.

import { useEffect, useRef, useState } from "react";

import { NavIcon } from "./nav-icons";

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

// The operator is a human, so their turn is cobalt. Everything the agent
// says back is machine output and stays in the amber machine layer.
const bubbleUser: React.CSSProperties = {
  alignSelf: "flex-end",
  background: "var(--accent)",
  color: "var(--accent-ink)",
  borderRadius: "var(--r-md) var(--r-md) var(--r-xs) var(--r-md)",
  padding: "10px 14px",
  maxWidth: "78%",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const bubbleAgent: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "var(--machine-subtle)",
  border: "1px solid var(--machine-line)",
  color: "var(--ink)",
  borderRadius: "var(--r-md) var(--r-md) var(--r-md) var(--r-xs)",
  padding: "10px 14px",
  maxWidth: "100%",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  lineHeight: 1.55,
};

const STATUS_LAMP: Record<string, string> = {
  ok: "lamp-ok",
  warning: "lamp-warn",
  down: "lamp-err",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "Ok",
  warning: "Warning",
  down: "Down",
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
      <section className="panel" style={{ display: "flex", flexDirection: "column" }}>
        <div className="panel-head">
          <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NavIcon id="itguy" style={{ color: "var(--machine-bright)" }} />
            IT guy
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="lamp lamp-machine">Sysadmin</span>
            <span className="meta">Built by opencode</span>
          </span>
        </div>
        <div className="panel-body" style={{ display: "flex", flexDirection: "column" }}>
          <p className="meta" style={{ marginTop: 0, marginBottom: 10 }}>
            AI sysadmin — monitors checks, fixes safe issues on its own, and asks for a password
            before anything dangerous.
          </p>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 320, maxHeight: 480, paddingRight: 4 }}>
            {turns.length === 0 && (
              <div className="machine-block" style={{ padding: 12 }}>
                <div className="field-label" style={{ display: "block", marginBottom: 8 }}>
                  Start with one of these
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {suggestions.map((s) => (
                    <button key={s} type="button" className="machine sm" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} style={t.role === "user" ? bubbleUser : bubbleAgent}>
                {t.text}
                {t.actions && t.actions.length > 0 && (
                  <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--machine-line)" }}>
                    <span className="lamp lamp-machine">Actions run</span>
                    {t.actions.map((a, j) => (
                      <div key={j} className="data" style={{ fontSize: 11, marginTop: 4 }}>
                        {a}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div style={bubbleAgent}>
                <span className="lamp lamp-machine">Working</span>
              </div>
            )}
          </div>

          {chatError && <div className="field-error" style={{ margin: "8px 0" }}>{chatError}</div>}

          <form
            style={{ display: "flex", gap: 8, marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              className="ops-chat-input"
              aria-label="Instruction for the IT guy"
              style={{ flex: 1 }}
              placeholder="Check the gateway, grow the plan, find the bug"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="primary" disabled={busy}>
              Send
            </button>
          </form>
        </div>
      </section>

      {/* Right — live status + approvals */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <section className="panel">
          <div className="panel-head">
            <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NavIcon id="health" style={{ color: "var(--ink-3)" }} />
              Live checks
            </span>
            {ops && <span className="data meta">{new Date(ops.now).toLocaleTimeString()}</span>}
          </div>
          <div className="panel-body">
            {opsError && (
              <div className="field-error" role="alert" style={{ marginBottom: 8 }}>
                {opsError}
              </div>
            )}
            {ops && ops.checks.length > 0 && (
              <div className="table-scroll">
                <table style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Status</th>
                      <th>Detail</th>
                      <th className="num" style={{ textAlign: "right" }}>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.checks.map((c) => (
                      <tr key={c.component}>
                        <td style={{ color: "var(--ink)" }}>{c.label}</td>
                        <td>
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span className={`lamp ${STATUS_LAMP[c.status] ?? "lamp-idle"}`}>
                              {STATUS_LABEL[c.status] ?? c.status}
                            </span>
                            {c.autoFixed && <span className="lamp lamp-machine">Auto-fix</span>}
                          </span>
                        </td>
                        <td className="meta">{c.message}</td>
                        <td className="data" style={{ textAlign: "right" }}>
                          {typeof c.latency === "number" ? `${c.latency}ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ops && ops.checks.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-title">No checks reported yet</span>
                <span className="empty-state-description">
                  Ask the IT guy to run the health sweep and the results land here.
                </span>
              </div>
            )}
            {!ops && !opsError && <span className="meta">Loading checks…</span>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NavIcon id="adminUsers" style={{ color: "var(--ink-3)" }} />
              Approval queue
            </span>
            {ops && <span className="meta"><span className="data">{ops.pending.length}</span> waiting</span>}
          </div>
          <div className="panel-body">
            <p className="meta" style={{ marginTop: 0, marginBottom: 10 }}>
              Dangerous changes need your password (sudo). Safe restarts happen automatically and
              never appear here.
            </p>
            {ops?.pending.map((p) => (
              <div key={p.id} className="panel-sunk" style={{ padding: 11, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span className="instrument-label">{p.component}</span>
                  <span className="data" style={{ fontSize: 11 }}>{p.kind}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", margin: "5px 0" }}>{p.message}</div>
                <div className="meta" style={{ fontSize: 10.5 }}>
                  request <span className="data">{p.id}</span>
                  {p.source ? <> · source <span className="data">{p.source}</span></> : null}
                  {p.ts ? <> · <span className="data">{new Date(p.ts).toLocaleTimeString()}</span></> : null}
                </div>
                {approvingId === p.id ? (
                  <div style={{ marginTop: 8 }}>
                    <span className="lamp lamp-machine">Applying change</span>
                  </div>
                ) : (
                  <>
                    <div className="field" style={{ marginTop: 8 }}>
                      <span className="field-label">Sudo gate</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          id="ops-username"
                          aria-label={`Admin username to approve request ${p.id}`}
                          placeholder="username"
                          autoComplete="username"
                          style={{ flex: 1, fontSize: 12 }}
                        />
                        <input
                          id="ops-password"
                          aria-label={`Admin password to approve request ${p.id}`}
                          type="password"
                          placeholder="password"
                          autoComplete="current-password"
                          style={{ flex: 1, fontSize: 12 }}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button type="button" className="primary sm" onClick={() => void decide(p.id, true)}>
                        Execute
                      </button>
                      <button type="button" className="ghost sm" onClick={() => void decide(p.id, false)}>
                        Deny
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {ops && ops.pending.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-title">Nothing waiting on you</span>
                <span className="empty-state-description">
                  Dangerous changes the agent proposes will queue here for your password.
                </span>
              </div>
            )}
            {!ops && !opsError && <span className="meta">Loading the queue…</span>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NavIcon id="notifications" style={{ color: "var(--ink-3)" }} />
              Recent ops
            </span>
          </div>
          <div className="panel-body">
            {ops && ops.activities.length > 0 && (
              <div className="table-scroll">
                <table style={{ minWidth: 440 }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Result</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.activities.slice(0, 12).map((a) => (
                      <tr key={`${a.id}-${a.ts}`}>
                        <td className="data" style={{ whiteSpace: "nowrap" }}>{a.ts.slice(11, 19)}</td>
                        <td className="data" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>
                          {a.type} · {a.component}
                        </td>
                        <td>
                          {a.status === "approved" ? (
                            <span className="lamp lamp-ok">Approved</span>
                          ) : a.status === "canceled" ? (
                            <span className="lamp lamp-err">Canceled</span>
                          ) : (
                            <span className="meta">Ran</span>
                          )}
                        </td>
                        <td className="meta">{a.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ops && ops.activities.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-title">Nothing logged yet</span>
                <span className="empty-state-description">
                  Every safe fix and approved change is written to this ledger.
                </span>
              </div>
            )}
            {!ops && !opsError && <span className="meta">Loading the ledger…</span>}
          </div>
        </section>
      </div>
    </div>
  );
}