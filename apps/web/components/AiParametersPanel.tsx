"use client";

import { Fragment, useEffect, useState } from "react";

import { cardStyle, cellStyle } from "./dashboard-styles";

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

/** Overrides all AI providers uniformly for this business — answer length
 * plus sampling controls, versioned the same way the AI Brain prompt is. */
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

      setMessage(
        res.ok
          ? "Saved — takes effect on the very next chat message, no restart needed."
          : `Error: ${result.error}`
      );

      if (res.ok) {
        setNote("");
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Parameters</h2>
      <p style={{ opacity: 0.6 }}>
        Overrides every AI provider for this business with the same tuning
        parameters, so answers stay consistent regardless of which provider
        actually handled the request. Leave a field blank to let the
        provider use its own default.
        {businessId
          ? " Until you save a change here, this client uses the mother dashboard's default."
          : ""}
      </p>

      {!current && <p>Loading…</p>}

      {current && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label>
              Max tokens{" "}
              <input
                type="number"
                min={1}
                value={maxTokensDraft}
                onChange={(e) => setMaxTokensDraft(Number(e.target.value))}
                style={{ width: 100, padding: 4 }}
              />
            </label>
            <label>
              Top P{" "}
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={topPDraft}
                onChange={(e) => setTopPDraft(e.target.value)}
                placeholder="default"
                style={{ width: 100, padding: 4 }}
              />
            </label>
            <label>
              Frequency penalty{" "}
              <input
                type="number"
                min={-2}
                max={2}
                step={0.1}
                value={freqPenaltyDraft}
                onChange={(e) => setFreqPenaltyDraft(e.target.value)}
                placeholder="default"
                style={{ width: 100, padding: 4 }}
              />
            </label>
            <label>
              Presence penalty{" "}
              <input
                type="number"
                min={-2}
                max={2}
                step={0.1}
                value={presPenaltyDraft}
                onChange={(e) => setPresPenaltyDraft(e.target.value)}
                placeholder="default"
                style={{ width: 100, padding: 4 }}
              />
            </label>
            <label>
              Seed{" "}
              <input
                type="number"
                value={seedDraft}
                onChange={(e) => setSeedDraft(e.target.value)}
                placeholder="random"
                style={{ width: 100, padding: 4 }}
              />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Stop sequences (comma-separated)</label>
            <input
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              value={stopDraft}
              onChange={(e) => setStopDraft(e.target.value)}
              placeholder="e.g. ###, END"
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              style={{ flex: 1, padding: 8 }}
              placeholder="What changed and why (kept in the history log)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {message && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>{message}</p>}
        </>
      )}

      <h3 style={{ marginTop: 24 }}>Provider status</h3>
      <p style={{ opacity: 0.6, fontSize: 13 }}>
        Whether each provider is enabled and has a usable key right now —
        parameters only take effect on a provider that's actually able to
        handle requests.
      </p>
      {!providers && <p>Loading…</p>}
      {providers && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {providers.map((p) => (
            <div key={p.name} style={{ fontSize: 13 }}>
              {p.enabled && p.hasUsableKey ? "✅" : "❌"} {p.name}
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>History</h3>
      {!history && <p>Loading…</p>}
      {history && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
      )}
    </section>
  );
}
