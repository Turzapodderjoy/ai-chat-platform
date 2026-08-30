"use client";

import { Fragment, useEffect, useState } from "react";
import { cardStyle, labelTextStyle } from "./dashboard-styles";

interface AiConfig {
  id: string;
  businessId: string;
  maxTokens: number;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stopSequences: string | null;
  seed: number | null;
  visionMode: string;
  changeType: string;
  note: string | null;
  createdAt: string;
}

interface ProviderStatus {
  name: string;
  healthy: boolean;
  hasUsableKey: boolean;
  enabled: boolean;
}

interface AiParametersPanelProps {
  businessId?: string;
}

const LENGTH_PRESETS = [
  { label: "Short", hint: "Quick, to the point", tokens: 256 },
  { label: "Medium", hint: "A normal reply", tokens: 768 },
  { label: "Long", hint: "Detailed, thorough", tokens: 1536 },
] as const;

const STYLE_PRESETS = [
  { label: "Focused", hint: "Sticks close to KB", topP: 0.5 },
  { label: "Balanced", hint: "Good default", topP: 0.9 },
  { label: "Creative", hint: "More varied phrasing", topP: 1 },
] as const;

function PresetButton({ label, hint, active, onClick }: { label: string; hint: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
        background: active ? "var(--accent-subtle)" : "var(--surface)",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
        textAlign: "center",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-faint)" }}>{hint}</div>
    </button>
  );
}

export function AiParametersPanel({ businessId }: AiParametersPanelProps) {
  const [current, setCurrent] = useState<AiConfig | null>(null);
  const [history, setHistory] = useState<AiConfig[] | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);

  const [maxTokensDraft, setMaxTokensDraft] = useState(1024);
  const [topPDraft, setTopPDraft] = useState("");
  const [freqPenaltyDraft, setFreqPenaltyDraft] = useState("");
  const [presPenaltyDraft, setPresPenaltyDraft] = useState("");
  const [stopDraft, setStopDraft] = useState("");
  const [seedDraft, setSeedDraft] = useState("");
  const [visionModeDraft, setVisionModeDraft] = useState("current");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [visionSaving, setVisionSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [visionMessage, setVisionMessage] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";

  function refresh() {
    fetch(`/api/admin/ai-config${qs}`)
      .then((r) => r.json())
      .then((data: AiConfig) => {
        setCurrent(data);
        setMaxTokensDraft(data.maxTokens);
        setTopPDraft(data.topP != null ? String(data.topP) : "");
        setFreqPenaltyDraft(data.frequencyPenalty != null ? String(data.frequencyPenalty) : "");
        setPresPenaltyDraft(data.presencePenalty != null ? String(data.presencePenalty) : "");
        setStopDraft(data.stopSequences ?? "");
        setSeedDraft(data.seed != null ? String(data.seed) : "");
        setVisionModeDraft(data.visionMode ?? "current");
      });

    fetch(`/api/admin/ai-config/history${qs}`)
      .then((r) => r.json())
      .then((data) => setHistory(data.history));

    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then((data) => setProviders(data.status));
  }

  useEffect(refresh, [businessId]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/ai-config/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxTokens: maxTokensDraft,
          topP: topPDraft.trim() === "" ? null : Number(topPDraft),
          frequencyPenalty: freqPenaltyDraft.trim() === "" ? null : Number(freqPenaltyDraft),
          presencePenalty: presPenaltyDraft.trim() === "" ? null : Number(presPenaltyDraft),
          stopSequences: stopDraft.trim() === "" ? null : stopDraft.trim(),
          seed: seedDraft.trim() === "" ? null : Number(seedDraft),
          note,
          businessId,
        }),
      });
      const result = await res.json();
      setMessage(res.ok ? "Saved — applied to next message." : `Error: ${result.error}`);
      if (res.ok) { setNote(""); refresh(); }
    } finally {
      setSaving(false);
    }
  }

  async function saveVisionMode(mode: string) {
    setVisionSaving(true);
    setVisionMessage("");
    try {
      const res = await fetch("/api/admin/ai-config/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visionMode: mode, businessId }),
      });
      const result = await res.json();
      if (res.ok) {
        setVisionModeDraft(mode);
        setVisionMessage(`Vision mode set to "${mode}" — applied to next message.`);
        refresh();
      } else {
        setVisionMessage(`Error: ${result.error}`);
      }
    } finally {
      setVisionSaving(false);
    }
  }

  const selectedLength = LENGTH_PRESETS.find((p) => p.tokens === maxTokensDraft)?.label ?? null;
  const topPNumber = topPDraft.trim() === "" ? 0.9 : Number(topPDraft);
  const selectedStyle = STYLE_PRESETS.find((p) => Math.abs(p.topP - topPNumber) < 0.001)?.label ?? null;

  return (
    <section>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Parameters</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Fine-tune AI response behavior. {businessId ? "Unsaved fields use platform defaults." : ""}
        </p>
      </div>

      {!current && (
        <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
      )}

      {current && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left Column - Presets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Reply Length */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Reply Length</div>
              <div style={{ display: "flex", gap: 8 }}>
                {LENGTH_PRESETS.map((opt) => (
                  <PresetButton
                    key={opt.label}
                    label={opt.label}
                    hint={opt.hint}
                    active={opt.label === selectedLength}
                    onClick={() => setMaxTokensDraft(opt.tokens)}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>
                {maxTokensDraft} tokens
              </div>
            </div>

            {/* Reply Style */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Reply Style</div>
              <div style={{ display: "flex", gap: 8 }}>
                {STYLE_PRESETS.map((opt) => (
                  <PresetButton
                    key={opt.label}
                    label={opt.label}
                    hint={opt.hint}
                    active={opt.label === selectedStyle}
                    onClick={() => setTopPDraft(String(opt.topP))}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>
                top_p: {topPNumber.toFixed(2)}
              </div>
            </div>

            {/* Provider Status */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Active Providers</div>
              {providers ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {providers.filter((p) => p.enabled).map((p) => (
                    <span key={p.name} style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 10px",
                      borderRadius: "var(--radius-full)",
                      fontSize: 12,
                      background: p.hasUsableKey && p.healthy ? "var(--success-subtle)" : "var(--surface-hover)",
                      color: p.hasUsableKey && p.healthy ? "var(--success)" : "var(--text-muted)",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.hasUsableKey && p.healthy ? "var(--success)" : "var(--text-faint)" }} />
                      {p.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
              )}
            </div>

            {/* Vision Mode */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Vision Mode (Customer Photos)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <PresetButton
                  label="Current"
                  hint="Gemini describes image as text"
                  active={visionModeDraft === "current"}
                  onClick={() => !visionSaving && saveVisionMode("current")}
                />
                <PresetButton
                  label="MiMo"
                  hint="AI sees actual image pixels"
                  active={visionModeDraft === "mimo"}
                  onClick={() => !visionSaving && saveVisionMode("mimo")}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)" }}>
                {visionModeDraft === "mimo"
                  ? "MiMo-V2.5 via OpenRouter — sends raw image to the model"
                  : "Gemini describes the image as text, then any provider replies"}
              </div>
              {visionMessage && <p style={{ fontSize: 12, color: "var(--accent)", marginTop: 6 }}>{visionMessage}</p>}
            </div>
          </div>

          {/* Right Column - Advanced + Save */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Advanced Settings */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={labelTextStyle}>Advanced Parameters</div>
                <button onClick={() => setAdvanced(!advanced)} className="ghost" style={{ fontSize: 11, padding: "4px 8px" }}>
                  {advanced ? "Collapse" : "Expand"}
                </button>
              </div>
              
              {advanced && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Max Tokens</label>
                    <input
                      type="number"
                      min={1}
                      value={maxTokensDraft}
                      onChange={(e) => setMaxTokensDraft(Number(e.target.value))}
                      style={{ width: "100%", padding: "8px 10px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Top P</label>
                    <input
                      type="number"
                      min={0} max={1} step={0.05}
                      value={topPDraft}
                      onChange={(e) => setTopPDraft(e.target.value)}
                      placeholder="0.9"
                      style={{ width: "100%", padding: "8px 10px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Frequency Penalty</label>
                    <input
                      type="number"
                      min={-2} max={2} step={0.1}
                      value={freqPenaltyDraft}
                      onChange={(e) => setFreqPenaltyDraft(e.target.value)}
                      placeholder="0"
                      style={{ width: "100%", padding: "8px 10px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Presence Penalty</label>
                    <input
                      type="number"
                      min={-2} max={2} step={0.1}
                      value={presPenaltyDraft}
                      onChange={(e) => setPresPenaltyDraft(e.target.value)}
                      placeholder="0"
                      style={{ width: "100%", padding: "8px 10px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Seed</label>
                    <input
                      type="number"
                      value={seedDraft}
                      onChange={(e) => setSeedDraft(e.target.value)}
                      placeholder="random"
                      style={{ width: "100%", padding: "8px 10px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontFamily: "monospace" }}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Stop Sequences (comma-separated)</label>
                    <input
                      value={stopDraft}
                      onChange={(e) => setStopDraft(e.target.value)}
                      placeholder="e.g., ###, END"
                      style={{ width: "100%", padding: "8px 10px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontFamily: "monospace" }}
                    />
                  </div>
                </div>
              )}
              
              {!advanced && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Click "Expand" to view and edit raw model parameters
                </div>
              )}
            </div>

            {/* Save */}
            <div style={cardStyle}>
              <div style={labelTextStyle}>Save Configuration</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ flex: 1, padding: "8px 12px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)" }}
                  placeholder="What changed and why..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button onClick={save} disabled={saving} className="primary" style={{ padding: "8px 20px", fontSize: 12 }}>
                  {saving ? "Saving..." : "Save"}
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
          <div style={labelTextStyle}>Parameter History</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Note</th>
                  <th>Max Tokens</th>
                  <th>Top P</th>
                  <th>Freq. Penalty</th>
                  <th>Pres. Penalty</th>
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
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.maxTokens}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.topP ?? "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.frequencyPenalty ?? "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.presencePenalty ?? "—"}</td>
                    </tr>
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
