"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { StatCard, StatCardRow } from "./StatCard";
import { OrderItemsEditor, type RepairOrder } from "./OrderManagementPanel";
import { WalkInDialog } from "./WalkInDialog";
import { RefillDialog } from "./RefillDialog";
import { InventoryPanel } from "./InventoryPanel";
import { useCurrencySymbol } from "../lib/currency";

interface Appointment {
  id: string;
  businessId: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  email?: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
  status: string;
  priority: string;
  technicianId?: string;
  totalOverride?: number;
  isWalkIn?: boolean;
  source?: string;
  serialNumber?: string;
  contactId?: string;
  createdAt: string;
  items: {
    id: string;
    repairAppointmentId: string;
    productId?: string;
    kind: "part" | "service";
    name: string;
    quantity: number;
    defaultPrice: number;
    overridePrice?: number;
    finalPrice: number;
  }[];
}

interface Product {
  id: string;
  name: string;
  price: string | null;
  costPrice: string | null;
  stock: string | null;
  minStock: number;
  sku: string | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  balanceDue: number;
  repairAppointmentId: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

// The work queue is the same five live stages the board uses everywhere
// else — "cancelled" is a dead end, so it never earns a column.
const STAGES = ["booked", "received", "in_repair", "ready", "completed"] as const;

const STATUS_LABEL: Record<string, string> = {
  booked: "New",
  received: "Received",
  in_repair: "In repair",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_LAMP: Record<string, string> = {
  booked: "lamp-info",
  received: "lamp-idle",
  in_repair: "lamp-warn",
  ready: "lamp-ok",
  completed: "lamp-ok",
  cancelled: "lamp-err",
};

const PRIORITY_LABEL: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

const PRIORITY_LAMP: Record<string, string> = {
  low: "lamp-idle",
  normal: "lamp-idle",
  high: "lamp-warn",
  urgent: "lamp-err",
};

// The card's left edge carries urgency; everything else is neutral ink.
const PRIORITY_EDGE: Record<string, string> = {
  low: "var(--line)",
  normal: "var(--line)",
  high: "var(--warning)",
  urgent: "var(--danger)",
};

// One labeled step forward, so the board's quick action is never a guess.
const NEXT_STAGE: Record<string, string> = {
  booked: "received",
  received: "in_repair",
  in_repair: "ready",
  ready: "completed",
};

const cardStyle: CSSProperties = {
  padding: "11px 12px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "var(--panel)",
  cursor: "pointer",
  transition: "background var(--dur-state) ease, border-color var(--dur-state) ease",
};

const columnStyle: CSSProperties = {
  minWidth: 258,
  flex: 1,
  display: "flex",
  flexDirection: "column",
};

const columnBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: 1,
  overflowY: "auto",
  background: "var(--panel-sunk)",
  borderRadius: "var(--r-sm)",
  padding: 6,
  border: "1px solid var(--line-soft)",
  minHeight: 120,
  maxHeight: "min(60vh, 560px)",
};

const drawerStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "60%",
  minWidth: 500,
  maxWidth: 820,
  zIndex: 100,
  background: "var(--canvas)",
  borderLeft: "1px solid var(--line)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "var(--shadow-pop)",
};

const specGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
  gap: 1,
  marginBottom: 18,
  background: "var(--line-soft)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
  overflow: "hidden",
};

const specCellStyle: CSSProperties = { padding: "9px 12px", background: "var(--panel)", minWidth: 0 };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(Math.abs(diff) / 60000);
  const span = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
  // A drop-off can be scheduled for the future, so "ago" isn't always true.
  return diff < 0 ? `in ${span}` : `${span} ago`;
}

function costOf(a: Appointment): number {
  return a.totalOverride ?? a.items.reduce((sum, i) => sum + i.finalPrice, 0);
}

// Byte-for-byte the same rule as the server's products.countLowStock — the
// number the "Low stock" stat and the sidebar badge both show — so the stat
// and the rail list can never disagree. Blank stock and explicit "out of
// stock" rows are excluded there too.
function isLowStock(p: Product): boolean {
  if (!p.stock || !p.stock.trim() || /out/i.test(p.stock)) return false;
  if (!p.minStock || p.minStock <= 0) return false;
  const qty = parseInt(p.stock, 10);
  return !isNaN(qty) && qty <= p.minStock;
}

/** The repair shop's Home surface: one screen that reads the whole shop at
 * a glance and lets staff work it without ever leaving the page — intake
 * stats, the live work queue, an inventory glance that expands to the full
 * stock record, and billing straight off a finished repair. Deliberately
 * self-contained (it reuses the shared APIs and sub-components, but owns
 * its own layout) so it can sit as a repair client's landing tab without
 * changing the classic Repairs board. */
export function RepairConsolePanel({
  businessId,
  clientName,
  active = true,
  onNavigate,
}: {
  businessId: string;
  clientName?: string;
  active?: boolean;
  onNavigate?: (tab: string) => void;
}) {
  const currency = useCurrencySymbol(businessId);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [lowStock, setLowStock] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [refillFor, setRefillFor] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/admin/products?businessId=${encodeURIComponent(businessId)}&limit=200`)
      .then((r) => r.json())
      .then((d: { products: Product[] }) => setProducts(d.products ?? []))
      .catch(() => {});
    fetch(`/api/admin/staff?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { staff: StaffMember[] }) => setStaff(d.staff ?? []))
      .catch(() => {});
  }, [businessId]);

  function refresh() {
    const qs = `?businessId=${encodeURIComponent(businessId)}`;
    fetch(`/api/admin/repairs${qs}`)
      .then((r) => r.json())
      .then((d: { appointments: Appointment[] }) => setAppointments(d.appointments ?? []))
      .catch(() => {});
    fetch(`/api/admin/revenue/invoices${qs}`)
      .then((r) => r.json())
      .then((d: { invoices: InvoiceRow[] }) => setInvoices(d.invoices ?? []))
      .catch(() => {});
    fetch(`/api/admin/products/low-stock?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { count?: number }) => setLowStock(d.count ?? 0))
      .catch(() => {});
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  const selected = appointments?.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId) setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const billedRepairIds = useMemo(
    () => new Set(invoices.map((i) => i.repairAppointmentId).filter(Boolean) as string[]),
    [invoices],
  );
  const lowParts = useMemo(() => products.filter(isLowStock), [products]);

  const visible = useMemo(() => {
    let list = (appointments ?? []).filter((a) => a.status !== "cancelled");
    const q = search.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      list = list.filter((a) =>
        words.every((w) =>
          [a.customerName, a.phone, a.deviceType, a.deviceModel ?? "", a.issueDescription, a.serialNumber ?? "", a.trackingToken]
            .map((f) => f.toLowerCase())
            .some((f) => f.includes(w)),
        ),
      );
    }
    return list;
  }, [appointments, search]);

  const columns = useMemo(() => {
    const cols: Record<(typeof STAGES)[number], Appointment[]> = { booked: [], received: [], in_repair: [], ready: [], completed: [] };
    for (const a of visible) cols[a.status as (typeof STAGES)[number]]?.push(a);
    return cols;
  }, [visible]);

  const stats = useMemo(() => {
    const all = appointments ?? [];
    const active = all.filter((a) => a.status !== "completed" && a.status !== "cancelled");
    const intake = all.filter((a) => a.status === "booked" || a.status === "received");
    const inRepair = all.filter((a) => a.status === "in_repair");
    const finishing = all.filter((a) => a.status === "ready");
    const unbilled = all.filter((a) => a.status === "completed" && a.items.length > 0 && !billedRepairIds.has(a.id));
    return { activeCount: active.length, intakeCount: intake.length, inRepairCount: inRepair.length, finishingCount: finishing.length, unbilled };
  }, [appointments, billedRepairIds]);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await fetch("/api/admin/repairs/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function updateField(id: string, patch: Record<string, unknown>) {
    await fetch("/api/admin/repairs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    refresh();
  }

  async function generateInvoice(a: Appointment) {
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/admin/repairs/${a.id}/invoice`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate the invoice");
      refresh();
    } catch (err) {
      if (typeof window !== "undefined") window.alert(err instanceof Error ? err.message : "Couldn't generate the invoice");
    } finally {
      setBusyId(null);
    }
  }

  function renderCard(a: Appointment) {
    const tech = a.technicianId ? staffMap.get(a.technicianId) : null;
    const isSelected = selectedId === a.id;
    const edge = isSelected ? "var(--accent)" : PRIORITY_EDGE[a.priority] ?? "var(--line)";
    const billed = a.status === "completed" && billedRepairIds.has(a.id);
    const next = NEXT_STAGE[a.status];
    return (
      <div
        key={a.id}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => setSelectedId(a.id)}
        onKeyDown={(e) => {
          // The card's own quick-action is a real button inside this
          // role="button"; without this guard Enter on it would bubble up,
          // advance the status AND open the drawer at once.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedId(a.id);
          }
        }}
        style={{ ...cardStyle, background: isSelected ? "var(--accent-subtle)" : "var(--panel)", boxShadow: `inset 2px 0 0 ${edge}` }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {a.customerName}
          </span>
          {a.priority && a.priority !== "normal" && (
            <span className={`lamp ${PRIORITY_LAMP[a.priority] ?? "lamp-idle"}`}>{PRIORITY_LABEL[a.priority]}</span>
          )}
          {a.status === "completed" && billed && <span className="lamp lamp-ok">Billed</span>}
        </div>
        <div className="meta" style={{ fontSize: 11.5, marginBottom: 5 }}>
          {a.deviceType}{a.deviceModel ? ` ${a.deviceModel}` : ""}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--ink-3)",
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          {a.issueDescription}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="meta">{tech ? tech.name : "Unassigned"}</span>
          <span className="data meta" title={a.appointmentDate}>{timeAgo(a.appointmentDate)}</span>
        </div>
        {next && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-soft)" }}>
            <button
              className="primary sm"
              style={{ width: "100%" }}
              disabled={busyId === a.id}
              onClick={(e) => {
                e.stopPropagation();
                updateStatus(a.id, next);
              }}
            >
              {STATUS_LABEL[next]}
            </button>
          </div>
        )}
      </div>
    );
  }

  const selectedInvoice = selected ? invoices.find((i) => i.repairAppointmentId === selected.id) : undefined;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel">
        <div className="panel-head" style={{ flexWrap: "wrap", rowGap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <span className="instrument-label">Repair console</span>
            <span className="meta">
              {appointments === null ? "Loading the shop" : clientName ? `${stats.activeCount} active · ${clientName}` : `${stats.activeCount} active`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="sm" onClick={() => setInventoryOpen((o) => !o)} aria-pressed={inventoryOpen}>
              {inventoryOpen ? "Back to work queue" : `Inventory${lowStock > 0 ? ` · ${lowStock} low` : ""}`}
            </button>
            <button className="primary sm" onClick={() => setWalkInOpen(true)}>
              New walk-in
            </button>
          </div>
        </div>
      </div>

      {inventoryOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="meta">Full stock record — add, edit, import, restock, and review every lot.</span>
            <button className="sm" onClick={() => setInventoryOpen(false)}>
              Back to work queue
            </button>
          </div>
          <InventoryPanel businessId={businessId} active={inventoryOpen} />
        </div>
      ) : (
        <>
          <StatCardRow>
            <StatCard label="In intake" value={stats.intakeCount} tone="info" hint={stats.intakeCount ? "Waiting to be received" : undefined} />
            <StatCard label="In repair" value={stats.inRepairCount} tone="accent" hint={stats.inRepairCount ? "On the bench" : undefined} />
            <StatCard label="Finishing" value={stats.finishingCount} tone={stats.finishingCount ? "success" : "neutral"} hint={stats.finishingCount ? "Ready to collect" : undefined} />
            <StatCard
              label="Needs billing"
              value={stats.unbilled.length}
              tone={stats.unbilled.length ? "danger" : "neutral"}
              hint={stats.unbilled.length ? "Completed, not invoiced" : "All invoiced"}
            />
            <StatCard label="Low stock" value={lowStock} tone={lowStock ? "warning" : "neutral"} hint={lowStock ? "Parts at or under minimum" : "Stock healthy"} />
          </StatCardRow>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 320px",
              gap: 14,
              alignItems: "start",
            }}
          >
            <div className="panel" style={{ minWidth: 0 }}>
              <div className="panel-head" style={{ flexWrap: "wrap", rowGap: 8 }}>
                <span className="instrument-label">Work queue</span>
                <input
                  type="search"
                  name="aiva-search-console"
                  autoComplete="off"
                  aria-label="Search the work queue"
                  style={{ flex: "1 1 200px", minWidth: 0 }}
                  placeholder="Name, phone, device, issue, order number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="panel-body" style={{ overflowX: "auto" }}>
                {!appointments && <p className="meta">Loading the work queue</p>}
                {appointments && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: "min-content" }}>
                    {STAGES.map((s) => (
                      <div key={s} style={columnStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                          <span className={`lamp ${STATUS_LAMP[s]}`} style={{ fontWeight: 600 }}>{STATUS_LABEL[s]}</span>
                          <span className="data meta" style={{ marginLeft: "auto" }}>{columns[s].length}</span>
                        </div>
                        <div className="panel-scroll" style={columnBodyStyle}>
                          {columns[s].map(renderCard)}
                          {columns[s].length === 0 && (
                            <div className="empty-state" style={{ padding: "14px 12px", background: "transparent" }}>
                              <span className="empty-state-description">Nothing here.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <div className="panel">
                <div className="panel-head">
                  <span className="instrument-label">Inventory</span>
                  {lowStock > 0 && <span className="lamp lamp-warn">{lowStock} low</span>}
                </div>
                <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {products.length === 0 && <p className="meta">No parts tracked yet.</p>}
                  {products.length > 0 && lowStock === 0 && (
                    <p className="meta">{products.length} parts tracked — nothing at or under its minimum.</p>
                  )}
                  {lowParts.slice(0, 6).map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </span>
                        <span className="data meta" style={{ fontSize: 11 }}>
                          {p.stock} left · min {p.minStock}
                        </span>
                      </span>
                      <button className="sm" onClick={() => setRefillFor(p)}>Refill</button>
                    </div>
                  ))}
                  <button className="sm" onClick={() => setInventoryOpen(true)}>Open full inventory</button>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <span className="instrument-label">Needs billing</span>
                  <span className="data meta" style={{ marginLeft: "auto" }}>{stats.unbilled.length}</span>
                </div>
                <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {stats.unbilled.length === 0 && (
                    <p className="meta">Every finished repair is invoiced. Bill another the moment one completes.</p>
                  )}
                  {stats.unbilled.slice(0, 6).map((a) => (
                    <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, background: "var(--panel-sunk)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.customerName}
                        </span>
                        <span className="data" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{currency}{costOf(a).toFixed(2)}</span>
                      </div>
                      <span className="meta" style={{ fontSize: 11 }}>{a.deviceType}{a.deviceModel ? ` ${a.deviceModel}` : ""}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="primary sm" style={{ flex: 1 }} disabled={busyId === a.id} onClick={() => generateInvoice(a)}>
                          {busyId === a.id ? "Invoicing" : "Generate invoice"}
                        </button>
                        <button className="sm" onClick={() => setSelectedId(a.id)}>Open</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <span className="instrument-label">Jump to</span>
                </div>
                <div className="panel-body" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {onNavigate && (
                    <>
                      <button className="sm" onClick={() => onNavigate("invoices")}>All invoices</button>
                      <button className="sm" onClick={() => onNavigate("contacts")}>Customers</button>
                      <button className="sm" onClick={() => onNavigate("reports")}>Reports</button>
                      <button className="sm" onClick={() => onNavigate("allchats")}>Inbox</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div
          className="panel"
          role="dialog"
          aria-label={`Work order for ${selected.customerName}`}
          style={{ ...drawerStyle, ...(isMobile ? { width: "100%", minWidth: 0, maxWidth: "none", borderLeft: "none" } : null) }}
        >
          <div className="panel-head" style={{ alignItems: "flex-start", flexWrap: "wrap", rowGap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <button className="ghost sm" autoFocus style={{ width: 32, height: 32, padding: 0 }} onClick={() => setSelectedId(null)} aria-label="Close work order">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{selected.customerName}</div>
                <div className="meta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className={`lamp ${STATUS_LAMP[selected.status] ?? "lamp-idle"}`}>{STATUS_LABEL[selected.status] ?? selected.status}</span>
                  <span className="data">{selected.phone}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select aria-label="Repair status" value={selected.status} onChange={(e) => updateStatus(selected.id, e.target.value)} style={{ width: "auto", fontSize: 12.5 }}>
                {(["booked", "received", "in_repair", "ready", "completed", "cancelled"] as const).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <select aria-label="Priority" value={selected.priority} onChange={(e) => updateField(selected.id, { priority: e.target.value })} style={{ width: "auto", fontSize: 12.5 }}>
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]} priority</option>
                ))}
              </select>
              <select aria-label="Assigned technician" value={selected.technicianId || ""} onChange={(e) => updateField(selected.id, { technicianId: e.target.value })} style={{ width: "auto", fontSize: 12.5 }}>
                <option value="">Unassigned</option>
                {staff.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel-scroll" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <div style={specGridStyle}>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Order number</div>
                <div className="data" style={{ color: "var(--ink)", fontWeight: 600 }}>{selected.serialNumber ?? "Not assigned"}</div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Device</div>
                <div style={{ color: "var(--ink)", fontSize: 13 }}>{selected.deviceType}{selected.deviceModel ? ` ${selected.deviceModel}` : ""}</div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Created</div>
                <div className="data" style={{ color: "var(--ink)", fontSize: 12.5 }}>{new Date(selected.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Source</div>
                <div style={{ color: "var(--ink)", fontSize: 13 }}>
                  {selected.source === "website" ? "Website booking" : selected.source?.startsWith("walk-in") ? selected.source : selected.isWalkIn ? "Walk-in" : "Scheduled"}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div className="panel-head" style={{ minHeight: 0, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)", marginBottom: 12 }}>
                <span className="instrument-label">Reported issue</span>
              </div>
              <div style={{ padding: 12, background: "var(--panel-sunk)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
                {selected.issueDescription}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div className="panel-head" style={{ minHeight: 0, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)", marginBottom: 12 }}>
                <span className="instrument-label">Parts &amp; services</span>
                <span className="data" style={{ marginLeft: "auto", fontWeight: 600 }}>{currency}{costOf(selected).toFixed(2)}</span>
              </div>
              <div style={{ padding: 12, background: "var(--panel)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                <OrderItemsEditor order={selected as unknown as RepairOrder} products={products} onChanged={refresh} />
              </div>
            </div>

            <div>
              <div className="panel-head" style={{ minHeight: 0, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)", marginBottom: 12 }}>
                <span className="instrument-label">Billing</span>
              </div>
              {selectedInvoice ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: 12, background: "var(--panel-sunk)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                  <div>
                    <div className="data" style={{ color: "var(--ink)", fontWeight: 600 }}>{selectedInvoice.invoiceNumber}</div>
                    <div className="meta" style={{ marginTop: 2 }}>
                      {currency}{selectedInvoice.total.toFixed(2)} · balance {currency}{selectedInvoice.balanceDue.toFixed(2)} · {selectedInvoice.status.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="sm" onClick={() => window.open(`/dashboard/${businessId}/invoice/${selectedInvoice.id}/print`, "_blank")}>Print</button>
                    {onNavigate && <button className="sm" onClick={() => onNavigate("invoices")}>Manage</button>}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: 12, background: "var(--panel-sunk)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                  <span className="meta">
                    {selected.items.length === 0 ? "Add at least one part or service above to bill this repair." : "No invoice yet for this repair."}
                  </span>
                  <button className="primary sm" disabled={selected.items.length === 0 || busyId === selected.id} onClick={() => generateInvoice(selected)}>
                    {busyId === selected.id ? "Invoicing" : "Generate invoice"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {walkInOpen && (
        <WalkInDialog
          businessId={businessId}
          staff={staff}
          onClose={() => setWalkInOpen(false)}
          onCreated={(created) => {
            setWalkInOpen(false);
            refresh();
            setSelectedId(created.id);
          }}
        />
      )}

      {refillFor && (
        <RefillDialog
          product={refillFor}
          currency={currency}
          onClose={() => setRefillFor(null)}
          onDone={() => {
            setRefillFor(null);
            refresh();
            fetch(`/api/admin/products?businessId=${encodeURIComponent(businessId)}&limit=200`)
              .then((r) => r.json())
              .then((d: { products: Product[] }) => setProducts(d.products ?? []))
              .catch(() => {});
          }}
        />
      )}
    </section>
  );
}
