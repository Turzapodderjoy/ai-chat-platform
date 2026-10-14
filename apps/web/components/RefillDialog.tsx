"use client";

import { useEffect, useState } from "react";

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

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "color-mix(in srgb, var(--ink) 45%, transparent)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

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
      style={overlayStyle}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Refill ${product.name}`}
        className="panel"
        style={{ width: "100%", maxWidth: 440, maxHeight: "100%", overflowY: "auto", boxShadow: "var(--shadow-pop)" }}
      >
        <div className="panel-head">
          <span className="instrument-label">Restock</span>
          <span className="meta">{product.name}</span>
        </div>
        <div className="panel-body">
          <div
            className="panel-sunk"
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div>
              <div className="field-label">On hand</div>
              <div className="data" style={{ fontSize: 13 }}>{product.stock ?? "—"}</div>
            </div>
            <div>
              <div className="field-label">Current cost</div>
              <div className="data" style={{ fontSize: 13 }}>
                {product.costPrice ? `${currency}${product.costPrice}` : "—"}
              </div>
            </div>
            <div>
              <div className="field-label">Current price</div>
              <div className="data" style={{ fontSize: 13 }}>
                {product.price ? `${currency}${product.price}` : "—"}
              </div>
            </div>
          </div>
          <p className="meta" style={{ marginTop: 0 }}>
            This adds a new lot; earlier lots and past sales keep the cost they had.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label" htmlFor="refill-quantity">
                Quantity received *
              </label>
              <input
                id="refill-quantity"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="refill-cost">
                New cost price (per unit)
              </label>
              <input
                id="refill-cost"
                type="number"
                min={0}
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder={product.costPrice ?? "same as now"}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="refill-sell">
                New sell price
              </label>
              <input
                id="refill-sell"
                type="number"
                min={0}
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder={product.price ?? "same as now"}
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label" htmlFor="refill-note">
                Note (optional — supplier, invoice)
              </label>
              <input
                id="refill-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="field-error" style={{ margin: "12px 0 0" }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="primary" onClick={submit} disabled={!canSave}>
              {saving ? "Adding…" : "Add lot"}
            </button>
          </div>
        </div>
      </section>
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

  if (!lots) return <p className="meta">Loading lots…</p>;
  if (lots.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-title">No lots yet</span>
        <span className="empty-state-description">
          The first restock of this product creates a lot, and sales draw down the oldest first.
        </span>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table style={{ minWidth: 620 }}>
        <thead>
          <tr>
            <th>Received</th>
            <th>By</th>
            <th className="num" style={{ textAlign: "right" }}>Qty in</th>
            <th className="num" style={{ textAlign: "right" }}>Left</th>
            <th className="num" style={{ textAlign: "right" }}>Cost</th>
            <th className="num" style={{ textAlign: "right" }}>Sell price</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => (
            <tr key={l.id}>
              <td className="data" style={{ whiteSpace: "nowrap" }}>{new Date(l.receivedAt).toLocaleDateString()}</td>
              <td>{l.receivedBy}</td>
              <td className="data" style={{ textAlign: "right" }}>{l.quantity}</td>
              <td className="data" style={{ textAlign: "right" }}>{l.remaining}</td>
              <td className="data" style={{ textAlign: "right" }}>{money(l.costPrice)}</td>
              <td className="data" style={{ textAlign: "right" }}>{money(l.sellPrice)}</td>
              <td className="meta">{l.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      style={overlayStyle}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Stock lots for ${product.name}`}
        className="panel"
        style={{ width: "100%", maxWidth: 720, maxHeight: "100%", overflowY: "auto", boxShadow: "var(--shadow-pop)" }}
      >
        <div className="panel-head">
          <span className="instrument-label">Stock lots</span>
          <span className="meta">{product.name}</span>
        </div>
        <div className="panel-body">
          <p className="meta" style={{ marginTop: 0 }}>
            Each restock is its own lot with its own cost and sell price. Sales use the oldest lot
            first.
          </p>
          <ProductLots productId={product.id} currency={currency} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      </section>
    </div>
  );
}
