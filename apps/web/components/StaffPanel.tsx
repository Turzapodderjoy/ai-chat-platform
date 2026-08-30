"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";

interface StaffMember {
  id: string;
  businessId: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  active: boolean;
  createdAt: string;
}

const EMPTY_DRAFT = { name: "", email: "", phone: "", role: "technician" };

export function StaffPanel({ businessId }: { businessId: string }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    setStaff(null);
    fetch(`/api/admin/staff?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: { staff: StaffMember[] }) => setStaff(data.staff));
  }

  useEffect(refresh, [businessId]);

  async function addMember() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...draft }),
      });
      if (res.ok) {
        setDraft(EMPTY_DRAFT);
        setShowAdd(false);
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m: StaffMember) {
    setEditId(m.id);
    setEditDraft({ name: m.name, email: m.email ?? "", phone: m.phone ?? "", role: m.role });
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editDraft }),
      });
      if (res.ok) {
        setEditId(null);
        refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMember(m: StaffMember) {
    if (!window.confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    setBusyId(m.id);
    try {
      await fetch(`/api/admin/staff?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
      setStaff((prev) => prev?.filter((x) => x.id !== m.id) ?? prev);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(m: StaffMember) {
    setBusyId(m.id);
    try {
      await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, active: !m.active }),
      });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section style={{ padding: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Staff Management</h2>
        <p style={{ ...subtleTextStyle, fontSize: 13 }}>
          Manage technicians and managers. Assign staff to repair appointments.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={() => setShowAdd((s) => !s)} style={primaryButtonStyle}>
          {showAdd ? "Cancel" : "+ Add staff"}
        </button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <input placeholder="Name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ padding: 8, minWidth: 160 }} />
          <input placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={{ padding: 8, width: 180 }} />
          <input placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} style={{ padding: 8, width: 140 }} />
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} style={{ padding: 8 }}>
            <option value="technician">Technician</option>
            <option value="manager">Manager</option>
          </select>
          <button onClick={addMember} disabled={saving || !draft.name.trim()} style={primaryButtonStyle}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {!staff && <p style={subtleTextStyle}>Loading...</p>}
      {staff && staff.length === 0 && (
        <p style={subtleTextStyle}>No staff members yet. Add one to get started.</p>
      )}

      {staff && staff.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staff.map((m) =>
            editId === m.id ? (
              <div key={m.id} style={{ ...cardStyle, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input placeholder="Name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} style={{ padding: 6, flex: 1, minWidth: 120 }} />
                <input placeholder="Email" value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} style={{ padding: 6, width: 160 }} />
                <input placeholder="Phone" value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} style={{ padding: 6, width: 120 }} />
                <select value={editDraft.role} onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })} style={{ padding: 6 }}>
                  <option value="technician">Technician</option>
                  <option value="manager">Manager</option>
                </select>
                <button onClick={() => saveEdit(m.id)} disabled={busyId === m.id} style={{ ...primaryButtonStyle, fontSize: 12 }}>
                  {busyId === m.id ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditId(null)} style={{ fontSize: 12 }}>Cancel</button>
              </div>
            ) : (
              <div key={m.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
                      {m.email && <span>{m.email}</span>}
                      {m.phone && <span>{m.phone}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={badgeStyle(m.role === "manager" ? "info" : "neutral")}>{m.role}</span>
                  <span style={badgeStyle(m.active ? "ok" : "error")}>{m.active ? "Active" : "Inactive"}</span>
                  <button onClick={() => toggleActive(m)} disabled={busyId === m.id} style={{ fontSize: 11, padding: "4px 8px" }}>
                    {m.active ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => startEdit(m)} disabled={busyId === m.id} style={{ fontSize: 11, padding: "4px 8px" }}>
                    Edit
                  </button>
                  <button onClick={() => deleteMember(m)} disabled={busyId === m.id} style={{ fontSize: 11, padding: "4px 8px" }}>
                    {busyId === m.id ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
