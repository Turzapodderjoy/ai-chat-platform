"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, shortId } from "./dashboard-styles";
import { MessageTagControl } from "./MessageTagControl";

interface Order {
  id: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
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

/** Order management — every order the AI has taken directly inside a
 * chat, collected conversationally (name, phone, delivery address,
 * products/quantity, payment method), turned into a row here the
 * moment the AI confirms it back to the customer. Tagging reuses the
 * same Tag catalog as conversations/messages. Delivery/courier
 * tracking for these same orders lives in its own dedicated panel
 * (DeliveryPanel) rather than bundled in here — two different jobs
 * (what was ordered vs. where the shipment is), confirmed live this
 * needed to be split rather than kept as one combined view. */
export function OrdersPanel({ businessId }: { businessId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [search, setSearch] = useState("");
  const [tagCatalog, setTagCatalog] = useState<Tag[]>([]);
  const [orderTags, setOrderTags] = useState<Record<string, TagAssignment[]>>({});

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
      <h2 style={{ marginTop: 0 }}>Order Management</h2>
      <p style={subtleTextStyle}>
        Every order the AI has taken directly inside a chat — collected conversationally (name,
        phone, delivery address, products &amp; quantity, payment method) and confirmed to the
        customer as taken and on its way. For courier/shipment tracking, see the Delivery panel.
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
                <th style={cellStyle}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{shortId(o.id)}</td>
                  <td style={cellStyle}>{new Date(o.createdAt).toLocaleString()}</td>
                  <td style={cellStyle}>{o.customerName}</td>
                  <td style={cellStyle}>{o.phone}</td>
                  <td style={cellStyle}>{o.deliveryAddress}</td>
                  <td style={cellStyle}>{o.products}</td>
                  <td style={cellStyle}>{o.paymentMethod}</td>
                  <td style={cellStyle}>
                    <MessageTagControl
                      catalog={tagCatalog}
                      applied={orderTags[o.id] ?? []}
                      onAssign={(tagId) => assignTag(o.id, tagId)}
                      onRemove={(tagId) => removeTag(o.id, tagId)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
