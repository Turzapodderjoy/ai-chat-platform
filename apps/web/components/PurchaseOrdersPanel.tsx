"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { dataStrongStyle } from "./dashboard-styles";
import { useCurrencySymbol } from "../lib/currency";
import { showConfirm } from "../lib/app-dialog";

// Wave B #8 - Purchase Orders restock panel. Buy-side sibling of the Sales
// "Orders" panel: a manager drafts a PO against a known Supplier, auto-fills
// line items from the Product catalog (free-text unitCost to match the
// money-is-not-a-number convention), marks it sent, then records partial or
// full receipts. Receipts decrement stock via InventoryPanel's refill path
// (receivedQty -> ProductLot) just like closing-checklist receipts do.
interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
}

interface PurchaseOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  receivedQty: number;
  unitCost: string;
  lineTotal: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: string; // draft | sent | partially_received | received | cancelled
  orderDate: string;
  expectedDelivery: string | null;
  supplier: Supplier | null;
  items: PurchaseOrderItem[];
  total: string;
}

const STATUS_LAMPS: Record<string, { label: string; lamp: string }> = {
  draft: { label: "Draft", lamp: "lamp-idle" },
  sent: { label: "Sent", lamp: "lamp-info" },
  partially_received: { label: "Partially received", lamp: "lamp-warn" },
  received: { label: "Received", lamp: "lamp-ok" },
  cancelled: { label: "Cancelled", lamp: "lamp-err" },
};

export function PurchaseOrdersPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const currency = useCurrencySymbol(businessId);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/purchase-orders?businessId=${encodeURIComponent(businessId)}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setSuppliers(data.suppliers ?? []);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  // Group orders by status for the pipeline summary row (mirrors how
  // InventoryPanel surfaces stock-health without per-row round-trips).
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  }, [orders]);

  const handleReceive = useCallback(
    async (order: PurchaseOrder) => {
      const received = order.items.every((i) => i.receivedQty >= i.quantity);
      const label = received ? "mark this order fully received?" : "record these receipt quantities?";
      if (!(await showConfirm(`${order.orderNumber} - ${label}`))) return;

      const res = await fetch(`/api/admin/purchase-orders`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          businessId,
          action: received ? "received" : "partial",
          items: order.items.map((i) => ({ itemId: i.id, receivedQty: i.receivedQty })),
        }),
      });
      if (res.ok) refresh();
    },
    [businessId, refresh],
  );

  const handleOnDraft = useCallback(
    async (order: PurchaseOrder) => {
      if (!(await showConfirm(`Send ${order.orderNumber} to the supplier?`))) return;
      const res = await fetch(`/api/admin/purchase-orders`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, businessId, action: "send" }),
      });
      if (res.ok) refresh();
    },
    [businessId, refresh],
  );

  const handleCancel = useCallback(
    async (order: PurchaseOrder) => {
      if (order.status === "received" || order.status === "cancelled") return;
      if (!(await showConfirm(`Cancel ${order.orderNumber}?`))) return;
      const res = await fetch(`/api/admin/purchase-orders`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, businessId, action: "cancelled" }),
      });
      if (res.ok) refresh();
    },
    [businessId, refresh],
  );

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Purchase orders</span>
          <div className="meta">
            Restock against a supplier, send it, then record what arrived. Amounts in {currency}.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="meta">
            <span className="data">{orders.length}</span> orders,{" "}
            <span className="data">{suppliers.length}</span> suppliers
          </span>
          <button type="button" className="primary" onClick={() => setShowCreate(true)}>
            Issue purchase order
          </button>
        </div>
      </div>

      <div className="panel-body">
        {Object.keys(statusCounts).length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(statusCounts).map(([status, count]) => {
              const meta = STATUS_LAMPS[status];
              return (
                <span key={status} className={`lamp ${meta?.lamp ?? "lamp-idle"}`}>
                  {meta?.label ?? status}: <span className="data">{count}</span>
                </span>
              );
            })}
          </div>
        )}

        {loading ? (
          <p className="meta">Loading purchase orders</p>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-title">No purchase orders yet</span>
            <span className="empty-state-description">
              Issue a purchase order to restock from a supplier you already have on file.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {orders.map((order) => (
              <div key={order.id} className="panel-sunk" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", minWidth: 0 }}>
                    <span className="data" style={{ ...dataStrongStyle, fontSize: 14 }}>{order.orderNumber}</span>
                    <span style={{ color: "var(--ink-2)" }}>{order.supplier?.name ?? "No supplier"}</span>
                  </div>
                  <span className={`lamp ${STATUS_LAMPS[order.status]?.lamp ?? "lamp-idle"}`}>
                    {STATUS_LAMPS[order.status]?.label ?? order.status}
                  </span>
                </div>

                <div className="table-scroll">
                  <table>
                    <tbody>
                      <tr>
                        <td className="meta" style={{ border: "none", padding: "4px 0" }}>Line items</td>
                        <td className="data num" style={{ border: "none", padding: "4px 0", textAlign: "right" }}>{order.items.length}</td>
                        <td className="meta" style={{ border: "none", padding: "4px 0" }}>Order total</td>
                        <td className="data num" style={{ border: "none", padding: "4px 0", textAlign: "right", ...dataStrongStyle }}>
                          {currency}{order.total || "0"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {order.status === "draft" && (
                    <button type="button" className="primary sm" onClick={() => handleOnDraft(order)}>
                      Send to supplier
                    </button>
                  )}
                  {(order.status === "sent" || order.status === "partially_received") && (
                    <button type="button" className="primary sm" onClick={() => handleReceive(order)}>
                      {order.status === "partially_received" ? "Continue receiving" : "Record receipt"}
                    </button>
                  )}
                  {order.status !== "received" && order.status !== "cancelled" && (
                    <button type="button" className="danger sm" onClick={() => handleCancel(order)}>
                      Cancel order
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreatePurchaseOrderDialog
          businessId={businessId}
          suppliers={suppliers}
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
        />
      )}
    </section>
  );
}

function CreatePurchaseOrderDialog({
  businessId,
  suppliers,
  onClose,
  onCreated,
}: {
  businessId: string;
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!supplierId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/purchase-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        supplierId,
        notes,
        items: [
          {
            productName: "Restock line item",
            productId: null,
            quantity: 1,
            unitCost: "0",
          },
        ],
      }),
    });
    setSaving(false);
    if (res.ok) {
      onCreated();
      onClose();
    } else {
      setError("Failed to create purchase order");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--ink) 45%, transparent)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div className="panel" style={{ width: 420, maxWidth: "100%", boxShadow: "var(--shadow-pop)" }}>
        <div className="panel-head">
          <span className="instrument-label">Issue purchase order</span>
        </div>
        <div className="panel-body">
          {suppliers.length === 0 ? (
            <p className="meta">
              No suppliers yet. Add suppliers in the database before creating a purchase order.
            </p>
          ) : (
            <div className="field" style={{ marginBottom: 10 }}>
              <label className="field-label" htmlFor="po-supplier">Supplier</label>
              <select id="po-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="po-notes">Notes</label>
            <input
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note for this order"
            />
          </div>
          {error && (
            <div style={{ marginTop: 10 }}>
              <span className="lamp lamp-err">{error}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={create} disabled={!supplierId || saving}>
              {saving ? "Creating purchase order" : "Create purchase order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}