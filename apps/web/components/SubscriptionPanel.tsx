"use client";

import { useEffect, useState } from "react";
import { cardStyle, primaryButtonStyle, labelTextStyle } from "./dashboard-styles";

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
    if (!client.subscriptionActive) return { label: "Disabled", color: "var(--text-muted)", bg: "var(--surface-hover)" };
    if (!client.subscriptionEndDate) return { label: "Active", color: "var(--success)", bg: "var(--success-subtle)" };
    const end = new Date(client.subscriptionEndDate);
    const now = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (end.getTime() < now.getTime() - twoDaysMs) return { label: "Expired", color: "var(--danger)", bg: "var(--danger-subtle)" };
    if (end.getTime() < now.getTime()) return { label: "Grace Period", color: "var(--warning)", bg: "var(--warning-subtle)" };
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { label: `Expiring in ${daysLeft}d`, color: "var(--warning)", bg: "var(--warning-subtle)" };
    return { label: "Active", color: "var(--success)", bg: "var(--success-subtle)" };
  }

  if (!clients) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        Loading subscriptions...
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Subscription Management</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Manage client subscriptions, billing, and access control.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {clients.map((client) => {
          const status = getStatus(client);
          const isEditing = editingId === client.id;

          return (
            <div key={client.id} style={{ ...cardStyle, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--accent)",
                  }}>
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--text)" }}>{client.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{client.slug}</div>
                  </div>
                  <span style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-full)",
                    fontSize: 12,
                    fontWeight: 500,
                    backgroundColor: status.bg,
                    color: status.color,
                  }}>
                    {status.label}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!isEditing && (
                    <>
                      <button onClick={() => startEdit(client)} style={{ fontSize: 12, padding: "6px 12px" }}>
                        Edit
                      </button>
                      <button onClick={() => renew(client)} style={{ fontSize: 12, padding: "6px 12px", background: "var(--success)", borderColor: "var(--success)", color: "white" }}>
                        Renew +1 Month
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border-subtle)" }}>
                  <div>
                    <label style={labelTextStyle}>Plan Name</label>
                    <input
                      type="text"
                      value={form.planName}
                      onChange={(e) => setForm({ ...form, planName: e.target.value })}
                      placeholder="e.g., Pro, Enterprise"
                    />
                  </div>
                  <div>
                    <label style={labelTextStyle}>Monthly Fee (BDT)</label>
                    <input
                      type="number"
                      value={form.fee}
                      onChange={(e) => setForm({ ...form, fee: e.target.value })}
                      placeholder="5000"
                    />
                  </div>
                  <div>
                    <label style={labelTextStyle}>Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={labelTextStyle}>End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={labelTextStyle}>Status</label>
                    <button
                      onClick={() => setForm({ ...form, active: !form.active })}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        border: "none",
                        background: form.active ? "var(--success)" : "var(--border-strong)",
                        position: "relative",
                        cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                    >
                      <div style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "white",
                        position: "absolute",
                        top: 3,
                        left: form.active ? 23 : 3,
                        transition: "left 0.2s",
                        boxShadow: "var(--shadow-sm)",
                      }} />
                    </button>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {form.active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={save} disabled={saving} className="primary" style={{ padding: "8px 16px" }}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ padding: "8px 16px" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)", paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
                  {client.subscriptionPlanName && (
                    <div>
                      <span style={{ color: "var(--text-faint)" }}>Plan: </span>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>{client.subscriptionPlanName}</span>
                    </div>
                  )}
                  {client.subscriptionFee && (
                    <div>
                      <span style={{ color: "var(--text-faint)" }}>Fee: </span>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>৳{client.subscriptionFee.toLocaleString()}/mo</span>
                    </div>
                  )}
                  {client.subscriptionStartDate && client.subscriptionEndDate && (
                    <div>
                      <span style={{ color: "var(--text-faint)" }}>Period: </span>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>
                        {new Date(client.subscriptionStartDate).toLocaleDateString()} — {new Date(client.subscriptionEndDate).toLocaleDateString()}
                      </span>
                    </div>
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
