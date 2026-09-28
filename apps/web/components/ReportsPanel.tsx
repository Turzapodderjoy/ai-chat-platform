"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";
import { RemovableSection } from "./RemovableSection";
import { useCurrencySymbol } from "../lib/currency";

interface OverviewReport {
  summary: {
    totalRevenue: number;
    appointmentsBooked: number;
    appointmentsSuccess: number;
    totalCost: number;
    totalProfit: number;
  };
  revenue: {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    collectedThisMonth: number;
    collectedLastMonth: number;
    invoicesByStatus: Record<string, number>;
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
  };
  generatedAt: string;
}

const DELIVERY_LABEL: Record<string, string> = { pending: "Pending", picked_up: "Picked Up", in_transit: "In Transit", delivered: "Delivered", returned: "Returned" };
const REPAIR_LABEL: Record<string, string> = { booked: "Booked", received: "Received", in_repair: "In Repair", ready: "Ready", completed: "Completed", cancelled: "Cancelled" };
const INVOICE_TONE: Record<string, BadgeTone> = { draft: "neutral", issued: "info", partially_paid: "warn", paid: "ok", overdue: "error", void: "neutral" };

const RANGE_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "1m", label: "Last month" },
  { id: "6m", label: "Last 6 months" },
  { id: "custom", label: "Custom" },
] as const;
type RangeId = (typeof RANGE_OPTIONS)[number]["id"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeFor(id: RangeId, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const to = isoDate(now);
  if (id === "today") return { from: to, to };
  if (id === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: isoDate(d), to };
  }
  if (id === "1m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return { from: isoDate(d), to };
  }
  if (id === "6m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    return { from: isoDate(d), to };
  }
  return { from: customFrom || to, to: customTo || to };
}

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function moneyWith(currency: string) {
  return (n: number): string => `${currency}${Math.round(n).toLocaleString()}`;
}

function BreakdownBar({ label, count, total, tone }: { label: string; count: number; total: number; tone: BadgeTone }) {
  const width = total > 0 ? Math.max(2, (count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
      <span style={{ minWidth: 80, flexShrink: 0, color: "var(--text-muted)" }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: "var(--surface)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: `var(--${tone === "ok" ? "success" : tone === "error" ? "danger" : tone === "warn" ? "warning" : "accent"})` }} />
      </div>
      <span style={{ minWidth: 28, width: "auto", textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </div>
  );
}

interface InventoryUsageRow {
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  orderNumber: string | null;
  invoiceNumber: string | null;
  usedBy: string;
  costPrice: number | null;
  sellPrice: number;
  discount: number;
}

/** Which inventory products were used, in what quantity, on which
 * order/invoice, by whom -- with the cost each unit carried (from the
 * stock lot it came out of) against the price billed, and any discount. */
function InventoryUsageSection({ businessId, from, to, active, money }: { businessId: string; from: string; to: string; active: boolean; money: (n: number) => string }) {
  const [rows, setRows] = useState<InventoryUsageRow[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!active) return;
    function load() {
      const params = new URLSearchParams({ businessId, from, to });
      fetch(`/api/admin/reports/inventory?${params.toString()}`)
        .then((r) => r.json())
        .then((d: { rows?: InventoryUsageRow[] }) => setRows(d.rows ?? []))
        .catch(() => setRows((prev) => prev ?? []));
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [businessId, from, to, active]);

  const visible = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return rows ?? [];
    return (rows ?? []).filter((r) => {
      const hay = `${r.productName} ${r.orderNumber ?? ""} ${r.invoiceNumber ?? ""} ${r.usedBy}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, search]);

  const money2 = (n: number) => `${money(0).replace(/0$/, "")}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const totals = visible.reduce(
    (t, r) => ({ qty: t.qty + r.quantity, cost: t.cost + (r.costPrice ?? 0) * r.quantity, sales: t.sales + r.sellPrice * r.quantity, discount: t.discount + r.discount }),
    { qty: 0, cost: 0, sales: 0, discount: 0 }
  );

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Inventory Usage</h2>
        <input
          name="aiva-search-inventory-usage"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, order/invoice #, user…"
          autoComplete="off"
          style={{ padding: "6px 8px", fontSize: 12.5, minWidth: 220 }}
        />
      </div>
      <p style={subtleTextStyle}>Every inventory product used in the selected period. Cost is what those units cost when bought (each restock lot keeps its own cost); price is what the invoice billed.</p>
      {!rows ? (
        <p style={subtleTextStyle}>Loading…</p>
      ) : visible.length === 0 ? (
        <p style={subtleTextStyle}>No inventory used in this period.</p>
      ) : (
        <>
          <StatCardRow>
            <StatCard label="Units Used" value={totals.qty.toLocaleString()} tone="info" />
            <StatCard label="Cost" value={money2(totals.cost)} tone="warning" />
            <StatCard label="Billed" value={money2(totals.sales)} tone="info" />
            <StatCard label="Discounts" value={money2(totals.discount)} tone={totals.discount > 0 ? "warning" : "info"} />
            <StatCard label="Profit" value={money2(totals.sales - totals.discount - totals.cost)} tone={totals.sales - totals.discount - totals.cost >= 0 ? "success" : "warning"} />
          </StatCardRow>
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Date", "Order / Invoice #", "Product", "Qty", "Used by", "Cost (each)", "Price (each)", "Discount"].map((h) => (
                    <th key={h} style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={`${r.date}-${r.productId}-${i}`}>
                    <td style={cellStyle}>{new Date(r.date).toLocaleDateString()}</td>
                    <td style={cellStyle}>{r.invoiceNumber ?? r.orderNumber ?? "—"}</td>
                    <td style={cellStyle}>{r.productName}</td>
                    <td style={cellStyle}>{r.quantity}</td>
                    <td style={cellStyle}>{r.usedBy}</td>
                    <td style={cellStyle}>{r.costPrice === null ? "—" : money2(r.costPrice)}</td>
                    <td style={cellStyle}>{money2(r.sellPrice)}</td>
                    <td style={cellStyle}>{r.discount > 0 ? `-${money2(r.discount)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** HubSpot-style cross-domain reporting — one read-only rollup over
 * Revenue, Delivery (Order tracking), Repairs, and CRM growth, all
 * pulled from the same records every other panel already writes to.
 * The top Summary row is the only date-ranged part (see the dropdown);
 * everything below it stays all-time/this-month, same as before. See
 * ReportingService.getOverview for the actual aggregation. */
export function ReportsPanel({
  businessId,
  active = true,
  allowedPanels = null,
  hiddenWidgets = [],
  editable = false,
  onToggleWidget,
}: {
  businessId?: string;
  active?: boolean;
  // null = unrestricted (admin/mother dashboard) — every section shows.
  // A real client session's own allowedPanels (see ClientAccessPanel) --
  // a section only renders if the feature it's built from is still
  // ticked, so a client who's had e.g. Invoices unchecked never sees
  // Revenue numbers derived from a feature they can't otherwise open
  // and verify.
  allowedPanels?: string[] | null;
  /** Per-business admin "remove this box" list (see RemovableSection) —
   * on top of the coarser allowedPanels gate above. */
  hiddenWidgets?: string[];
  editable?: boolean;
  onToggleWidget?: (widgetId: string, hide: boolean) => void;
}) {
  const [report, setReport] = useState<OverviewReport | null>(null);
  const [range, setRange] = useState<RangeId>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const money = moneyWith(useCurrencySymbol(businessId ?? ""));

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/admin/locations?businessId=${businessId}`)
      .then((r) => r.json())
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => setLocations([]));
  }, [businessId]);

  const isHidden = (id: string) => hiddenWidgets.includes(id);
  const toggle = (id: string, hide: boolean) => onToggleWidget?.(id, hide);

  const { from, to } = useMemo(() => rangeFor(range, customFrom, customTo), [range, customFrom, customTo]);

  useEffect(() => {
    if (!active) return;
    if (range === "custom" && (!customFrom || !customTo)) return;
    function load() {
      const params = new URLSearchParams({ from, to });
      if (businessId) params.set("businessId", businessId);
      if (locationId) params.set("locationId", locationId);
      fetch(`/api/admin/reports/overview?${params.toString()}`)
        .then((r) => r.json())
        .then(setReport);
    }
    load();
    // Revenue/cost/profit here depend on Invoices, Orders, and Inventory
    // -- all of which can change from a different tab without this one
    // ever remounting. setReport never nulls first, so this is a silent
    // background refresh, not a loading flash.
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [businessId, active, from, to, range, customFrom, customTo]);

  if (!report) {
    return (
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Reports</h2>
        <p style={subtleTextStyle}>Loading…</p>
      </section>
    );
  }

  const has = (id: string) => allowedPanels === null || allowedPanels.includes(id);
  const showRevenue = has("invoices");
  const showDelivery = has("delivery");
  const showRepairs = has("repairs");
  const showCrm = has("contacts");

  const { summary, revenue, delivery, repairs, crm } = report;
  const momDelta = revenue.collectedLastMonth > 0
    ? ((revenue.collectedThisMonth - revenue.collectedLastMonth) / revenue.collectedLastMonth) * 100
    : null;

  return (
    <>
      <RemovableSection id="reports.summary" hidden={isHidden("reports.summary")} editable={editable} onToggle={toggle}><section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Summary</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={range} onChange={(e) => setRange(e.target.value as RangeId)} style={{ padding: "6px 8px", fontSize: 12.5 }}>
              {RANGE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {businessId && locations.length > 0 && (
              <select value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value || undefined)} style={{ padding: "6px 8px", fontSize: 12.5, minWidth: 160 }}>
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            )}
            {range === "custom" && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ padding: 6, fontSize: 12.5 }} />
                <span style={{ color: "var(--text-faint)", fontSize: 12.5 }}>to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ padding: 6, fontSize: 12.5 }} />
              </>
            )}
          </div>
        </div>
        <p style={subtleTextStyle}>Revenue, appointments, and profit for the selected period — priced off each appointment's own parts/services.</p>
        <StatCardRow>
          <StatCard label="Total Revenue" value={money(summary.totalRevenue)} tone="info" />
          <StatCard label="Appointments Booked" value={String(summary.appointmentsBooked)} tone="info" />
          <StatCard label="Appointments Success" value={String(summary.appointmentsSuccess)} tone="success" />
          <StatCard label="Total Cost" value={money(summary.totalCost)} tone="warning" />
          <StatCard label="Total Profit" value={money(summary.totalProfit)} tone={summary.totalProfit >= 0 ? "success" : "warning"} />
        </StatCardRow>
      </section></RemovableSection>

      {showRevenue && <RemovableSection id="reports.revenue" hidden={isHidden("reports.revenue")} editable={editable} onToggle={toggle}><section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Revenue</h2>
        <p style={subtleTextStyle}>Rolled up from every Invoice and Payment across this business.</p>
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
        </div>
      </section></RemovableSection>}

      {showDelivery && <RemovableSection id="reports.delivery" hidden={isHidden("reports.delivery")} editable={editable} onToggle={toggle}><section style={cardStyle}>
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
      </section></RemovableSection>}

      {showRepairs && <RemovableSection id="reports.repairs" hidden={isHidden("reports.repairs")} editable={editable} onToggle={toggle}><section style={cardStyle}>
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
      </section></RemovableSection>}

      {showCrm && <RemovableSection id="reports.crm" hidden={isHidden("reports.crm")} editable={editable} onToggle={toggle}><section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>CRM Growth</h2>
        <p style={subtleTextStyle}>How fast the Contacts base is growing.</p>
        <StatCardRow>
          <StatCard label="Total Contacts" value={String(crm.totalContacts)} tone="info" />
          <StatCard label="New This Week" value={String(crm.newContactsThisWeek)} tone="success" />
          <StatCard label="New This Month" value={String(crm.newContactsThisMonth)} tone="success" />
        </StatCardRow>
      </section></RemovableSection>}

      {businessId && has("inventory") && <RemovableSection id="reports.inventory" hidden={isHidden("reports.inventory")} editable={editable} onToggle={toggle}>
        <InventoryUsageSection businessId={businessId} from={from} to={to} active={active} money={money} />
      </RemovableSection>}
    </>
  );
}
