"use client";

import { useState } from "react";

export interface MessageSource {
  label: string;
  score: number;
  embeddingProvider?: string;
}

/** Admin-only "why did it answer this way" affordance — a small "i" icon
 * next to an assistant message that expands into the AI provider, the
 * retrieval confidence, and every source chunk with which embedding
 * provider matched it and how well. Never shown to customers; same
 * visibility convention as the provider/sources sublines this sits
 * beside. Click-to-toggle (not hover) so it works on touch too. */
export function ReasoningInfo({
  provider,
  confidence,
  sources,
}: {
  provider?: string | null;
  confidence?: number | null;
  sources?: MessageSource[] | null;
}) {
  const [open, setOpen] = useState(false);

  if (!provider && confidence == null && (!sources || sources.length === 0)) {
    return null;
  }

  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Why did it answer this way?"
        aria-expanded={open}
        title="Why did it answer this way?"
        style={{
          width: 20,
          height: 20,
          padding: 0,
          borderRadius: "var(--r-xs)",
          border: `1px solid ${open ? "var(--accent)" : "var(--line)"}`,
          background: open ? "var(--accent-subtle)" : "transparent",
          color: open ? "var(--accent)" : "var(--ink-4)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          verticalAlign: "middle",
          boxShadow: "none",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Why did it answer this way"
          style={{
            position: "absolute",
            zIndex: 10,
            top: "120%",
            left: 0,
            minWidth: 260,
            maxWidth: 380,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            padding: 12,
            fontSize: 11.5,
            color: "var(--ink-2)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          {provider && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <span className="field-label">AI provider</span>
              <span className="data">{provider}</span>
            </div>
          )}
          {confidence != null && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <span className="field-label">Retrieval confidence</span>
              <span className="data">{Math.round(confidence * 100)}%</span>
            </div>
          )}
          {sources && sources.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>
                Sources
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Embedder</th>
                      <th className="num" style={{ textAlign: "right" }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s, i) => (
                      <tr key={i}>
                        <td style={{ wordBreak: "break-word" }}>{s.label}</td>
                        <td className="data" style={{ fontSize: 11 }}>{s.embeddingProvider ?? "—"}</td>
                        <td className="data" style={{ textAlign: "right" }}>{Math.round(s.score * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
