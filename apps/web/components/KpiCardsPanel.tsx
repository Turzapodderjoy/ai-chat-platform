"use client";

import { useCallback, useEffect, useState } from "react";

import { StatCard, StatCardRow } from "./StatCard";

// Wave B #29 - KPI dashboard cards. Read-only count tiles sourced from
// /api/admin/kpi (derived live from Orders / PurchaseOrders / RepairAppointments
// / TeamMessages / Shifts / Staff / Locations). Refresh reloads the numbers.

interface KpiCard {
  id: string;
  label: string;
  value: number;
  hint: string;
}

export function KpiCardsPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [cards, setCards] = useState<KpiCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/kpi?businessId=${encodeURIComponent(businessId)}`);
    if (res.ok) {
      const data = await res.json();
      setCards(data.cards ?? []);
      setGeneratedAt(data.generatedAt ?? null);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Key numbers</span>
          <div className="meta">
            Counts derived from this business&apos;s live data
            {generatedAt ? (
              <>
                , updated <span className="data">{new Date(generatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
              </>
            ) : null}
            .
          </div>
        </div>
        <button type="button" className="sm" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing counts" : "Refresh counts"}
        </button>
      </div>

      <div className="panel-body">
        {!cards && loading ? (
          <p className="meta">Loading key numbers</p>
        ) : !cards ? (
          <div className="empty-state">
            <span className="empty-state-title">No key numbers yet</span>
            <span className="empty-state-description">
              Counts appear here once orders, repairs, shifts and staff exist.
            </span>
          </div>
        ) : cards.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-title">No key numbers yet</span>
            <span className="empty-state-description">
              Counts appear here once orders, repairs, shifts and staff exist.
            </span>
          </div>
        ) : (
          <StatCardRow>
            {cards.map((c) => (
              <StatCard key={c.id} label={c.label} value={c.value.toLocaleString()} hint={c.hint} />
            ))}
          </StatCardRow>
        )}
      </div>
    </section>
  );
}