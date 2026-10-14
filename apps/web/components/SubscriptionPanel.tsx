"use client";

import { useEffect, useState } from "react";
import { SUBSCRIPTION_CURRENCIES, currencySymbol } from "../lib/currency";
import { showConfirm } from "../lib/app-dialog";

interface Client {
  id: string;
  name: string;
  slug: string;
  subscriptionPlanName: string | null;
  subscriptionFee: number | null;
  subscriptionCurrency: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  subscriptionActive: boolean;
}

export function SubscriptionPanel() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    planName: "",
    fee: "",
    currency: "USD",
    startDate: "",
    endDate: "",
    active: true,
  });
  const [saving, setSaving] = useState(false);

  function refresh() {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => setClients(data.clients));
  }

  useEffect(refresh, []);

  function startEdit(client: Client) {
    setEditingId(client.id);
    setForm({
      planName: client.subscriptionPlanName || "",
      fee: client.subscriptionFee?.toString() || "",
      currency: client.subscriptionCurrency || "USD",
      startDate: client.subscriptionStartDate ? client.subscriptionStartDate.split("T")[0] || "" : "",
      endDate: client.subscriptionEndDate ? client.subscriptionEndDate.split("T")[0] || "" : "",
      active: client.subscriptionActive,
    });
  }

  async function save() {
    if (!editingId) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/clients/${editingId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionPlanName: form.planName || null,
          subscriptionFee: form.fee ? parseFloat(form.fee) : null,
          subscriptionCurrency: form.currency,
          subscriptionStartDate: form.startDate ? new Date(form.startDate).toISOString() : null,
          subscriptionEndDate: form.endDate ? new Date(form.endDate).toISOString() : null,
          subscriptionActive: form.active,
        }),
      });
      setEditingId(null);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function renew(client: Client) {
    if (!(await showConfirm(`Renew subscription for "${client.name}"? Extends end date by 1 month.`))) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/clients/${client.id}/subscription/renew`, { method: "POST" });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  function getStatus(client: Client) {
    if (!client.subscriptionActive) return { label: "Disabled", lamp: "lamp lamp-idle" };
    if (!client.subscriptionEndDate) return { label: "Active", lamp: "lamp lamp-ok" };
    const end = new Date(client.subscriptionEndDate);
    const now = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (end.getTime() < now.getTime() - twoDaysMs) return { label: "Expired", lamp: "lamp lamp-err" };
    if (end.getTime() < now.getTime()) return { label: "Grace period", lamp: "lamp lamp-warn" };
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { label: `Expiring in ${daysLeft}d`, lamp: "lamp lamp-warn" };
    return { label: "Active", lamp: "lamp lamp-ok" };
  }

  if (!clients) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Subscriptions</span>
        </div>
        <div className="panel-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 44 }} />
            <div className="skeleton" style={{ height: 44 }} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Subscriptions</span>
        <span className="data" style={{ fontSize: 11 }}>{clients.length} clients</span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0 }}>
          Plan, fee and term per client. Renewing extends the end date by one month without touching
          the rest of the subscription.
        </p>

        {clients.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No clients yet</div>
            <div className="empty-state-description">
              Subscriptions are attached to a client, so create a client first.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {clients.map((client) => {
            const status = getStatus(client);
            const isEditing = editingId === client.id;

            return (
              <div key={client.id} className="panel-sunk" style={{ padding: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "var(--ink)", fontWeight: 600 }}>{client.name}</span>
                    <span className={status.lamp}>{status.label}</span>
                  </div>
                  {!isEditing && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="ghost sm" onClick={() => startEdit(client)}>
                        Edit
                      </button>
                      <button className="primary sm" onClick={() => renew(client)}>
                        Renew +1 month
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                    <div className="toolbar" style={{ marginBottom: 0, alignItems: "flex-end" }}>
                      <label className="field" style={{ flex: 1, minWidth: 160 }}>
                        <span className="instrument-label">Plan name</span>
                        <input
                          type="text"
                          value={form.planName}
                          onChange={(e) => setForm({ ...form, planName: e.target.value })}
                          placeholder="e.g. Pro, Enterprise"
                        />
                      </label>
                      <label className="field" style={{ flex: 1, minWidth: 120 }}>
                        <span className="instrument-label">Fee per 30 days</span>
                        <input
                          type="number"
                          value={form.fee}
                          onChange={(e) => setForm({ ...form, fee: e.target.value })}
                          placeholder="5000"
                        />
                      </label>
                      <label className="field" style={{ flex: "0 0 110px" }}>
                        <span className="instrument-label">Currency</span>
                        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                          {SUBSCRIPTION_CURRENCIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="toolbar" style={{ marginBottom: 0, alignItems: "flex-end" }}>
                      <label className="field" style={{ flex: 1, minWidth: 150 }}>
                        <span className="instrument-label">Start date</span>
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        />
                      </label>
                      <label className="field" style={{ flex: 1, minWidth: 150 }}>
                        <span className="instrument-label">End date</span>
                        <input
                          type="date"
                          value={form.endDate}
                          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                        />
                      </label>
                      <label className="field" style={{ flex: "0 0 auto" }}>
                        <span className="instrument-label">State</span>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, height: 34 }}>
                          <input
                            type="checkbox"
                            checked={form.active}
                            onChange={() => setForm({ ...form, active: !form.active })}
                          />
                          <span className={form.active ? "lamp lamp-ok" : "lamp lamp-idle"}>
                            {form.active ? "Enabled" : "Disabled"}
                          </span>
                        </label>
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={save} disabled={saving} className="primary">
                        {saving ? "Saving…" : "Save subscription"}
                      </button>
                      <button onClick={() => setEditingId(null)} className="ghost">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
                    <span className="instrument-label">Plan</span>
                    <span className="data" style={{ color: "var(--ink)" }}>
                      {client.subscriptionPlanName || "Not set"}
                    </span>
                    <span className="instrument-label">Fee</span>
                    <span className="data">
                      {client.subscriptionFee != null
                        ? `${currencySymbol(client.subscriptionCurrency)}${client.subscriptionFee.toLocaleString()} per 30 days`
                        : "Not set"}
                    </span>
                    <span className="instrument-label">Term</span>
                    <span className="data">
                      {client.subscriptionStartDate && client.subscriptionEndDate
                        ? `${new Date(client.subscriptionStartDate).toLocaleDateString()} to ${new Date(client.subscriptionEndDate).toLocaleDateString()}`
                        : "No term"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}