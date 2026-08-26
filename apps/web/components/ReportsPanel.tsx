"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";

interface OverviewReport {
  revenue: {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    collectedThisMonth: number;
    collectedLastMonth: number;
    invoicesByStatus: Record<string, number>;
    quotesByStatus: Record<string, number>;
    quoteAcceptanceRate: number | null;
  };
  sales: {
    dealsByStage: { stage: string; count: number; value: number }[];
    openPipelineValue: number;
    wonValueAllTime: number;
    wonValueThisMonth: number;
    winRate: number | null;
    avgWonDealSize: number | null;
    lossReasons: { reason: string; count: number }[];
  };
  delivery: {
    totalOrders: number;
    ordersByDeliveryStatus: Record<string, number>;
    deliveredRate: number | null;
  };
  repairs: {
    totalAppointments: number;
    appointmentsByStatus: Record<string, number>;
  };
  crm: {
    totalContacts: number;
    newContactsThisWeek: number;
    newContactsThisMonth: number;
    totalCompanies: number;
  };
  generatedAt: string;
}

const STAGE_LABEL: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" };
const DELIVERY_LABEL: Record<string, string> = { pending: "Pending", picked_up: "Picked Up", in_transit: "In Transit", delivered: "Delivered", returned: "Returned" };
const REPAIR_LABEL: Record<string, string> = { booked: "Booked", received: "Received", in_repair: "In Repair", ready: "Ready", completed: "Completed", cancelled: "Cancelled" };
const INVOICE_TONE: Record<string, BadgeTone> = { draft: "neutral", issued: "info", partially_paid: "warn", paid: "ok", overdue: "error", void: "neutral" };
const QUOTE_TONE: Record<string, BadgeTone> = { draft: "neutral", sent: "info", accepted: "ok", rejected: "error", expired: "warn" };

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function money(n: number): string {
  return `৳${Math.round(n).toLocaleString()}`;
}

function BreakdownBar({ label, count, total, tone }: { label: string; count: number; total: number; tone: BadgeTone }) {
  const width = total > 0 ? Math.max(2, (count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
      <span style={{ width: 100, flexShrink: 0, color: "var(--text-muted)" }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: "var(--surface)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: `var(--${tone === "ok" ? "success" : tone === "error" ? "danger" : tone === "warn" ? "warning" : "accent"})` }} />
      </div>
      <span style={{ width: 28, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </div>
  );
}

/** HubSpot-style cross-domain reporting — one read-only rollup over
 * Revenue (Quotes/Invoices/Payments), Sales (Deals pipeline), Delivery
 * (Order tracking), Repairs, and CRM growth, all pulled from the same
 * records every other panel already writes to. See
 * ReportingService.getOverview for the actual aggregation. */
export function ReportsPanel({
  businessId,
  active = true,
  allowedPanels = null,
}: {
  businessId?: string;
  active?: boolean;
  // null = unrestricted (admin/mother dashboard) — every section shows.
  // A real client session's own allowedPanels (see ClientAccessPanel) --
  // a section only renders if the feature it's built from is still
  // ticked, so a client who's had e.g. Quotes/Invoices unchecked never
  // sees Revenue numbers derived from a feature they can't otherwise
  // open and verify.
  allowedPanels?: string[] | null;
}) {
  const [report, setReport] = useState<OverviewReport | null>(null);

  useEffect(() => {
    if (!active) return;
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/reports/overview${qs}`)
      .then((r) => r.json())
      .then(setReport);
  }, [businessId, active]);

  if (!report) {
    return (
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Reports</h2>
        <p style={subtleTextStyle}>Loading…</p>
      </section>
    );
  }

  const has = (id: string) => allowedPanels === null || allowedPanels.includes(id);
  const showRevenue = has("quotes") || has("invoices");
  const showSales = has("deals");
  const showDelivery = has("orders");
  const showRepairs = has("repairs");
  const showCrm = has("contacts") || has("companies");

  const { revenue, sales, delivery, repairs, crm } = report;
  const momDelta = revenue.collectedLastMonth > 0
    ? ((revenue.collectedThisMonth - revenue.collectedLastMonth) / revenue.collectedLastMonth) * 100
    : null;

  if (!showRevenue && !showSales && !showDelivery && !showRepairs && !showCrm) {
    return (
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Reports</h2>
        <p style={subtleTextStyle}>No report sections are enabled for this account.</p>
      </section>
    );
  }

  return (
    <>
      {showRevenue && <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Revenue</h2>
        <p style={subtleTextStyle}>Rolled up from every Quote, Invoice, and Payment across this business.</p>
        <StatCardRow>
          <StatCard label="Total Invoiced" value={money(revenue.totalInvoiced)} tone="info" />
          <StatCard label="Collected" value={money(revenue.totalCollected)} tone="success" />
          <StatCard label="Outstanding" value={money(revenue.totalOutstanding)} tone={revenue.totalOutstanding > 0 ? "warning" : "success"} />
          <StatCard
            label="Collected This Month"
            value={money(revenue.collectedThisMonth)}
            hint={momDelta != null ? `${momDelta >= 0 ? "+" : ""}${Math.round(momDelta)}% vs last month` : "no data last month"}
            tone="info"
          />
          <StatCard label="Quote Acceptance Rate" value={pct(revenue.quoteAcceptanceRate)} tone="info" />
        </StatCardRow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8 }}>Invoices by status</div>
            {Object.entries(revenue.invoicesByStatus).length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No invoices yet.</span>}
            {Object.entries(revenue.invoicesByStatus).map(([status, count]) => (
              <div key={status} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                <span style={badgeStyle(INVOICE_TONE[status] ?? "neutral")}>{status}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8 }}>Quotes by status</div>
            {Object.entries(revenue.quotesByStatus).length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No quotes yet.</span>}
            {Object.entries(revenue.quotesByStatus).map(([status, count]) => (
              <div key={status} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                <span style={badgeStyle(QUOTE_TONE[status] ?? "neutral")}>{status}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>}

      {showSales && <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Sales</h2>
        <p style={subtleTextStyle}>Pipeline health across every Deal, win/loss rate, and why deals are lost.</p>
        <StatCardRow>
          <StatCard label="Open Pipeline" value={money(sales.openPipelineValue)} tone="info" />
          <StatCard label="Won (all time)" value={money(sales.wonValueAllTime)} tone="success" />
          <StatCard label="Won This Month" value={money(sales.wonValueThisMonth)} tone="success" />
          <StatCard label="Win Rate" value={pct(sales.winRate)} tone={sales.winRate != null && sales.winRate >= 0.5 ? "success" : "warning"} />
          <StatCard label="Avg Won Deal Size" value={sales.avgWonDealSize != null ? money(sales.avgWonDealSize) : "—"} tone="neutral" />
        </StatCardRow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8 }}>Deals by stage</div>
            {sales.dealsByStage.length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No deals yet.</span>}
            {sales.dealsByStage.map((s) => (
              <div key={s.stage} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{STAGE_LABEL[s.stage] ?? s.stage}</span>
                <span style={{ color: "var(--text-muted)" }}>{s.count} · {money(s.value)}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8 }}>Loss reasons</div>
            {sales.lossReasons.length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No lost deals yet.</span>}
            {sales.lossReasons.map((r) => (
              <div key={r.reason} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{r.reason}</span>
                <span style={{ color: "var(--text-muted)" }}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>}

      {showDelivery && <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Delivery</h2>
        <p style={subtleTextStyle}>Manual delivery tracking across every Order.</p>
        <StatCardRow>
          <StatCard label="Total Orders" value={String(delivery.totalOrders)} tone="info" />
          <StatCard label="Delivered Rate" value={pct(delivery.deliveredRate)} tone={delivery.deliveredRate != null && delivery.deliveredRate >= 0.8 ? "success" : "warning"} />
        </StatCardRow>
        <div style={{ maxWidth: 420 }}>
          {Object.entries(delivery.ordersByDeliveryStatus).map(([status, count]) => (
            <BreakdownBar
              key={status}
              label={DELIVERY_LABEL[status] ?? status}
              count={count}
              total={delivery.totalOrders}
              tone={status === "delivered" ? "ok" : status === "returned" ? "error" : status === "pending" ? "neutral" : "info"}
            />
          ))}
        </div>
      </section>}

      {showRepairs && <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Repairs</h2>
        <p style={subtleTextStyle}>Repair appointment throughput by status.</p>
        <StatCardRow>
          <StatCard label="Total Appointments" value={String(repairs.totalAppointments)} tone="info" />
        </StatCardRow>
        <div style={{ maxWidth: 420 }}>
          {Object.entries(repairs.appointmentsByStatus).map(([status, count]) => (
            <BreakdownBar
              key={status}
              label={REPAIR_LABEL[status] ?? status}
              count={count}
              total={repairs.totalAppointments}
              tone={status === "completed" ? "ok" : status === "cancelled" ? "error" : "info"}
            />
          ))}
        </div>
      </section>}

      {showCrm && <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>CRM Growth</h2>
        <p style={subtleTextStyle}>How fast the Contacts base is growing.</p>
        <StatCardRow>
          <StatCard label="Total Contacts" value={String(crm.totalContacts)} tone="info" />
          <StatCard label="New This Week" value={String(crm.newContactsThisWeek)} tone="success" />
          <StatCard label="New This Month" value={String(crm.newContactsThisMonth)} tone="success" />
          <StatCard label="Companies" value={String(crm.totalCompanies)} tone="neutral" />
        </StatCardRow>
      </section>}
    </>
  );
}
