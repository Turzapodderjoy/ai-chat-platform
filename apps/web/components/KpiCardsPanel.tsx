"use client";

import { useCallback, useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, labelTextStyle } from "./dashboard-styles";

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
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>KPI Dashboard</h3>
          <p style={subtleTextStyle}>
            Counts derived from this business&apos;s live data
            {generatedAt ? ` (updated ${new Date(generatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})` : ""}.
          </p>
        </div>
        <button style={primaryButtonStyle} onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!cards && loading ? (
        <p style={subtleTextStyle}>Loading KPIs…</p>
      ) : !cards ? (
        <p style={subtleTextStyle}>No data yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {cards.map((c) => (
            <div
              key={c.id}
              style={{
                background: "#f9fafb",
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ ...labelTextStyle, color: "#6b7280", fontSize: 12 }}>{c.label}</span>
              <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{c.value.toLocaleString()}</span>
              <span style={{ ...subtleTextStyle, fontSize: 12 }}>{c.hint}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}