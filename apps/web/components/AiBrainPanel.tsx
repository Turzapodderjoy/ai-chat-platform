"use client";

import { Fragment, useEffect, useState } from "react";
import { cardStyle, labelTextStyle } from "./dashboard-styles";

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
  { value: "auto", label: "Auto — match customer language" },
  { value: "english", label: "English only" },
  { value: "bangla", label: "Bangla only" },
  { value: "banglish", label: "Banglish only" },
];

interface AiBrainPanelProps {
  businessId?: string;
}

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
      setLanguageMessage(res.ok ? "Saved — takes effect on next message." : `Error: ${result.error}`);
      if (res.ok) refresh();
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
      setMessage(res.ok ? "Saved — takes effect on next message." : `Error: ${result.error}`);
      if (res.ok) { setUpdateNote(""); refresh(); }
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
      setMessage(res.ok ? "Added to prompt as new version." : `Error: ${result.error}`);
      if (res.ok) { setAddText(""); setAddNote(""); refresh(); }
    } finally {
      setAdding(false);
    }
  }

  return (
    <section>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>AI Brain</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Configure AI behavior, system prompts, and response parameters.
          {businessId ? " Client-specific settings override platform defaults." : ""}
        </p>
      </div>

      {!current && (
        <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading configuration...</div>
      )}

      {current && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left Column - Prompt Editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* System Prompt */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={labelTextStyle}>System Prompt</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>
                  {promptDraft.length} chars
                </div>
              </div>
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 320,
                  padding: "12px",
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                  fontSize: 12,
                  lineHeight: 1.6,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Append Rule */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Add Instruction</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Append a new rule to the system prompt
              </p>
              <textarea
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder="e.g., Never mention competitor pricing..."
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: "10px 12px",
                  fontSize: 13,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  resize: "vertical",
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 12,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text)",
                  }}
                  placeholder="Note (optional)"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                />
                <button onClick={saveAppend} disabled={adding} className="primary" style={{ padding: "8px 16px", fontSize: 12 }}>
                  {adding ? "Adding..." : "Add Rule"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Parameters */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Language */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Reply Language</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={languageDraft}
                  onChange={(e) => setLanguageDraft(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 13,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text)",
                  }}
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button onClick={saveLanguage} disabled={savingLanguage || languageDraft === current.languageMode} className="primary" style={{ padding: "8px 16px", fontSize: 12 }}>
                  {savingLanguage ? "Saving..." : "Save"}
                </button>
              </div>
              {languageMessage && <p style={{ fontSize: 12, color: "var(--accent)", marginTop: 8 }}>{languageMessage}</p>}
            </div>

            {/* Parameters */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Parameters</div>
              
              {/* Handoff Floor */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Handoff Confidence Floor</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", fontFamily: "monospace" }}>{floorDraft.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={floorDraft}
                  onChange={(e) => setFloorDraft(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
                  <span>More handoffs</span>
                  <span>More AI answers</span>
                </div>
              </div>

              {/* History Turns */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Conversation History Turns</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", fontFamily: "monospace" }}>{turnsDraft}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={turnsDraft}
                  onChange={(e) => setTurnsDraft(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
                  <span>Less context</span>
                  <span>More context</span>
                </div>
              </div>

              {/* Temperature */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Temperature (Creativity)</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", fontFamily: "monospace" }}>{temperatureDraft.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperatureDraft}
                  onChange={(e) => setTemperatureDraft(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
                  <span>Strict & factual</span>
                  <span>Creative & chatty</span>
                </div>
              </div>
            </div>

            {/* Save */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Save Changes</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 12,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text)",
                  }}
                  placeholder="What changed and why..."
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                />
                <button onClick={saveUpdate} disabled={saving} className="primary" style={{ padding: "8px 20px", fontSize: 12 }}>
                  {saving ? "Saving..." : "Update"}
                </button>
              </div>
              {message && <p style={{ fontSize: 12, color: "var(--accent)", marginTop: 8 }}>{message}</p>}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history && history.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={labelTextStyle}>Configuration History</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Note</th>
                  <th>Floor</th>
                  <th>Turns</th>
                  <th>Temp</th>
                  <th>Language</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => (
                  <Fragment key={v.id}>
                    <tr>
                      <td style={{ fontSize: 12 }}>{new Date(v.createdAt).toLocaleString()}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          fontSize: 11,
                          fontWeight: 500,
                          background: v.changeType === "update" ? "var(--accent-subtle)" : "var(--success-subtle)",
                          color: v.changeType === "update" ? "var(--accent)" : "var(--success)",
                        }}>
                          {v.changeType}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v.note ?? "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.handoffFloor}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.historyTurns}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.temperature}</td>
                      <td style={{ fontSize: 12 }}>{v.languageMode}</td>
                      <td>
                        <button onClick={() => setExpandedId(expandedId === v.id ? null : v.id)} className="ghost" style={{ fontSize: 11, padding: "4px 8px" }}>
                          {expandedId === v.id ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === v.id && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <div style={{ padding: "12px 16px", background: "var(--bg)", borderTop: "1px solid var(--border-subtle)" }}>
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, margin: 0, fontFamily: "'SF Mono', monospace", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                              {v.systemPrompt}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
