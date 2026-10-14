"use client";

import { useState, useEffect, useCallback } from "react";

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

  const discountLabel = form.discountType === "percentage" ? "Discount percent" : "Discount amount";

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Offers</span>
          <div className="meta">
            Discounts and promo codes customers can apply at checkout. A paused offer keeps its code but stops applying.
          </div>
        </div>
        <button type="button" className="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close new offer" : "New offer"}
        </button>
      </div>

      <div className="panel-body">
        {showForm && (
          <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
            <div className="instrument-label" style={{ marginBottom: 10 }}>New offer</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 10 }}>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="field-label" htmlFor="off-title">Offer title</label>
                <input
                  id="off-title"
                  placeholder="20 percent off screen repair"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="field-label" htmlFor="off-description">Description</label>
                <input
                  id="off-description"
                  placeholder="Optional, shown to customers"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="off-type">Discount type</label>
                <select
                  id="off-type"
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="off-value">{discountLabel}</label>
                <input
                  id="off-value"
                  className="data"
                  type="number"
                  inputMode="decimal"
                  placeholder={form.discountType === "percentage" ? "20" : "500"}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="off-code">Promo code</label>
                <input
                  id="off-code"
                  className="data"
                  placeholder="Optional, stored uppercase"
                  value={form.promoCode}
                  onChange={(e) => setForm({ ...form, promoCode: e.target.value.toUpperCase() })}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="off-expires">Expires</label>
                <input
                  id="off-expires"
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="off-max">Max uses</label>
                <input
                  id="off-max"
                  className="data"
                  type="number"
                  inputMode="numeric"
                  placeholder="Unlimited"
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                />
                <div className="field-hint">Leave empty for no limit</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className="primary" onClick={handleCreate} disabled={!form.title || !form.discountValue}>
                Create offer
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="meta">Loading offers</p>
        ) : offers.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-title">No offers yet</span>
            <span className="empty-state-description">
              Create an offer above to give customers a discount or a promo code.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="panel-sunk"
                style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
              >
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>{offer.title}</span>
                    <span className={`lamp ${offer.isActive ? "lamp-ok" : "lamp-idle"}`}>
                      {offer.isActive ? "Active" : "Paused"}
                    </span>
                    {offer.promoCode && <span className="data" style={{ fontSize: 12 }}>{offer.promoCode}</span>}
                  </div>
                  <div style={{ marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }} className="meta">
                    <span>
                      <span className="data">{offer.discountType === "percentage" ? `${offer.discountValue}%` : `$${offer.discountValue}`}</span> off
                    </span>
                    <span>
                      <span className="data">{offer.currentUses}</span>
                      {offer.maxUses ? <> of <span className="data">{offer.maxUses}</span> uses</> : " uses so far"}
                    </span>
                    {offer.validUntil && (
                      <span>
                        Expires <span className="data">{new Date(offer.validUntil).toLocaleDateString()}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="sm" onClick={() => toggleActive(offer)}>
                    {offer.isActive ? "Pause offer" : "Activate offer"}
                  </button>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => deleteOffer(offer.id)}
                    aria-label={`Delete offer ${offer.title}`}
                    title={`Delete offer ${offer.title}`}
                    style={{ color: "var(--danger)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}