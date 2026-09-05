"use client";

import { useState, useEffect, useCallback } from "react";
import { cardStyle, badgeStyle } from "./dashboard-styles";

interface Offer {
  id: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  promoCode: string | null;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  maxUses: number | null;
  currentUses: number;
  createdAt: string;
}

interface Props {
  businessId: string;
}

export default function OffersPanel({ businessId }: Props) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    discountType: "percentage",
    discountValue: "",
    promoCode: "",
    validUntil: "",
    maxUses: "",
  });

  const fetchOffers = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/offers?businessId=${businessId}`);
      if (res.ok) setOffers(await res.json());
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  const handleCreate = async () => {
    if (!form.title || !form.discountValue) return;
    await fetch("/api/admin/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        title: form.title,
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        promoCode: form.promoCode || undefined,
        validUntil: form.validUntil || undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      }),
    });
    setForm({ title: "", description: "", discountType: "percentage", discountValue: "", promoCode: "", validUntil: "", maxUses: "" });
    setShowForm(false);
    fetchOffers();
  };

  const toggleActive = async (offer: Offer) => {
    await fetch(`/api/admin/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, ...offer, isActive: !offer.isActive }),
    });
    fetchOffers();
  };

  const deleteOffer = async (id: string) => {
    await fetch(`/api/admin/offers?id=${id}`, { method: "DELETE" });
    fetchOffers();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text)" }}>Offers & Promos</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Create promotional offers and promo codes for your customers.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "8px 16px",
            background: "var(--accent, #6366f1)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm, 6px)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {showForm ? "Cancel" : "+ New Offer"}
        </button>
      </div>

      {showForm && (
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input
              placeholder="Offer title (e.g. 20% Off Screen Repair)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={{ gridColumn: "1 / -1", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
            />
            <input
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{ gridColumn: "1 / -1", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
            />
            <select
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value })}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount ($)</option>
            </select>
            <input
              type="number"
              placeholder="Discount value"
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
            />
            <input
              placeholder="Promo code (optional)"
              value={form.promoCode}
              onChange={(e) => setForm({ ...form, promoCode: e.target.value.toUpperCase() })}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 13, textTransform: "uppercase" }}
            />
            <input
              type="datetime-local"
              placeholder="Expires"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
            />
            <input
              type="number"
              placeholder="Max uses (optional)"
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
            />
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              onClick={handleCreate}
              disabled={!form.title || !form.discountValue}
              style={{
                padding: "8px 20px",
                background: "var(--accent, #6366f1)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm, 6px)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                opacity: !form.title || !form.discountValue ? 0.5 : 1,
              }}
            >
              Create Offer
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading offers...</p>
      ) : offers.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>No offers yet. Create your first offer to get started.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {offers.map((offer) => (
            <div key={offer.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{offer.title}</span>
                  <span style={{
                    ...badgeStyle,
                    background: offer.isActive ? "#dcfce7" : "#fef2f2",
                    color: offer.isActive ? "#166534" : "#991b1b",
                  }}>
                    {offer.isActive ? "Active" : "Inactive"}
                  </span>
                  {offer.promoCode && (
                    <span style={{ ...badgeStyle, background: "#e0e7ff", color: "#3730a3", fontFamily: "monospace" }}>
                      {offer.promoCode}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                  {offer.discountType === "percentage"
                    ? `${offer.discountValue}% off`
                    : `$${offer.discountValue} off`}
                  {offer.maxUses && ` · ${offer.currentUses}/${offer.maxUses} uses`}
                  {offer.validUntil && ` · Expires ${new Date(offer.validUntil).toLocaleDateString()}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => toggleActive(offer)}
                  style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm, 6px)", background: "var(--bg)", color: "var(--text)", fontSize: 12, cursor: "pointer" }}
                >
                  {offer.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => deleteOffer(offer.id)}
                  style={{ padding: "4px 10px", border: "1px solid #fecaca", borderRadius: "var(--radius-sm, 6px)", background: "#fef2f2", color: "#991b1b", fontSize: 12, cursor: "pointer" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
