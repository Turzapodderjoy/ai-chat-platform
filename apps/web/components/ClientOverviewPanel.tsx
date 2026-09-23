"use client";

import { useEffect, useState } from "react";

import { StatCard, StatCardRow } from "./StatCard";
import { subtleTextStyle } from "./dashboard-styles";

/**
 * Per-client dashboard's landing tab — high-level pulse for this one
 * business. Cards beyond "open handoffs" used to pull from the deleted
 * knowledge/provider pipeline; they died with it.
 */
export function ClientOverviewPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [openHandoffs, setOpenHandoffs] = useState<number | null>(null);

  // Refetches on every re-activation of this tab, not just on mount —
  // see the mother dashboard's OverviewPanel for why (panels stay
  // permanently mounted across tab switches to preserve Chat Demo's state).
  useEffect(() => {
    if (!active) return;

    fetch(`/api/admin/handoffs?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { handoffs: { status: string }[] }) =>
        setOpenHandoffs(d.handoffs.filter((h) => h.status === "pending").length)
      );
  }, [businessId, active]);

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Overview</h1>
      <p style={subtleTextStyle}>This client&apos;s snapshot — use the sidebar to drill into any section.</p>

      <StatCardRow>
        <StatCard
          label="Open handoffs"
          value={openHandoffs === null ? "…" : String(openHandoffs)}
          tone={openHandoffs !== null && openHandoffs > 0 ? "warning" : "success"}
        />
      </StatCardRow>
    </section>
  );
}
