"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";

interface Order {
  id: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  products: string;
  courier: string | null;
  trackingId: string | null;
  deliveryStatus: string;
  createdAt: string;
}

const DELIVERY_STATUSES = ["pending", "picked_up", "in_transit", "delivered", "returned"] as const;
const DELIVERY_LABEL: Record<string, string> = {
  pending: "Pending",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  delivered: "Delivered",
  returned: "Returned",
};
const DELIVERY_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  picked_up: "info",
  in_transit: "info",
  delivered: "ok",
  returned: "error",
};

/** Delivery management & tracking — the shipment side of an Order, kept
 * as its own dedicated panel rather than bundled into Order Management
 * (confirmed live: those are two different jobs — what was ordered vs.
 * where the shipment physically is — and belong in separate views).
 * Same Order rows, same courier/trackingId/deliveryStatus fields; see
 * OrderService.updateDelivery's own comment for why this is manual
 * entry rather than a live courier API. */
export function DeliveryPanel({ businessId }: { businessId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [courierDraft, setCourierDraft] = useState("");
  const [trackingDraft, setTrackingDraft] = useState("");

  function refresh() {
    fetch(`/api/admin/orders?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: Order[]) => setOrders(data));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  function toggleManage(order: Order) {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    setCourierDraft(order.courier ?? "");
    setTrackingDraft(order.trackingId ?? "");
  }

  async function saveDelivery(order: Order) {
    setBusyId(order.id);
    try {
      await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, courier: courierDraft, trackingId: trackingDraft }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function setDeliveryStatus(order: Order, deliveryStatus: string) {
    setBusyId(order.id);
    try {
      await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, deliveryStatus }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!orders) return null;
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter && o.deliveryStatus !== statusFilter) return false;
      if (!q) return true;
      return [o.id, o.customerName, o.phone, o.deliveryAddress, o.products, o.courier ?? "", o.trackingId ?? ""].some((f) =>
        f.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => {
    if (!orders) return null;
    const byStatus: Record<string, number> = {};
    for (const s of DELIVERY_STATUSES) byStatus[s] = 0;
    for (const o of orders) byStatus[o.deliveryStatus] = (byStatus[o.deliveryStatus] ?? 0) + 1;
    return byStatus;
  }, [orders]);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Delivery Management &amp; Tracking</h2>
      <p style={subtleTextStyle}>
        Courier, tracking ID, and shipment status for every order — manual entry (no live courier
        API wired up yet). Click a row to update it.
      </p>

      {stats && (
        <StatCardRow>
          {DELIVERY_STATUSES.map((s) => (
            <StatCard
              key={s}
              label={DELIVERY_LABEL[s] ?? s}
              value={String(stats[s] ?? 0)}
              tone={s === "delivered" ? "success" : s === "returned" ? "danger" : "info"}
            />
          ))}
        </StatCardRow>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          style={{ padding: 8, width: "100%", maxWidth: 320 }}
          placeholder="Search by name, phone, product, courier, tracking ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 8 }}>
          <option value="">All statuses</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>{DELIVERY_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {!orders && <p style={subtleTextStyle}>Loading…</p>}
      {orders && orders.length === 0 && <p style={subtleTextStyle}>No orders yet.</p>}
      {orders && orders.length > 0 && filtered?.length === 0 && <p style={subtleTextStyle}>No orders match that search/filter.</p>}

      {filtered && filtered.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Order ID</th>
                <th style={cellStyle}>Customer</th>
                <th style={cellStyle}>Address</th>
                <th style={cellStyle}>Courier</th>
                <th style={cellStyle}>Tracking ID</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{shortId(o.id)}</td>
                    <td style={cellStyle}>{o.customerName}</td>
                    <td style={cellStyle}>{o.deliveryAddress}</td>
                    <td style={cellStyle}>{o.courier ?? "—"}</td>
                    <td style={cellStyle}>{o.trackingId ?? "—"}</td>
                    <td style={cellStyle}>
                      <select
                        value={o.deliveryStatus}
                        onChange={(e) => setDeliveryStatus(o, e.target.value)}
                        disabled={busyId === o.id}
                        style={{ padding: 4, fontSize: 11, marginRight: 6 }}
                      >
                        {DELIVERY_STATUSES.map((s) => (
                          <option key={s} value={s}>{DELIVERY_LABEL[s]}</option>
                        ))}
                      </select>
                      <span style={badgeStyle(DELIVERY_TONE[o.deliveryStatus] ?? "neutral")}>{DELIVERY_LABEL[o.deliveryStatus] ?? o.deliveryStatus}</span>
                    </td>
                    <td style={cellStyle}>
                      <button onClick={() => toggleManage(o)} style={{ fontSize: 11, padding: "3px 8px" }}>
                        {expandedId === o.id ? "Close" : "Edit"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === o.id && (
                    <tr>
                      <td colSpan={7} style={{ ...cellStyle, background: "var(--surface)", padding: 14 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            style={{ padding: 6, fontSize: 12 }}
                            placeholder="Courier (e.g. Pathao, Steadfast)"
                            value={courierDraft}
                            onChange={(e) => setCourierDraft(e.target.value)}
                          />
                          <input
                            style={{ padding: 6, fontSize: 12 }}
                            placeholder="Tracking ID"
                            value={trackingDraft}
                            onChange={(e) => setTrackingDraft(e.target.value)}
                          />
                          <button onClick={() => saveDelivery(o)} disabled={busyId === o.id} style={{ fontSize: 11, padding: "5px 10px" }}>
                            Save
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
