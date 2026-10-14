"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { shortId } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";

interface Order {
  id: string;
  customerName: string;
  phone: string;
  email: string | null;
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
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  returned: "Returned",
};
const DELIVERY_LAMP: Record<string, string> = {
  pending: "lamp-idle",
  picked_up: "lamp-info",
  in_transit: "lamp-info",
  delivered: "lamp-ok",
  returned: "lamp-err",
};
const DELIVERY_TONE: Record<string, "neutral" | "info" | "success" | "danger"> = {
  pending: "neutral",
  picked_up: "info",
  in_transit: "info",
  delivered: "success",
  returned: "danger",
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
  const [emailDraft, setEmailDraft] = useState("");

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
    setEmailDraft(order.email ?? "");
  }

  async function saveDelivery(order: Order) {
    setBusyId(order.id);
    try {
      await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, courier: courierDraft, trackingId: trackingDraft, email: emailDraft || null }),
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
    <section className="panel">
      <div className="panel-head">
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Delivery</span>
          <div className="meta">
            Courier, tracking ID and shipment status for every order, entered by hand. Open a row to edit them.
          </div>
        </div>
      </div>

      <div className="panel-body">
        {stats && (
          <StatCardRow>
            {DELIVERY_STATUSES.map((s) => (
              <StatCard
                key={s}
                label={DELIVERY_LABEL[s] ?? s}
                value={String(stats[s] ?? 0)}
                tone={DELIVERY_TONE[s]}
              />
            ))}
          </StatCardRow>
        )}

        <div className="toolbar" style={{ marginTop: 16, marginBottom: 12 }}>
          <div className="field" style={{ flex: "1 1 220px", maxWidth: 420, minWidth: 0 }}>
            <label className="field-label" htmlFor="del-search">Search deliveries</label>
            <input
              id="del-search"
              type="search"
              name="aiva-search-delivery"
              autoComplete="off"
              placeholder="Name, phone, product, courier, tracking ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field" style={{ width: 180 }}>
            <label className="field-label" htmlFor="del-status">Status</label>
            <select id="del-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {DELIVERY_STATUSES.map((s) => (
                <option key={s} value={s}>{DELIVERY_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {!orders && <p className="meta">Loading deliveries</p>}

        {orders && orders.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">No orders yet</span>
            <span className="empty-state-description">
              Delivery tracking appears here as soon as the first order exists.
            </span>
          </div>
        )}

        {orders && orders.length > 0 && filtered?.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">No deliveries match</span>
            <span className="empty-state-description">
              Clear the search box or pick a different status.
            </span>
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Courier</th>
                  <th>Tracking ID</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <Fragment key={o.id}>
                    <tr>
                      <td className="data" style={{ fontSize: 12 }}>{shortId(o.id)}</td>
                      <td style={{ color: "var(--ink)" }}>{o.customerName}</td>
                      <td>{o.deliveryAddress}</td>
                      <td>{o.courier ?? <span className="meta">Not set</span>}</td>
                      <td className="data" style={{ fontSize: 12 }}>{o.trackingId ?? <span className="meta">Not set</span>}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className={`lamp ${DELIVERY_LAMP[o.deliveryStatus] ?? "lamp-idle"}`}>
                            {DELIVERY_LABEL[o.deliveryStatus] ?? o.deliveryStatus}
                          </span>
                          <select
                            value={o.deliveryStatus}
                            onChange={(e) => setDeliveryStatus(o, e.target.value)}
                            disabled={busyId === o.id}
                            aria-label={`Delivery status for order ${shortId(o.id)}`}
                            style={{ maxWidth: 140 }}
                          >
                            {DELIVERY_STATUSES.map((s) => (
                              <option key={s} value={s}>{DELIVERY_LABEL[s]}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        <button type="button" className="sm" onClick={() => toggleManage(o)}>
                          {expandedId === o.id ? "Close details" : "Edit details"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === o.id && (
                      <tr>
                        <td colSpan={7} style={{ background: "var(--panel-sunk)", padding: 14 }}>
                          <div className="instrument-label" style={{ marginBottom: 10 }}>
                            Delivery details for {o.customerName}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 10 }}>
                            <div className="field">
                              <label className="field-label" htmlFor={`del-courier-${o.id}`}>Courier</label>
                              <input
                                id={`del-courier-${o.id}`}
                                placeholder="Pathao, Steadfast"
                                value={courierDraft}
                                onChange={(e) => setCourierDraft(e.target.value)}
                              />
                            </div>
                            <div className="field">
                              <label className="field-label" htmlFor={`del-tracking-${o.id}`}>Tracking ID</label>
                              <input
                                id={`del-tracking-${o.id}`}
                                className="data"
                                value={trackingDraft}
                                onChange={(e) => setTrackingDraft(e.target.value)}
                              />
                            </div>
                            <div className="field">
                              <label className="field-label" htmlFor={`del-email-${o.id}`}>Customer email</label>
                              <input
                                id={`del-email-${o.id}`}
                                type="email"
                                placeholder="Used for status update emails"
                                value={emailDraft}
                                onChange={(e) => setEmailDraft(e.target.value)}
                              />
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                            <button type="button" className="primary sm" onClick={() => saveDelivery(o)} disabled={busyId === o.id}>
                              {busyId === o.id ? "Saving delivery details" : "Save delivery details"}
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
      </div>
    </section>
  );
}