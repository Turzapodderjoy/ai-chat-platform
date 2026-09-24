"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle, labelTextStyle, inputStyle, type BadgeTone } from "./dashboard-styles";
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

const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  partially_received: { label: "Partial Receipt", tone: "warn" },
  received: { label: "Received", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "error" },
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
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Purchase Orders</h3>
          <p style={subtleTextStyle}>Restock orders against suppliers — draft, send, and track receipts.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ ...labelTextStyle, color: "#6b7280" }}>
            {orders.length} orders · {suppliers.length} suppliers
          </span>
          <button style={primaryButtonStyle} onClick={() => setShowCreate(true)}>
            + New Purchase Order
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {Object.entries(statusCounts).map(([status, count]) => {
          const meta = STATUS_LABELS[status];
          return (
            <span key={status} style={badgeStyle(meta?.tone ?? "neutral")}>
              {meta?.label ?? status}: {count}
            </span>
          );
        })}
      </div>

      {loading ? (
        <p style={subtleTextStyle}>Loading purchase orders…</p>
      ) : orders.length === 0 ? (
        <p style={subtleTextStyle}>No purchase orders yet. Create your first restock order.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((order) => (
            <div key={order.id} style={{ ...cardStyle, margin: 0, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{order.orderNumber}</span>
                  <span style={{ ...subtleTextStyle, marginLeft: 8 }}>{order.supplier?.name ?? "—"}</span>
                </div>
                <span style={badgeStyle(STATUS_LABELS[order.status]?.tone ?? "neutral")}>
                  {STATUS_LABELS[order.status]?.label ?? order.status}
                </span>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={cellStyle}>Items</td>
                    <td style={cellStyle} align="right">{order.items.length}</td>
                    <td style={cellStyle}>Total</td>
                    <td style={cellStyle} align="right">{currency}{order.total || "0"}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {order.status === "draft" && (
                  <button style={primaryButtonStyle} onClick={() => handleOnDraft(order)}>
                    Send to Supplier
                  </button>
                )}
                {(order.status === "sent" || order.status === "partially_received") && (
                  <button style={primaryButtonStyle} onClick={() => handleReceive(order)}>
                    {order.status === "partially_received" ? "Continue Receiving" : "Receive Items"}
                  </button>
                )}
                {order.status !== "received" && order.status !== "cancelled" && (
                  <button style={dangerButtonStyle} onClick={() => handleCancel(order)}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePurchaseOrderDialog
          businessId={businessId}
          suppliers={suppliers}
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
        />
      )}
    </div>
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
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ ...cardStyle, width: 420, maxWidth: "92vw" }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>New Purchase Order</h3>
        {suppliers.length === 0 ? (
          <p style={subtleTextStyle}>
            No suppliers yet. Add suppliers in the database before creating a purchase order.
          </p>
        ) : (
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
        />
        {error && <p style={{ ...subtleTextStyle, color: "#dc2626" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={secondaryButtonStyle} onClick={onClose}>
            Cancel
          </button>
          <button style={primaryButtonStyle} onClick={create} disabled={!supplierId || saving}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
