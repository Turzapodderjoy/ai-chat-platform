"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { MessageTagControl } from "./MessageTagControl";

interface Order {
  id: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
  courier: string | null;
  trackingId: string | null;
  deliveryStatus: string;
  createdAt: string;
}

interface Tag {
  id: string;
  label: string;
  color: string | null;
}

interface TagAssignment {
  tagId: string;
  label: string;
  color: string | null;
  source: string;
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

/** Orders the AI takes directly inside a chat conversation — collected
 * conversationally (name, phone, delivery address, products/quantity,
 * payment method), turned into a row here the moment the AI confirms them
 * back to the customer. Tagging reuses the same Tag catalog as
 * conversations/messages; delivery tracking is manual entry (courier/
 * tracking ID/status) — see OrderService.updateDelivery's own comment
 * for why there's no live courier API call behind it yet. */
export function OrdersPanel({ businessId }: { businessId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [search, setSearch] = useState("");
  const [tagCatalog, setTagCatalog] = useState<Tag[]>([]);
  const [orderTags, setOrderTags] = useState<Record<string, TagAssignment[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [courierDraft, setCourierDraft] = useState("");
  const [trackingDraft, setTrackingDraft] = useState("");

  function refresh() {
    fetch(`/api/admin/orders?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: Order[]) => {
        setOrders(data);
        if (data.length > 0) refreshOrderTags(data.map((o) => o.id));
      });
  }

  function refreshOrderTags(ids: string[]) {
    if (ids.length === 0) return;
    fetch(`/api/admin/tags/for-orders?ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((d: { tagsByOrderId: Record<string, TagAssignment[]> }) => setOrderTags(d.tagsByOrderId));
  }

  useEffect(() => {
    refresh();
    fetch(`/api/admin/tags?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { tags: Tag[] }) => setTagCatalog(d.tags));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function assignTag(orderId: string, tagId: string) {
    await fetch("/api/admin/tags/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, tagId }),
    });
    refreshOrderTags(orders?.map((o) => o.id) ?? []);
  }

  async function removeTag(orderId: string, tagId: string) {
    await fetch(`/api/admin/tags/assign?orderId=${encodeURIComponent(orderId)}&tagId=${encodeURIComponent(tagId)}`, { method: "DELETE" });
    refreshOrderTags(orders?.map((o) => o.id) ?? []);
  }

  function toggleDelivery(order: Order) {
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

  // Plain case-insensitive substring match across every visible field —
  // no fuzzy-match library needed for a handful of short fields; good
  // enough to find "the order with 'drill' in it" or a partial name.
  const filtered = useMemo(() => {
    if (!orders) return null;
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.id, o.customerName, o.phone, o.deliveryAddress, o.products, o.paymentMethod].some((f) =>
        f.toLowerCase().includes(q)
      )
    );
  }, [orders, search]);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Orders</h2>
      <p style={subtleTextStyle}>
        Every order the AI has taken directly inside a chat — collected conversationally (name,
        phone, delivery address, products &amp; quantity, payment method) and confirmed to the
        customer as taken and on its way. Tag an order or click a row to manage its delivery.
      </p>

      <input
        style={{ padding: 8, width: "100%", maxWidth: 320, marginBottom: 12 }}
        placeholder="Search by name, phone, product, order ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {!orders && <p style={subtleTextStyle}>Loading…</p>}
      {orders && orders.length === 0 && <p style={subtleTextStyle}>No orders taken yet.</p>}
      {orders && orders.length > 0 && filtered?.length === 0 && <p style={subtleTextStyle}>No orders match that search.</p>}

      {filtered && filtered.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Order ID</th>
                <th style={cellStyle}>Date</th>
                <th style={cellStyle}>Customer</th>
                <th style={cellStyle}>Phone</th>
                <th style={cellStyle}>Delivery address</th>
                <th style={cellStyle}>Products</th>
                <th style={cellStyle}>Payment</th>
                <th style={cellStyle}>Delivery</th>
                <th style={cellStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{shortId(o.id)}</td>
                    <td style={cellStyle}>{new Date(o.createdAt).toLocaleString()}</td>
                    <td style={cellStyle}>{o.customerName}</td>
                    <td style={cellStyle}>{o.phone}</td>
                    <td style={cellStyle}>{o.deliveryAddress}</td>
                    <td style={cellStyle}>{o.products}</td>
                    <td style={cellStyle}>{o.paymentMethod}</td>
                    <td style={cellStyle}>
                      <button onClick={() => toggleDelivery(o)} style={{ fontSize: 11, padding: "3px 6px", marginRight: 6 }}>
                        {expandedId === o.id ? "Close" : "Manage"}
                      </button>
                      <span style={badgeStyle(DELIVERY_TONE[o.deliveryStatus] ?? "neutral")}>{DELIVERY_LABEL[o.deliveryStatus] ?? o.deliveryStatus}</span>
                    </td>
                    <td style={cellStyle}>
                      <MessageTagControl
                        catalog={tagCatalog}
                        applied={orderTags[o.id] ?? []}
                        onAssign={(tagId) => assignTag(o.id, tagId)}
                        onRemove={(tagId) => removeTag(o.id, tagId)}
                      />
                    </td>
                  </tr>
                  {expandedId === o.id && (
                    <tr>
                      <td colSpan={9} style={{ ...cellStyle, background: "var(--surface)", padding: 14 }}>
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
                          <select
                            value={o.deliveryStatus}
                            onChange={(e) => setDeliveryStatus(o, e.target.value)}
                            disabled={busyId === o.id}
                            style={{ padding: 6, fontSize: 12 }}
                          >
                            {DELIVERY_STATUSES.map((s) => (
                              <option key={s} value={s}>{DELIVERY_LABEL[s]}</option>
                            ))}
                          </select>
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
