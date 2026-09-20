"use client";

import { useEffect, useState } from "react";

import { primaryButtonStyle, subtleTextStyle, cellStyle } from "./dashboard-styles";

interface RefillProduct {
  id: string;
  name: string;
  price: string | null;
  costPrice: string | null;
  stock: string | null;
}

export interface ProductLotRow {
  id: string;
  quantity: number;
  remaining: number;
  costPrice: number | null;
  sellPrice: number | null;
  receivedBy: string;
  note: string | null;
  receivedAt: string;
}

const fieldStyle = { padding: 8, fontSize: 13, width: "100%", boxSizing: "border-box" } as const;
const labelStyle = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" } as const;

/** Dashboard popup to restock a product: a NEW lot with its own quantity,
 * cost price and sell price. Cost/sell price are optional -- left blank,
 * the lot inherits the product's current values. Earlier lots (and every
 * sale already costed from them) keep the cost they had. */
export function RefillDialog({
  product,
  currency,
  onClose,
  onDone,
}: {
  product: RefillProduct;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const qty = Number(quantity);
  const canSave = qty > 0 && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/products/refill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: qty, costPrice, sellPrice, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't refill.");
        return;
      }
      onDone();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        role="dialog"
        aria-label={`Refill ${product.name}`}
        style={{ width: "100%", maxWidth: 440, maxHeight: "100%", overflowY: "auto", background: "var(--surface, #1a1a1f)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.5)" }}
      >
        <h3 style={{ margin: "0 0 4px" }}>Refill · {product.name}</h3>
        <p style={{ ...subtleTextStyle, marginTop: 0 }}>
          On hand now: <strong>{product.stock ?? "—"}</strong> · current cost {product.costPrice ? `${currency}${product.costPrice}` : "—"} · current price {product.price ? `${currency}${product.price}` : "—"}.
          This adds a new lot; earlier lots and past sales keep the cost they had.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Quantity received *
            <input style={fieldStyle} type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </label>
          <label style={labelStyle}>
            New cost price (per unit)
            <input style={fieldStyle} type="number" min={0} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder={product.costPrice ?? "same as now"} />
          </label>
          <label style={labelStyle}>
            New sell price
            <input style={fieldStyle} type="number" min={0} step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder={product.price ?? "same as now"} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Note (optional — supplier, invoice…)
            <input style={fieldStyle} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        {error && <p style={{ color: "var(--danger, #e5484d)", fontSize: 12, margin: "12px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: "8px 14px", fontSize: 13 }}>Cancel</button>
          <button onClick={submit} disabled={!canSave} style={{ ...primaryButtonStyle, fontSize: 13 }}>
            {saving ? "Adding…" : "Add lot"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Every lot received for one product, newest first: what came in, what's
 * left, and the cost and sell price each carried. */
export function ProductLots({ productId, currency }: { productId: string; currency: string }) {
  const [lots, setLots] = useState<ProductLotRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/products/lots?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d: { lots?: ProductLotRow[] }) => setLots(d.lots ?? []))
      .catch(() => setLots([]));
  }, [productId]);

  const money = (n: number | null) => (n === null ? "—" : `${currency}${n.toLocaleString()}`);

  if (!lots) return <p style={subtleTextStyle}>Loading lots…</p>;
  if (lots.length === 0) return <p style={subtleTextStyle}>No lots yet — the first restock or sale creates one.</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {["Received", "By", "Qty in", "Left", "Cost", "Sell price", "Note"].map((h) => (
            <th key={h} style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lots.map((l) => (
          <tr key={l.id}>
            <td style={cellStyle}>{new Date(l.receivedAt).toLocaleDateString()}</td>
            <td style={cellStyle}>{l.receivedBy}</td>
            <td style={cellStyle}>{l.quantity}</td>
            <td style={cellStyle}>{l.remaining}</td>
            <td style={cellStyle}>{money(l.costPrice)}</td>
            <td style={cellStyle}>{money(l.sellPrice)}</td>
            <td style={cellStyle}>{l.note ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The lot history in a dashboard popup, opened from a product's Lots button. */
export function LotsDialog({ product, currency, onClose }: { product: { id: string; name: string }; currency: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        role="dialog"
        aria-label={`Stock lots for ${product.name}`}
        style={{ width: "100%", maxWidth: 720, maxHeight: "100%", overflowY: "auto", background: "var(--surface, #1a1a1f)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.5)" }}
      >
        <h3 style={{ margin: "0 0 4px" }}>Stock lots · {product.name}</h3>
        <p style={{ ...subtleTextStyle, marginTop: 0 }}>Each restock is its own lot with its own cost and sell price. Sales use the oldest lot first.</p>
        <div className="table-scroll">
          <ProductLots productId={product.id} currency={currency} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", fontSize: 13 }}>Close</button>
        </div>
      </div>
    </div>
  );
}
