"use client";

import { useEffect, useState } from "react";

import { StatCard, StatCardRow } from "./StatCard";
import { subtleTextStyle } from "./dashboard-styles";

interface Counts {
  clients: number | null;
  openHandoffs: number | null;
  totalHandoffs: number | null;
}

/**
 * Mother dashboard's landing tab — high-level pulse across all clients.
 * Knowledge/provider charts and QA cards used to live here; they died
 * with the legacy AI pipeline.
 */
export function OverviewPanel({ active = true }: { active?: boolean }) {
  const [counts, setCounts] = useState<Counts>({
    clients: null,
    openHandoffs: null,
    totalHandoffs: null,
  });

  useEffect(() => {
    if (!active) return;

    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((d) => setCounts((c) => ({ ...c, clients: d.clients.length })));

    fetch("/api/admin/handoffs")
      .then((r) => r.json())
      .then((d: { handoffs: { status: string }[] }) =>
        setCounts((c) => ({
          ...c,
          totalHandoffs: d.handoffs.length,
          openHandoffs: d.handoffs.filter((h) => h.status === "pending").length,
        }))
      );
  }, [active]);

  const val = (n: number | null) => (n === null ? "—" : String(n));

  return (
    <section>
      <StatCardRow>
        <StatCard label="Total Clients" value={val(counts.clients)} tone="accent" />
        <StatCard
          label="Open Handoffs"
          value={val(counts.openHandoffs)}
          hint={counts.totalHandoffs !== null ? `${counts.totalHandoffs} total` : undefined}
          tone={counts.openHandoffs !== null && counts.openHandoffs > 0 ? "warning" : "success"}
        />
      </StatCardRow>
      <p style={subtleTextStyle}>Use the sidebar to drill into any section.</p>
    </section>
  );
}