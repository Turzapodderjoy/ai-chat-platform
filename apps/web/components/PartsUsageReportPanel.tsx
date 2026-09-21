"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";
import { useCurrencySymbol } from "../lib/currency";

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

export function PartsUsageReportPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const currency = useCurrencySymbol(businessId);
  const [report, setReport] = useState<PartsUsageReport | null>(null);
  const [range, setRange] = useState<RangeId>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

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
    return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading parts usage...</div>;
  }

  const KIND_TONE: Record<string, BadgeTone> = { part: "info", service: "neutral" };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: "0 0 16px" }}>Parts Usage Report</h2>

      {/* Summary cards */}
      <StatCardRow>
        <StatCard label="Total Items Used" value={report.items.length} />
        <StatCard label="Total Cost" value={`${currency}${report.totalCost.toFixed(2)}`} tone={report.totalCost > 0 ? "warning" : undefined} />
        <StatCard label="Total Selling" value={`${currency}${report.totalSelling.toFixed(2)}`} tone="success" />
        <StatCard label="Profit" value={`${currency}${(report.totalSelling - report.totalCost).toFixed(2)}`} tone={report.totalSelling - report.totalCost >= 0 ? "success" : "danger"} />
      </StatCardRow>

      {/* Filters */}
      <div style={{ ...cardStyle, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => { setRange(r.id); setOffset(0); }}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: range === r.id ? "var(--accent)" : "var(--surface)",
                color: range === r.id ? "#fff" : "var(--text)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setOffset(0); }} style={{ padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--text)" }} />
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setOffset(0); }} style={{ padding: "5px 8px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--text)" }} />
          </>
        )}
        <input
          type="text"
          placeholder="Search items, orders, customers..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          style={{ padding: "5px 10px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--text)", minWidth: 200, marginLeft: "auto" }}
        />
      </div>

      {/* Table */}
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Item</th>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>Type</th>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>Qty</th>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>Order</th>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>Cost</th>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>Selling</th>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>Date</th>
                <th style={{ ...cellStyle, padding: "10px 12px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>Used By</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                    {report.items.length === 0 ? "No parts or services used yet." : "No results match your search."}
                  </td>
                </tr>
              )}
              {paged.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border-subtle, var(--border))" }}>
                  <td style={{ ...cellStyle, padding: "8px 12px", color: "var(--text)" }}>{item.name}</td>
                  <td style={{ ...cellStyle, padding: "8px 12px" }}>
                    <span style={badgeStyle(KIND_TONE[item.kind] ?? "neutral")}>{item.kind}</span>
                  </td>
                  <td style={{ ...cellStyle, padding: "8px 12px", color: "var(--text)" }}>{item.quantity}</td>
                  <td style={{ ...cellStyle, padding: "8px 12px", color: "var(--text)" }}>
                    <span title={item.orderId} style={{ fontFamily: "monospace", fontSize: 11 }}>{item.trackingToken}</span>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.customerName}</div>
                  </td>
                  <td style={{ ...cellStyle, padding: "8px 12px", color: "var(--text)" }}>
                    {item.costPrice != null ? `${currency}${item.costPrice.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ ...cellStyle, padding: "8px 12px", color: "var(--text)", fontWeight: 500 }}>
                    {currency}{item.sellingPrice.toFixed(2)}
                  </td>
                  <td style={{ ...cellStyle, padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                    {new Date(item.date).toLocaleDateString()}
                  </td>
                  <td style={{ ...cellStyle, padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                    {item.usedBy ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: offset === 0 ? "default" : "pointer", opacity: offset === 0 ? 0.5 : 1, fontFamily: "inherit" }}
          >
            Previous
          </button>
          <span style={{ padding: "6px 10px", fontSize: 12, color: "var(--text-muted)" }}>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= filtered.length}
            style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: offset + PAGE_SIZE >= filtered.length ? "default" : "pointer", opacity: offset + PAGE_SIZE >= filtered.length ? 0.5 : 1, fontFamily: "inherit" }}
          >
            Next
          </button>
        </div>
      )}

      <p style={{ ...subtleTextStyle, marginTop: 12 }}>Last refreshed: {new Date(report.generatedAt).toLocaleTimeString()}</p>
    </div>
  );
}
