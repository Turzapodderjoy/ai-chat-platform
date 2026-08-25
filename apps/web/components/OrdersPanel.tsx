"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle } from "./dashboard-styles";

interface Order {
  id: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  products: string;
  paymentMethod: string;
  createdAt: string;
}

/** Orders the AI takes directly inside a chat conversation — collected
 * conversationally (name, phone, delivery address, products/quantity,
 * payment method), turned into a row here the moment the AI confirms them
 * back to the customer. Read-only; no chat/LLM call needed to browse it. */
export function OrdersPanel({ businessId }: { businessId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/admin/orders?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then(setOrders);
  }, [businessId]);

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
        customer as taken and on its way.
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{o.id}</td>
                  <td style={cellStyle}>{new Date(o.createdAt).toLocaleString()}</td>
                  <td style={cellStyle}>{o.customerName}</td>
                  <td style={cellStyle}>{o.phone}</td>
                  <td style={cellStyle}>{o.deliveryAddress}</td>
                  <td style={cellStyle}>{o.products}</td>
                  <td style={cellStyle}>{o.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
