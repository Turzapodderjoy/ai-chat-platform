"use client";

import { Fragment, useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle, badgeStyle } from "./dashboard-styles";

interface AiConfig {
  id: string;
  businessId: string;
  maxTokens: number;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stopSequences: string | null;
  seed: number | null;
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
  /** Omit for the mother dashboard's platform-wide default — same
   * inherit-until-saved semantics as AiBrainPanel. */
  businessId?: string;
}

const LENGTH_PRESETS = [
  { label: "Short", hint: "Quick, to the point", tokens: 256 },
  { label: "Medium", hint: "A normal reply", tokens: 768 },
  { label: "Long", hint: "Detailed, thorough", tokens: 1536 },
] as const;

const STYLE_PRESETS = [
  { label: "Focused", hint: "Sticks close to the knowledge base", topP: 0.5 },
  { label: "Balanced", hint: "Good default for most businesses", topP: 0.9 },
  { label: "Creative", hint: "More varied phrasing", topP: 1 },
] as const;

function SegmentedControl<T extends { label: string; hint: string }>({
  options,
  selectedLabel,
  onSelect,
}: {
  options: readonly T[];
  selectedLabel: string | null;
  onSelect: (opt: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = opt.label === selectedLabel;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onSelect(opt)}
            title={opt.hint}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
              background: active ? "var(--accent-soft)" : "var(--surface)",
              color: active ? "var(--accent-strong)" : "var(--text)",
              fontWeight: active ? 600 : 400,
              minWidth: 110,
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 13 }}>{opt.label}</div>
            <div style={{ fontSize: 11, color: active ? "var(--accent-strong)" : "var(--text-faint)", marginTop: 2 }}>{opt.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

/** Same underlying AiConfigVersion fields as before, just presented as
 * two plain-language choices (reply length, reply style) instead of raw
 * model parameters — "Short/Medium/Long" instead of a token count,
 * "Focused/Balanced/Creative" instead of a top-P value. The exact
 * numbers are still there under "Advanced", for anyone who wants them. */
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
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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

      setMessage(res.ok ? "Saved — used on the very next message." : `Error: ${result.error}`);

      if (res.ok) {
        setNote("");
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedLength = LENGTH_PRESETS.find((p) => p.tokens === maxTokensDraft)?.label ?? null;
  const topPNumber = topPDraft.trim() === "" ? 0.9 : Number(topPDraft);
  const selectedStyle = STYLE_PRESETS.find((p) => Math.abs(p.topP - topPNumber) < 0.001)?.label ?? null;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Parameters</h2>
      <p style={subtleTextStyle}>
        How the AI replies — length and style. {businessId ? "Unsaved fields use the platform default." : ""}
      </p>

      {!current && <p style={subtleTextStyle}>Loading…</p>}

      {current && (
        <>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Reply length</div>
            <SegmentedControl
              options={LENGTH_PRESETS}
              selectedLabel={selectedLength}
              onSelect={(opt) => setMaxTokensDraft(opt.tokens)}
            />
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Reply style</div>
            <SegmentedControl
              options={STYLE_PRESETS}
              selectedLabel={selectedStyle}
              onSelect={(opt) => setTopPDraft(String(opt.topP))}
            />
          </div>

          <button
            type="button"
            className="plain"
            onClick={() => setAdvanced((v) => !v)}
            style={{ marginTop: 16, padding: 0, border: "none", background: "none", color: "var(--accent)", fontSize: 12.5 }}
          >
            {advanced ? "Hide advanced settings" : "Show advanced settings"}
          </button>

          {advanced && (
            <div style={{ marginTop: 12, padding: 14, background: "var(--surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
                Exact numbers, for fine-tuning beyond the presets above. Leave a field blank for the provider&apos;s own default.
              </p>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12 }}>
                  Max tokens<br />
                  <input type="number" min={1} value={maxTokensDraft} onChange={(e) => setMaxTokensDraft(Number(e.target.value))} style={{ width: 100 }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Top P<br />
                  <input type="number" min={0} max={1} step={0.05} value={topPDraft} onChange={(e) => setTopPDraft(e.target.value)} placeholder="default" style={{ width: 100 }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Frequency penalty<br />
                  <input type="number" min={-2} max={2} step={0.1} value={freqPenaltyDraft} onChange={(e) => setFreqPenaltyDraft(e.target.value)} placeholder="default" style={{ width: 100 }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Presence penalty<br />
                  <input type="number" min={-2} max={2} step={0.1} value={presPenaltyDraft} onChange={(e) => setPresPenaltyDraft(e.target.value)} placeholder="default" style={{ width: 100 }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Seed<br />
                  <input type="number" value={seedDraft} onChange={(e) => setSeedDraft(e.target.value)} placeholder="random" style={{ width: 100 }} />
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Stop sequences (comma-separated)</label>
                <input style={{ width: "100%" }} value={stopDraft} onChange={(e) => setStopDraft(e.target.value)} placeholder="e.g. ###, END" />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input
              style={{ flex: 1 }}
              placeholder="What changed and why (optional, kept in history)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button onClick={save} disabled={saving} style={primaryButtonStyle}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {message && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{message}</p>}
        </>
      )}

      <h3 style={{ marginTop: 28 }}>Provider status</h3>
      <p style={subtleTextStyle}>Only a provider that&apos;s enabled with a valid key can actually answer.</p>
      {!providers && <p style={subtleTextStyle}>Loading…</p>}
      {providers && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          {providers.map((p) => (
            <span key={p.name} style={badgeStyle(p.enabled && p.hasUsableKey ? "ok" : "neutral")}>
              {p.name}
            </span>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>History</h3>
      {!history && <p style={subtleTextStyle}>Loading…</p>}
      {history && (
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={cellStyle}>When</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Note</th>
              <th style={cellStyle}>Max tokens</th>
              <th style={cellStyle}>Top P</th>
              <th style={cellStyle}>Freq. penalty</th>
              <th style={cellStyle}>Pres. penalty</th>
              <th style={cellStyle}>Stop</th>
              <th style={cellStyle}>Seed</th>
            </tr>
          </thead>
          <tbody>
            {history.map((v) => (
              <Fragment key={v.id}>
                <tr>
                  <td style={cellStyle}>{new Date(v.createdAt).toLocaleString()}</td>
                  <td style={cellStyle}>{v.changeType}</td>
                  <td style={cellStyle}>{v.note ?? "—"}</td>
                  <td style={cellStyle}>{v.maxTokens}</td>
                  <td style={cellStyle}>{v.topP ?? "—"}</td>
                  <td style={cellStyle}>{v.frequencyPenalty ?? "—"}</td>
                  <td style={cellStyle}>{v.presencePenalty ?? "—"}</td>
                  <td style={cellStyle}>{v.stopSequences ?? "—"}</td>
                  <td style={cellStyle}>{v.seed ?? "—"}</td>
                </tr>
              </Fragment>
            ))}
            {history.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={9}>
                  No history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
