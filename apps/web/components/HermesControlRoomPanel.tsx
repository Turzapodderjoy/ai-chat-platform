"use client";

import { useEffect, useRef, useState } from "react";

import {
  cardStyle,
  inputStyle,
  primaryButtonStyle,
  subtleTextStyle,
} from "./dashboard-styles";

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

  const contextLine = agents && agents.length
    ? agents.map((a) => `${a.slug}${a.businesses[0] ? ` (${a.businesses[0].name})` : ""}`).join(", ")
    : "loading…";

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Hermes Control Room</div>
        <div style={{ ...subtleTextStyle, fontSize: 11.5 }}>
          Talk to Hermes in plain words — change any client agent&apos;s AI/model, or make it pull up real client chats and fix its own mistakes.
        </div>
      </div>
      <div style={{ ...subtleTextStyle, fontSize: 11.5, marginTop: 6 }}>
        Agents you control: {contextLine}
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
          marginTop: 14,
          padding: 4,
        }}
      >
        {turns.length === 0 ? (
          <div style={{ ...subtleTextStyle, fontSize: 12.5, margin: "auto" }}>
            Example: “Switch the Phone Repair agent to Groq’s llama-3.3-70b.” or “What did you tell customers yesterday, was anything wrong?”
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={t.role === "user" ? bubbleUser : bubbleAgent}>{t.text}</div>
              {t.actions && t.actions.length > 0 && (
                <div style={{ alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 4 }}>
                  {t.actions.map((a, j) => (
                    <div
                      key={j}
                      style={{
                        ...subtleTextStyle,
                        fontSize: 11.5,
                        background: "rgba(42,109,244,0.08)",
                        border: "1px solid rgba(42,109,244,0.18)",
                        borderRadius: 8,
                        padding: "4px 10px",
                      }}
                    >
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {busy && <div style={{ ...subtleTextStyle, fontSize: 12 }}>Hermes is thinking…</div>}
      </div>

      {error && <div style={{ ...subtleTextStyle, color: "var(--danger, #d64545)", fontSize: 12, marginTop: 8 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          name="aiva-search-hermes-control-input"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) void send();
          }}
          placeholder="Tell Hermes what to change or review…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button style={primaryButtonStyle} onClick={() => void send()} disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}