"use client";

import { useEffect, useMemo, useState } from "react";

import { type BadgeTone } from "./dashboard-styles";
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

const DELIVERY_LABEL: Record<string, string> = { pending: "Pending", picked_up: "Picked up", in_transit: "In transit", delivered: "Delivered", returned: "Returned" };
const REPAIR_LABEL: Record<string, string> = { booked: "Booked", received: "Received", in_repair: "In repair", ready: "Ready", completed: "Completed", cancelled: "Cancelled" };
const INVOICE_LABEL: Record<string, string> = { draft: "Draft", issued: "Issued", partially_paid: "Part paid", paid: "Paid", overdue: "Overdue", void: "Void" };
const INVOICE_LAMP: Record<string, string> = { draft: "lamp-idle", issued: "lamp-info", partially_paid: "lamp-warn", paid: "lamp-ok", overdue: "lamp-err", void: "lamp-idle" };

const TONE_VAR: Record<BadgeTone, string> = {
  ok: "var(--success)",
  warn: "var(--warning)",
  error: "var(--danger)",
  neutral: "var(--ink-4)",
  info: "var(--info)",
  machine: "var(--machine-bright)",
};

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

/** One status row of a distribution: the label, a proportional bar in the
 * tone's own colour, the count as a reading, and the share of the whole. */
function BreakdownBar({ label, count, total, tone }: { label: string; count: number; total: number; tone: BadgeTone }) {
  const width = total > 0 ? Math.max(2, (count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ minWidth: 92, flexShrink: 0, fontSize: 12.5 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "var(--panel-sunk)", borderRadius: "var(--r-pill)", overflow: "hidden", minWidth: 40 }}>
        <div style={{ width: `${width}%`, height: "100%", background: TONE_VAR[tone], borderRadius: "var(--r-pill)" }} />
      </div>
      <span className="data" style={{ minWidth: 42, textAlign: "right", flexShrink: 0, fontWeight: 600, color: "var(--ink)" }}>{count}</span>
      <span className="meta" style={{ minWidth: 38, textAlign: "right", flexShrink: 0 }}>{pct(total > 0 ? count / total : null)}</span>
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
  const searchId = "inv-usage-search";

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Inventory usage</span>
          <div className="meta">
            Every inventory product used between {from} and {to}. Cost is what those units cost when bought; price is what the invoice billed.
          </div>
        </div>
        <div className="field" style={{ flex: "0 1 240px", minWidth: 0 }}>
          <label className="field-label" htmlFor={searchId}>Search usage</label>
          <input
            id={searchId}
            name="aiva-search-inventory-usage"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product, order or invoice number, staff member"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="panel-body">
        {!rows ? (
          <p className="meta">Loading inventory usage</p>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-title">
              {rows.length === 0 ? "No inventory used in this period" : "Nothing matches that search"}
            </span>
            <span className="empty-state-description">
              {rows.length === 0
                ? "Widen the date range above, or record parts against a repair order."
                : "Clear the search box to see all usage in this period."}
            </span>
          </div>
        ) : (
          <>
            <StatCardRow>
              <StatCard label="Units used" value={totals.qty.toLocaleString()} tone="info" />
              <StatCard label="Cost" value={money2(totals.cost)} tone="warning" />
              <StatCard label="Billed" value={money2(totals.sales)} tone="info" />
              <StatCard label="Discounts" value={money2(totals.discount)} tone={totals.discount > 0 ? "warning" : "info"} />
              <StatCard label="Profit" value={money2(totals.sales - totals.discount - totals.cost)} tone={totals.sales - totals.discount - totals.cost >= 0 ? "success" : "warning"} />
            </StatCardRow>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order / Invoice</th>
                    <th>Product</th>
                    <th className="num" style={{ textAlign: "right" }}>Qty</th>
                    <th>Used by</th>
                    <th className="num" style={{ textAlign: "right" }}>Cost each</th>
                    <th className="num" style={{ textAlign: "right" }}>Price each</th>
                    <th className="num" style={{ textAlign: "right" }}>Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={`${r.date}-${r.productId}-${i}`}>
                      <td className="data" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(r.date).toLocaleDateString()}</td>
                      <td className="data" style={{ fontSize: 12 }}>{r.invoiceNumber ?? r.orderNumber ?? <span className="meta">Not billed</span>}</td>
                      <td style={{ color: "var(--ink)" }}>{r.productName}</td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{r.quantity}</td>
                      <td>{r.usedBy}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.costPrice === null ? <span className="meta">—</span> : money2(r.costPrice)}</td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{money2(r.sellPrice)}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.discount > 0 ? `-${money2(r.discount)}` : <span className="meta">—</span>}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ background: "var(--panel-sunk)", fontWeight: 600, color: "var(--ink)" }}>
                      Totals
                    </td>
                    <td className="num" style={{ textAlign: "right", background: "var(--panel-sunk)", fontWeight: 600, color: "var(--ink)", borderTop: "2px solid var(--line-strong)" }}>
                      {totals.qty}
                    </td>
                    <td style={{ background: "var(--panel-sunk)", borderTop: "2px solid var(--line-strong)" }} />
                    <td className="num" style={{ textAlign: "right", background: "var(--panel-sunk)", fontWeight: 600, color: "var(--ink)", borderTop: "2px solid var(--line-strong)" }}>
                      {money2(totals.cost)}
                    </td>
                    <td className="num" style={{ textAlign: "right", background: "var(--panel-sunk)", fontWeight: 600, color: "var(--ink)", borderTop: "2px solid var(--line-strong)" }}>
                      {money2(totals.sales)}
                    </td>
                    <td className="num" style={{ textAlign: "right", background: "var(--panel-sunk)", fontWeight: 600, color: "var(--ink)", borderTop: "2px solid var(--line-strong)" }}>
                      {money2(totals.discount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="meta" style={{ marginTop: 8 }}>
              Amounts in {money(0).replace(/0$/, "")}, per unit unless marked otherwise.
            </div>
          </>
        )}
      </div>
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
  }, [businessId, active, from, to, range, customFrom, customTo, locationId]);

  if (!report) {
    return (
      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <span className="instrument-label">Reports</span>
        </div>
        <div className="panel-body">
          <p className="meta">Loading reports</p>
        </div>
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
  const period = `${from} to ${to}`;
  const invoiceStatusTotal = Object.values(revenue.invoicesByStatus).reduce((sum, n) => sum + n, 0);

  return (
    <>
      <RemovableSection id="reports.summary" hidden={isHidden("reports.summary")} editable={editable} onToggle={toggle}><section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head" style={{ flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <span className="instrument-label">Summary</span>
            <div className="meta">Revenue, appointments, and profit, priced off each appointment&apos;s own parts and services.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ flexShrink: 0 }}>
              <label className="field-label" htmlFor="rep-range">Period</label>
              <select id="rep-range" value={range} onChange={(e) => setRange(e.target.value as RangeId)}>
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            {businessId && locations.length > 0 && (
              <div className="field" style={{ flexShrink: 0 }}>
                <label className="field-label" htmlFor="rep-location">Location</label>
                <select id="rep-location" value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value || undefined)}>
                  <option value="">All locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}
            {range === "custom" && (
              <>
                <div className="field" style={{ flexShrink: 0 }}>
                  <label className="field-label" htmlFor="rep-from">From</label>
                  <input id="rep-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div className="field" style={{ flexShrink: 0 }}>
                  <label className="field-label" htmlFor="rep-to">To</label>
                  <input id="rep-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="panel-body">
          <div className="meta" style={{ marginBottom: 10 }}>Period {period}</div>
          <StatCardRow>
            <StatCard label="Total revenue" value={money(summary.totalRevenue)} tone="info" />
            <StatCard label="Appointments booked" value={String(summary.appointmentsBooked)} tone="info" />
            <StatCard label="Appointments successful" value={String(summary.appointmentsSuccess)} tone="success" />
            <StatCard label="Total cost" value={money(summary.totalCost)} tone="warning" />
            <StatCard label="Total profit" value={money(summary.totalProfit)} tone={summary.totalProfit >= 0 ? "success" : "warning"} />
          </StatCardRow>
        </div>
      </section></RemovableSection>

      {showRevenue && <RemovableSection id="reports.revenue" hidden={isHidden("reports.revenue")} editable={editable} onToggle={toggle}><section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <span className="instrument-label">Revenue</span>
            <div className="meta">Rolled up from every invoice and payment. All time unless marked otherwise.</div>
          </div>
        </div>
        <div className="panel-body">
          <StatCardRow>
            <StatCard label="Total invoiced" value={money(revenue.totalInvoiced)} tone="info" />
            <StatCard label="Collected" value={money(revenue.totalCollected)} tone="success" />
            <StatCard label="Outstanding" value={money(revenue.totalOutstanding)} tone={revenue.totalOutstanding > 0 ? "warning" : "success"} />
            <StatCard
              label="Collected this month"
              value={money(revenue.collectedThisMonth)}
              hint={momDelta != null ? `${momDelta >= 0 ? "+" : ""}${Math.round(momDelta)}% vs last month` : "no data last month"}
              tone={momDelta == null ? "neutral" : momDelta >= 0 ? "success" : "warning"}
            />
          </StatCardRow>
          <div className="instrument-label" style={{ marginBottom: 8 }}>Invoices by status</div>
          {invoiceStatusTotal === 0 ? (
            <div className="empty-state">
              <span className="empty-state-title">No invoices yet</span>
              <span className="empty-state-description">Generate an invoice from a repair order, or add one by hand.</span>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th className="num" style={{ textAlign: "right" }}>Invoices</th>
                    <th className="num" style={{ textAlign: "right" }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(revenue.invoicesByStatus).map(([status, count]) => (
                    <tr key={status}>
                      <td>
                        <span className={`lamp ${INVOICE_LAMP[status] ?? "lamp-idle"}`}>{INVOICE_LABEL[status] ?? status}</span>
                      </td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{count}</td>
                      <td className="num" style={{ textAlign: "right" }}>{pct(invoiceStatusTotal > 0 ? count / invoiceStatusTotal : null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section></RemovableSection>}

      {showDelivery && <RemovableSection id="reports.delivery" hidden={isHidden("reports.delivery")} editable={editable} onToggle={toggle}><section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <span className="instrument-label">Delivery</span>
            <div className="meta">Orders by shipment status, tracked manually. All time.</div>
          </div>
        </div>
        <div className="panel-body">
          <StatCardRow>
            <StatCard label="Total orders" value={String(delivery.totalOrders)} tone="info" />
            <StatCard label="Delivered rate" value={pct(delivery.deliveredRate)} tone={delivery.deliveredRate != null && delivery.deliveredRate >= 0.8 ? "success" : "warning"} />
          </StatCardRow>
          <div style={{ maxWidth: 460 }}>
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
        </div>
      </section></RemovableSection>}

      {showRepairs && <RemovableSection id="reports.repairs" hidden={isHidden("reports.repairs")} editable={editable} onToggle={toggle}><section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <span className="instrument-label">Repairs</span>
            <div className="meta">Repair appointments by how far each one got. All time.</div>
          </div>
        </div>
        <div className="panel-body">
          <StatCardRow>
            <StatCard label="Total appointments" value={String(repairs.totalAppointments)} tone="info" />
          </StatCardRow>
          <div style={{ maxWidth: 460 }}>
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
        </div>
      </section></RemovableSection>}

      {showCrm && <RemovableSection id="reports.crm" hidden={isHidden("reports.crm")} editable={editable} onToggle={toggle}><section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <span className="instrument-label">CRM growth</span>
            <div className="meta">How fast the contacts base is growing.</div>
          </div>
        </div>
        <div className="panel-body">
          <StatCardRow>
            <StatCard label="Total contacts" value={String(crm.totalContacts)} tone="info" />
            <StatCard label="New this week" value={String(crm.newContactsThisWeek)} tone="success" />
            <StatCard label="New this month" value={String(crm.newContactsThisMonth)} tone="success" />
          </StatCardRow>
        </div>
      </section></RemovableSection>}

      {businessId && has("inventory") && <RemovableSection id="reports.inventory" hidden={isHidden("reports.inventory")} editable={editable} onToggle={toggle}>
        <InventoryUsageSection businessId={businessId} from={from} to={to} active={active} money={money} />
      </RemovableSection>}
    </>
  );
}