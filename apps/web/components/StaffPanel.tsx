"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { showConfirm } from "../lib/app-dialog";

interface StaffMember {
  id: string;
  businessId: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  skills?: string[];
  active: boolean;
  createdAt: string;
}

const EMPTY_DRAFT = { name: "", email: "", phone: "", role: "technician", skills: "" };

function splitSkills(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
        body: JSON.stringify({ businessId, ...draft, skills: splitSkills(draft.skills) }),
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
    setEditDraft({ name: m.name, email: m.email ?? "", phone: m.phone ?? "", role: m.role, skills: (m.skills ?? []).join(", ") });
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editDraft, skills: splitSkills(editDraft.skills) }),
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
    if (!(await showConfirm(`Delete "${m.name}"? This cannot be undone.`))) return;
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

const CONTROL_ROW: CSSProperties = { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" };

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: "var(--r-pill)",
  border: "1px solid var(--line)",
  background: "var(--panel)",
  fontSize: 11.5,
  color: "var(--ink-2)",
  whiteSpace: "nowrap",
};

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "11px 12px",
  border: "1px solid var(--line-soft)",
  borderRadius: "var(--r-sm)",
  background: "var(--panel)",
};

const AVATAR: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--accent)",
  background: "var(--accent-subtle)",
};

return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Staff management</span>
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {staff ? `${staff.length} members` : "—"}
        </span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14, maxWidth: "64ch" }}>
          Manage technicians and managers. Assign staff to repair appointments.
        </p>

        <div className="toolbar">
          <button onClick={() => setShowAdd((s) => !s)} className={showAdd ? "ghost" : "primary"}>
            {showAdd ? "Cancel" : "Add staff"}
          </button>
        </div>

        {showAdd && (
          <div className="panel-sunk" style={{ padding: 14, marginBottom: 16 }}>
            <div style={CONTROL_ROW}>
              <div className="field" style={{ minWidth: 170 }}>
                <label className="field-label" htmlFor="staff-new-name">Name</label>
                <input id="staff-new-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div className="field" style={{ minWidth: 190 }}>
                <label className="field-label" htmlFor="staff-new-email">Email</label>
                <input id="staff-new-email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div className="field" style={{ minWidth: 140 }}>
                <label className="field-label" htmlFor="staff-new-phone">Phone</label>
                <input id="staff-new-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div className="field" style={{ minWidth: 150 }}>
                <label className="field-label" htmlFor="staff-new-role">Role</label>
                <select id="staff-new-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} style={{ fontSize: 13 }}>
                  <option value="technician">Technician</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="field" style={{ minWidth: 200, flex: 1 }}>
                <label className="field-label" htmlFor="staff-new-skills">Skills</label>
                <input
                  id="staff-new-skills"
                  placeholder="Comma-separated"
                  value={draft.skills}
                  onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
                  style={{ fontSize: 13 }}
                />
              </div>
              <button onClick={addMember} disabled={saving || !draft.name.trim()} className="primary">
                {saving ? "Saving" : "Save staff member"}
              </button>
            </div>
          </div>
        )}

        {!staff && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 58 }} />
            <div className="skeleton" style={{ height: 58 }} />
          </div>
        )}

        {staff && staff.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No staff members yet</div>
            <div className="empty-state-description">
              Add a technician or manager so repair appointments have someone to assign to.
            </div>
            <button onClick={() => setShowAdd(true)} className="primary sm" style={{ marginTop: 6 }}>
              Add staff
            </button>
          </div>
        )}

        {staff && staff.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {staff.map((m) =>
              editId === m.id ? (
                <div key={m.id} className="panel-sunk" style={{ padding: 14 }}>
                  <span className="instrument-label" style={{ display: "block", marginBottom: 10 }}>
                    Editing {m.name}
                  </span>
                  <div style={CONTROL_ROW}>
                    <div className="field" style={{ minWidth: 150 }}>
                      <label className="field-label" htmlFor={`staff-edit-name-${m.id}`}>Name</label>
                      <input
                        id={`staff-edit-name-${m.id}`}
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div className="field" style={{ minWidth: 180 }}>
                      <label className="field-label" htmlFor={`staff-edit-email-${m.id}`}>Email</label>
                      <input
                        id={`staff-edit-email-${m.id}`}
                        value={editDraft.email}
                        onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div className="field" style={{ minWidth: 140 }}>
                      <label className="field-label" htmlFor={`staff-edit-phone-${m.id}`}>Phone</label>
                      <input
                        id={`staff-edit-phone-${m.id}`}
                        value={editDraft.phone}
                        onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div className="field" style={{ minWidth: 145 }}>
                      <label className="field-label" htmlFor={`staff-edit-role-${m.id}`}>Role</label>
                      <select
                        id={`staff-edit-role-${m.id}`}
                        value={editDraft.role}
                        onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}
                        style={{ fontSize: 13 }}
                      >
                        <option value="technician">Technician</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <div className="field" style={{ minWidth: 190, flex: 1 }}>
                      <label className="field-label" htmlFor={`staff-edit-skills-${m.id}`}>Skills</label>
                      <input
                        id={`staff-edit-skills-${m.id}`}
                        placeholder="Comma-separated"
                        value={editDraft.skills}
                        onChange={(e) => setEditDraft({ ...editDraft, skills: e.target.value })}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <button onClick={() => saveEdit(m.id)} disabled={busyId === m.id} className="primary sm">
                      {busyId === m.id ? "Saving" : "Save changes"}
                    </button>
                    <button onClick={() => setEditId(null)} className="ghost sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={m.id} style={ROW}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={AVATAR}>{m.name.charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{m.name}</div>
                      {(m.email || m.phone) && (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                          {m.email && <span className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.email}</span>}
                          {m.phone && <span className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.phone}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span className={m.role === "manager" ? "lamp lamp-info" : "lamp lamp-idle"}>
                      {m.role === "manager" ? "Manager" : "Technician"}
                    </span>
                    {(m.skills ?? []).map((s) => (
                      <span key={s} style={CHIP}>{s}</span>
                    ))}
                    <span className={m.active ? "lamp lamp-ok" : "lamp lamp-err"}>
                      {m.active ? "Active" : "Inactive"}
                    </span>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button onClick={() => toggleActive(m)} disabled={busyId === m.id} className="ghost sm">
                        {m.active ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => startEdit(m)} disabled={busyId === m.id} className="ghost sm">
                        Edit
                      </button>
                      <button onClick={() => deleteMember(m)} disabled={busyId === m.id} className="danger sm">
                        {busyId === m.id ? "…" : "Delete"}
                      </button>
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
