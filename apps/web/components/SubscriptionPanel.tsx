"use client";

import { useEffect, useState } from "react";
import { cardStyle, primaryButtonStyle, subtleTextStyle } from "./dashboard-styles";

interface Client {
  id: string;
  name: string;
  slug: string;
  subscriptionPlanName: string | null;
  subscriptionFee: number | null;
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
    if (!confirm(`Renew subscription for "${client.name}"? Extends end date by 1 month.`)) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/clients/${client.id}/subscription/renew`, { method: "POST" });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  function getStatus(client: Client) {
    if (!client.subscriptionActive) return { label: "Disabled", color: "#6b7280" };
    if (!client.subscriptionEndDate) return { label: "Active", color: "#10b981" };
    const end = new Date(client.subscriptionEndDate);
    const now = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (end.getTime() < now.getTime() - twoDaysMs) return { label: "Expired", color: "#ef4444" };
    if (end.getTime() < now.getTime()) return { label: "Grace Period", color: "#f59e0b" };
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { label: `Expiring in ${daysLeft}d`, color: "#f59e0b" };
    return { label: "Active", color: "#10b981" };
  }

  if (!clients) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Subscription Management</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {clients.map((client) => {
          const status = getStatus(client);
          const isEditing = editingId === client.id;

          return (
            <div key={client.id} style={{ ...cardStyle, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <strong>{client.name}</strong>
                  <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 4, fontSize: 12, backgroundColor: status.color + "20", color: status.color }}>
                    {status.label}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!isEditing && (
                    <>
                      <button onClick={() => startEdit(client)} style={{ ...primaryButtonStyle, fontSize: 12, padding: "4px 12px" }}>
                        Edit
                      </button>
                      <button onClick={() => renew(client)} style={{ ...primaryButtonStyle, fontSize: 12, padding: "4px 12px", backgroundColor: "#10b981" }}>
                        Renew +1 Month
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: "#6b7280" }}>Plan Name</label>
                      <input
                        type="text"
                        value={form.planName}
                        onChange={(e) => setForm({ ...form, planName: e.target.value })}
                        placeholder="e.g., Pro, Enterprise"
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14 }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: "#6b7280" }}>Monthly Fee (BDT)</label>
                      <input
                        type="number"
                        value={form.fee}
                        onChange={(e) => setForm({ ...form, fee: e.target.value })}
                        placeholder="5000"
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14 }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: "#6b7280" }}>Start Date</label>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14 }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: "#6b7280" }}>End Date</label>
                      <input
                        type="date"
                        value={form.endDate}
                        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 14 }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 12, color: "#6b7280" }}>Active</label>
                    <button
                      onClick={() => setForm({ ...form, active: !form.active })}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        border: "none",
                        backgroundColor: form.active ? "#10b981" : "#d1d5db",
                        position: "relative",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          backgroundColor: "white",
                          position: "absolute",
                          top: 2,
                          left: form.active ? 22 : 2,
                          transition: "left 0.2s",
                        }}
                      />
                    </button>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{form.active ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={save} disabled={saving} style={{ ...primaryButtonStyle, fontSize: 12, padding: "6px 16px" }}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 12, padding: "6px 16px", border: "1px solid #d1d5db", borderRadius: 4, backgroundColor: "white", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  {client.subscriptionPlanName && <span>Plan: <strong>{client.subscriptionPlanName}</strong></span>}
                  {client.subscriptionFee && <span style={{ marginLeft: 12 }}>Fee: ৳{client.subscriptionFee.toLocaleString()}/mo</span>}
                  {client.subscriptionStartDate && client.subscriptionEndDate && (
                    <span style={{ marginLeft: 12 }}>
                      {new Date(client.subscriptionStartDate).toLocaleDateString()} — {new Date(client.subscriptionEndDate).toLocaleDateString()}
                    </span>
                  )}
                  {!client.subscriptionPlanName && !client.subscriptionFee && !client.subscriptionStartDate && (
                    <span style={{ fontStyle: "italic" }}>No subscription configured</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
