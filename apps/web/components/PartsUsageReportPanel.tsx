"use client";

import { useEffect, useMemo, useState } from "react";

import { StatCard, StatCardRow } from "./StatCard";
import { useCurrencySymbol } from "../lib/currency";
import { showConfirm } from "../lib/app-dialog";

interface PartsUsageItem {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  orderId: string;
  trackingToken: string;
  customerName: string;
  costPrice: number | null;
  sellingPrice: number;
  date: string;
  usedBy: string | null;
}

interface PartsUsageReport {
  items: PartsUsageItem[];
  totalCost: number;
  totalSelling: number;
  generatedAt: string;
}

const RANGE_OPTIONS = [
  { id: "all", label: "All time" },
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

function rangeFor(id: RangeId, customFrom: string, customTo: string): { from?: string; to?: string } {
  if (id === "all") return {};
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
  return { from: customFrom || undefined, to: customTo || undefined };
}

const PAGE_SIZE = 25;

export function PartsUsageReportPanel({ businessId, accountRole, active = true }: { businessId: string; accountRole?: string | null; active?: boolean }) {
  const currency = useCurrencySymbol(businessId);
  const [report, setReport] = useState<PartsUsageReport | null>(null);
  const [range, setRange] = useState<RangeId>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canDelete = accountRole === "owner" || accountRole === "admin";

  async function deleteItem(item: PartsUsageItem) {
    if (!(await showConfirm(`Delete "${item.name}" from this repair order? It will move to Deleted Data.`))) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/repairs/order-items?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (res.ok) refresh();
    } finally {
      setBusyId(null);
    }
  }

  function refresh() {
    const params = new URLSearchParams({ businessId });
    const r = rangeFor(range, customFrom, customTo);
    if (r.from) params.set("from", r.from);
    if (r.to) params.set("to", r.to);
    fetch(`/api/admin/reports/parts-usage?${params.toString()}`)
      .then((r) => r.json())
      .then(setReport);
  }

  useEffect(() => {
    if (!active) return;
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active, range, customFrom, customTo]);

  const filtered = useMemo(() => {
    if (!report) return [];
    if (!search.trim()) return report.items;
    const q = search.toLowerCase();
    return report.items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.trackingToken.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q) ||
        (i.usedBy && i.usedBy.toLowerCase().includes(q))
    );
  }, [report, search]);

  const paged = useMemo(() => filtered.slice(offset, offset + PAGE_SIZE), [filtered, offset]);

  if (!report) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Parts usage</span>
        </div>
        <div className="panel-body">
          <p className="meta">Loading parts usage</p>
        </div>
      </section>
    );
  }

  const margin = report.totalSelling - report.totalCost;

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Parts usage</span>
          <div className="meta">
            Every part and service booked to a repair order, with the cost and the price charged. Amounts in {currency}.
          </div>
        </div>
      </div>

      <div className="panel-body">
        <StatCardRow>
          <StatCard label="Items used" value={report.items.length} />
          <StatCard label="Cost total" value={`${currency}${report.totalCost.toFixed(2)}`} />
          <StatCard label="Selling total" value={`${currency}${report.totalSelling.toFixed(2)}`} />
          <StatCard label="Margin" value={`${currency}${margin.toFixed(2)}`} tone={margin >= 0 ? "success" : "danger"} />
        </StatCardRow>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="field" style={{ width: 170 }}>
            <label className="field-label" htmlFor="pu-range">Period</label>
            <select
              id="pu-range"
              value={range}
              onChange={(e) => {
                setRange(e.target.value as RangeId);
                setOffset(0);
              }}
            >
              {RANGE_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {range === "custom" && (
            <>
              <div className="field" style={{ width: 150 }}>
                <label className="field-label" htmlFor="pu-from">From</label>
                <input
                  id="pu-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setOffset(0);
                  }}
                />
              </div>
              <div className="field" style={{ width: 150 }}>
                <label className="field-label" htmlFor="pu-to">To</label>
                <input
                  id="pu-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setOffset(0);
                  }}
                />
              </div>
            </>
          )}
          <div className="field" style={{ flex: "1 1 220px", maxWidth: 420, minWidth: 0, marginLeft: "auto" }}>
            <label className="field-label" htmlFor="pu-search">Search usage</label>
            <input
              id="pu-search"
              type="search"
              name="aiva-search-parts-usage"
              autoComplete="off"
              placeholder="Item, order, customer, staff"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>
        </div>

        {paged.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-title">
              {report.items.length === 0 ? "No parts or services used yet" : "No usage matches that search"}
            </span>
            <span className="empty-state-description">
              {report.items.length === 0
                ? "Parts and services booked to a repair order show up here."
                : "Clear the search box to see every booked line."}
            </span>
          </div>
        ) : (
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th className="num" style={{ textAlign: "right" }}>Qty</th>
                  <th>Order</th>
                  <th className="num" style={{ textAlign: "right" }}>Cost</th>
                  <th className="num" style={{ textAlign: "right" }}>Selling</th>
                  <th>Date</th>
                  <th>Used by</th>
                  {canDelete && <th />}
                </tr>
              </thead>
              <tbody>
                {paged.map((item) => (
                  <tr key={item.id}>
                    <td style={{ color: "var(--ink)" }}>{item.name}</td>
                    <td>
                      <span className="meta">{item.kind === "part" ? "Part" : "Service"}</span>
                    </td>
                    <td className="data num" style={{ textAlign: "right" }}>{item.quantity}</td>
                    <td>
                      <span className="data" style={{ fontSize: 12 }}>{item.trackingToken}</span>
                      <div className="meta">{item.customerName}</div>
                    </td>
                    <td className="data num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                      {item.costPrice != null ? `${currency}${item.costPrice.toFixed(2)}` : <span className="meta">Not set</span>}
                    </td>
                    <td className="data num" style={{ textAlign: "right", color: "var(--ink)" }}>
                      {currency}{item.sellingPrice.toFixed(2)}
                    </td>
                    <td className="data" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      {new Date(item.date).toLocaleDateString()}
                    </td>
                    <td>
                      {item.usedBy ?? <span className="meta">Not recorded</span>}
                    </td>
                    {canDelete && (
                      <td>
                        <button
                          type="button"
                          className="ghost sm"
                          onClick={() => deleteItem(item)}
                          disabled={busyId === item.id}
                          aria-label={`Delete ${item.name} from this repair order`}
                          title="Delete this item"
                          style={{ color: "var(--danger)" }}
                        >
                          {busyId === item.id ? "Deleting" : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button type="button" className="sm" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
              Previous 25
            </button>
            <span className="meta">
              <span className="data">{offset + 1}</span> to{" "}
              <span className="data">{Math.min(offset + PAGE_SIZE, filtered.length)}</span> of{" "}
              <span className="data">{filtered.length}</span>
            </span>
            <button type="button" className="sm" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= filtered.length}>
              Next 25
            </button>
          </div>
        )}

        <p className="meta" style={{ marginTop: 12 }}>
          Last refreshed <span className="data">{new Date(report.generatedAt).toLocaleTimeString()}</span>
        </p>
      </div>
    </section>
  );
}