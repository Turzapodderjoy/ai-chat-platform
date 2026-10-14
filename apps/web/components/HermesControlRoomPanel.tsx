"use client";

import { useEffect, useRef, useState } from "react";

import { NavIcon } from "./nav-icons";

interface ControlAgent {
  slug: string;
  provisioned: boolean;
  model: string | null;
  provider: string | null;
  businesses: Array<{ id: string; name: string; slug: string; hermesEnabled: boolean }>;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  actions?: string[];
}

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

export function HermesControlRoomPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [agents, setAgents] = useState<ControlAgent[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/hermes-control")
      .then((r) => r.json())
      .then((d: { agents?: ControlAgent[] }) => {
        if (alive) setAgents(d.agents ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setError("");
    setTurns((t) => [...t, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/hermes-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { answer?: string; actions?: string[]; error?: string };
      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? "Something went wrong talking to Hermes.");
      }
      setTurns((t) => [...t, { role: "assistant", text: data.answer ?? "", actions: data.actions ?? [] }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavIcon id="hermesControl" style={{ color: "var(--machine-bright)" }} />
          Hermes control room
        </span>
        <span className="lamp lamp-machine">Machine layer</span>
      </div>
      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 10 }}>
          Talk to Hermes in plain words — change any client agent&apos;s AI or model, or make it
          pull up real client chats and fix its own mistakes.
        </p>

        <div className="panel-sunk" style={{ padding: 11, marginBottom: 12 }}>
          <div className="field-label" style={{ marginBottom: 7 }}>
            Agents you control
          </div>
          {agents === null && <span className="meta">Loading agents…</span>}
          {agents !== null && agents.length === 0 && (
            <span className="meta">No Hermes agents are provisioned yet.</span>
          )}
          {agents && agents.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {agents.map((a) => (
                <div
                  key={a.slug}
                  style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  <span className={a.provisioned ? "lamp lamp-ok" : "lamp lamp-warn"}>
                    {a.provisioned ? "Provisioned" : "Not provisioned"}
                  </span>
                  <span className="data" style={{ fontSize: 12 }}>{a.slug}</span>
                  <span className="meta">
                    {a.businesses[0] ? a.businesses[0].name : "No business attached"}
                  </span>
                  <span className="data meta" style={{ fontSize: 11 }}>
                    {a.model ? `${a.provider ? `${a.provider} / ` : ""}${a.model}` : "gateway default"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 320,
            maxHeight: 420,
            overflowY: "auto",
            padding: 4,
          }}
        >
          {turns.length === 0 ? (
            <div className="machine-block" style={{ margin: "auto", maxWidth: "52ch" }}>
              <span className="lamp lamp-machine">Try asking</span>
              <div style={{ marginTop: 7, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                “Switch the Phone Repair agent to Groq&apos;s llama-3.3-70b.” or “What did you tell
                customers yesterday, was anything wrong?”
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={t.role === "user" ? bubbleUser : bubbleAgent}>{t.text}</div>
                {t.actions && t.actions.length > 0 && (
                  <div style={{ alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="lamp lamp-machine">Actions run</span>
                    {t.actions.map((a, j) => (
                      <div key={j} className="data" style={{ fontSize: 11.5 }}>
                        {a}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {busy && <span className="lamp lamp-machine">Hermes is working</span>}
        </div>

        {error && <div className="field-error" style={{ marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            name="aiva-search-hermes-control-input"
            aria-label="Instruction for Hermes"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) void send();
            }}
            placeholder="Tell Hermes what to change or review"
            style={{ flex: 1 }}
          />
          <button type="button" className="primary" onClick={() => void send()} disabled={busy || !input.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}