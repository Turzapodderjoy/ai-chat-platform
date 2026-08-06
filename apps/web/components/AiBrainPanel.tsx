"use client";

import { Fragment, useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";

interface AiConfig {
  id: string;
  businessId: string;
  systemPrompt: string;
  handoffFloor: number;
  historyTurns: number;
  temperature: number;
  languageMode: string;
  changeType: string;
  note: string | null;
  createdAt: string;
}

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto — match whatever language the customer uses" },
  { value: "english", label: "English only" },
  { value: "bangla", label: "Bangla only (Bengali script)" },
  { value: "banglish", label: "Banglish only (Bangla in Latin letters)" },
];

interface AiBrainPanelProps {
  /** Omit for the mother dashboard's platform-wide default. A client
   * with no saved config of its own inherits that default until it
   * saves its own change here, at which point it gets its own history
   * independent of the platform and every other client. */
  businessId?: string;
}

/** The system prompt and the knobs that control how eagerly the AI hands
 * off vs. tries to answer, and how creative it is — editable here instead
 * of hardcoded, with every change kept as a permanent version. */
export function AiBrainPanel({ businessId }: AiBrainPanelProps) {
  const [current, setCurrent] = useState<AiConfig | null>(null);
  const [history, setHistory] = useState<AiConfig[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [promptDraft, setPromptDraft] = useState("");
  const [floorDraft, setFloorDraft] = useState(0.2);
  const [turnsDraft, setTurnsDraft] = useState(10);
  const [temperatureDraft, setTemperatureDraft] = useState(0.1);
  const [updateNote, setUpdateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [addText, setAddText] = useState("");
  const [addNote, setAddNote] = useState("");
  const [adding, setAdding] = useState(false);

  const [languageDraft, setLanguageDraft] = useState("auto");
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageMessage, setLanguageMessage] = useState("");

  const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";

  function refresh() {
    fetch(`/api/admin/ai-config${qs}`)
      .then((r) => r.json())
      .then((data: AiConfig) => {
        setCurrent(data);
        setPromptDraft(data.systemPrompt);
        setFloorDraft(data.handoffFloor);
        setTurnsDraft(data.historyTurns);
        setTemperatureDraft(data.temperature);
        setLanguageDraft(data.languageMode);
      });

    fetch(`/api/admin/ai-config/history${qs}`)
      .then((r) => r.json())
      .then((data) => setHistory(data.history));
  }

  useEffect(refresh, [businessId]);

  async function saveLanguage() {
    setSavingLanguage(true);
    setLanguageMessage("");

    try {
      const res = await fetch("/api/admin/ai-config/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageMode: languageDraft, businessId }),
      });
      const result = await res.json();

      setLanguageMessage(
        res.ok
          ? "Saved — takes effect on the very next chat message."
          : `Error: ${result.error}`
      );

      if (res.ok) {
        refresh();
      }
    } finally {
      setSavingLanguage(false);
    }
  }

  async function saveUpdate() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: promptDraft,
          handoffFloor: floorDraft,
          historyTurns: turnsDraft,
          temperature: temperatureDraft,
          note: updateNote,
          businessId,
        }),
      });
      const result = await res.json();

      setMessage(
        res.ok
          ? "Saved — takes effect on the very next chat message, no restart needed."
          : `Error: ${result.error}`
      );

      if (res.ok) {
        setUpdateNote("");
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveAppend() {
    if (!addText.trim()) return;
    setAdding(true);

    try {
      const res = await fetch("/api/admin/ai-config/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: addText, note: addNote, businessId }),
      });
      const result = await res.json();

      setMessage(
        res.ok
          ? "Added to the end of the current prompt as a new version."
          : `Error: ${result.error}`
      );

      if (res.ok) {
        setAddText("");
        setAddNote("");
        refresh();
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>AI Brain</h2>
      <p style={subtleTextStyle}>
        What the AI is told to do, and when it should ask for a human instead.
        {businessId ? " Unsaved settings use the platform default." : ""}
      </p>

      {!current && <p style={subtleTextStyle}>Loading…</p>}

      {current && (
        <>
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>Reply language</h3>
            <p style={subtleTextStyle}>Lock the AI's reply language, or leave it on Auto to match the customer.</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={languageDraft}
                onChange={(e) => setLanguageDraft(e.target.value)}
                style={{ padding: 8 }}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button onClick={saveLanguage} disabled={savingLanguage || languageDraft === current.languageMode} style={primaryButtonStyle}>
                {savingLanguage ? "Saving…" : "Save"}
              </button>
              {current.languageMode !== "auto" && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Locked to: {LANGUAGE_OPTIONS.find((o) => o.value === current.languageMode)?.label}
                </span>
              )}
            </div>
            {languageMessage && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{languageMessage}</p>}
          </div>

          <h3>Current prompt</h3>
          <textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            style={{
              width: "100%",
              minHeight: 280,
              padding: 8,
              fontFamily: "monospace",
              fontSize: 12,
              boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            <label>
              Handoff confidence floor{" "}
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={floorDraft}
                onChange={(e) => setFloorDraft(Number(e.target.value))}
                style={{ width: 80, padding: 4 }}
              />
            </label>
            <label>
              Conversation history turns{" "}
              <input
                type="number"
                min={0}
                value={turnsDraft}
                onChange={(e) => setTurnsDraft(Number(e.target.value))}
                style={{ width: 80, padding: 4 }}
              />
            </label>
          </div>

          <div style={{ marginTop: 16 }}>
            <label>
              AI Temperature (Creativity){" "}
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperatureDraft}
                onChange={(e) => setTemperatureDraft(Number(e.target.value))}
                style={{ verticalAlign: "middle" }}
              />{" "}
              <strong>{temperatureDraft.toFixed(1)}</strong>
            </label>
            <p style={{ ...subtleTextStyle, marginTop: 4 }}>
              0.1 = strict &amp; factual · 0.7+ = creative &amp; chatty
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              style={{ flex: 1 }}
              placeholder="What changed and why (kept in the history log)"
              value={updateNote}
              onChange={(e) => setUpdateNote(e.target.value)}
            />
            <button onClick={saveUpdate} disabled={saving} style={primaryButtonStyle}>
              {saving ? "Saving…" : "Update"}
            </button>
          </div>

          <h3 style={{ marginTop: 24 }}>Add an instruction</h3>
          <p style={subtleTextStyle}>
            Appends a new rule to the end of the prompt — e.g. &quot;Never mention competitor pricing.&quot;
          </p>
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder="New rule to add…"
            style={{ width: "100%", minHeight: 60, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              style={{ flex: 1 }}
              placeholder="Note (optional — defaults to the added text)"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
            />
            <button onClick={saveAppend} disabled={adding} style={primaryButtonStyle}>
              {adding ? "Adding…" : "Add"}
            </button>
          </div>

          {message && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{message}</p>}
        </>
      )}

      <h3 style={{ marginTop: 24 }}>History</h3>
      {!history && <p style={subtleTextStyle}>Loading…</p>}
      {history && (
        <table>
          <thead>
            <tr>
              <th style={cellStyle}>When</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Note</th>
              <th style={cellStyle}>Floor</th>
              <th style={cellStyle}>Turns</th>
              <th style={cellStyle}>Temp</th>
              <th style={cellStyle}>Language</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {history.map((v) => (
              <Fragment key={v.id}>
                <tr>
                  <td style={cellStyle}>{new Date(v.createdAt).toLocaleString()}</td>
                  <td style={cellStyle}>{v.changeType}</td>
                  <td style={cellStyle}>{v.note ?? "—"}</td>
                  <td style={cellStyle}>{v.handoffFloor}</td>
                  <td style={cellStyle}>{v.historyTurns}</td>
                  <td style={cellStyle}>{v.temperature}</td>
                  <td style={cellStyle}>{v.languageMode}</td>
                  <td style={cellStyle}>
                    <button onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                      {expandedId === v.id ? "Hide" : "View prompt"}
                    </button>
                  </td>
                </tr>
                {expandedId === v.id && (
                  <tr>
                    <td style={cellStyle} colSpan={8}>
                      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>
                        {v.systemPrompt}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {history.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={8}>
                  No history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
