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
        onClick={() => setOpen((o) => !o)}
        title="Why did it answer this way?"
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 0,
          fontSize: 12,
          color: "var(--text-faint)",
          verticalAlign: "middle",
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            top: "120%",
            left: 0,
            minWidth: 260,
            maxWidth: 380,
            background: "var(--card-bg, #111)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            color: "var(--text-muted)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {provider && (
            <div style={{ marginBottom: 4 }}>
              <strong>AI provider:</strong> {provider}
            </div>
          )}
          {confidence != null && (
            <div style={{ marginBottom: 4 }}>
              <strong>Retrieval confidence:</strong> {Math.round(confidence * 100)}%
            </div>
          )}
          {sources && sources.length > 0 && (
            <div>
              <strong>Sources (embedder — score):</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {sources.map((s, i) => (
                  <li key={i} style={{ marginBottom: 2, wordBreak: "break-all" }}>
                    {s.label}
                    {s.embeddingProvider ? ` — ${s.embeddingProvider}` : ""} ({Math.round(s.score * 100)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
