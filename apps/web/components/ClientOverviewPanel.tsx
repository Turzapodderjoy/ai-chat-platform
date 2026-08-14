"use client";

import { useEffect, useState } from "react";

import { StatCard, StatCardRow } from "./StatCard";
import { subtleTextStyle, formatBytes } from "./dashboard-styles";

interface StorageInfo {
  knowledgeChunks: number;
  knowledgeDocuments: number;
  knowledgeBytesEstimate: number;
  conversations: number;
}

interface CoverageEntry {
  provider: string;
  chunksEmbedded: number;
  totalChunks: number;
}

/**
 * Per-client dashboard's landing tab — same "read from what other tabs
 * already fetch" approach as the mother dashboard's OverviewPanel, just
 * scoped to this one business.
 */
export function ClientOverviewPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [openHandoffs, setOpenHandoffs] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<CoverageEntry[] | null>(null);
  const [aiBrainUpdatedAt, setAiBrainUpdatedAt] = useState<string | null>(null);

  // Refetches on every re-activation of this tab, not just on mount —
  // see OverviewPanel's comment for why (panels stay permanently
  // mounted across tab switches to preserve Chat Demo's state).
  useEffect(() => {
    if (!active) return;

    fetch(`/api/admin/storage?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then(setStorage);

    fetch(`/api/admin/handoffs?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { handoffs: { status: string }[] }) =>
        setOpenHandoffs(d.handoffs.filter((h) => h.status === "pending").length)
      );

    fetch(`/api/admin/embedding-providers/coverage?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { coverage: CoverageEntry[] }) => setCoverage(d.coverage));

    fetch(`/api/admin/ai-config?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { createdAt: string }) => setAiBrainUpdatedAt(d.createdAt));
  }, [businessId, active]);

  const fullyCovered =
    coverage && coverage.length > 0
      ? coverage.every((c) => c.totalChunks === 0 || c.chunksEmbedded === c.totalChunks)
      : null;

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Overview</h1>
      <p style={subtleTextStyle}>
        This client&apos;s snapshot — use the sidebar to drill into any section.
      </p>

      <StatCardRow>
        <StatCard
          label="Knowledge base"
          value={storage ? formatBytes(storage.knowledgeBytesEstimate) : "…"}
          hint={storage ? `${storage.knowledgeDocuments} documents, ${storage.knowledgeChunks} chunks` : undefined}
          tone="info"
        />
        <StatCard
          label="Embedding coverage"
          value={fullyCovered === null ? "…" : fullyCovered ? "Full" : "Partial"}
          hint={coverage ? `across ${coverage.length} provider(s)` : undefined}
          tone={fullyCovered === null ? "neutral" : fullyCovered ? "success" : "warning"}
        />
        <StatCard
          label="Open handoffs"
          value={openHandoffs === null ? "…" : String(openHandoffs)}
          tone={openHandoffs !== null && openHandoffs > 0 ? "warning" : "success"}
        />
        <StatCard
          label="AI Brain last updated"
          value={aiBrainUpdatedAt ? new Date(aiBrainUpdatedAt).toLocaleDateString() : "…"}
          hint={aiBrainUpdatedAt ? new Date(aiBrainUpdatedAt).toLocaleTimeString() : undefined}
        />
        <StatCard label="Conversations" value={storage ? String(storage.conversations) : "…"} tone="info" />
      </StatCardRow>
    </section>
  );
}
