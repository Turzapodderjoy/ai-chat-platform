"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { showAlert, showConfirm } from "../lib/app-dialog";

// Wave B #12 - Shifts panel. Staff scheduling: pick a staff member (from the
// Studio Staff list) and a Location, set start/end, track notes. The API joins
// staff + location names server-side; this panel just renders them.

interface Staff {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface Shift {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  notes: string | null;
  staff: Staff | null;
  location: Location | null;
}

interface ShiftDraft {
  staffId: string;
  locationId: string;
  title: string;
  startAt: string;
  endAt: string;
  notes: string;
}

const EMPTY_DRAFT: ShiftDraft = {
  staffId: "",
  locationId: "",
  title: "",
  startAt: "",
  endAt: "",
  notes: "",
};

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

export function ShiftsPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [draft, setDraft] = useState<ShiftDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/shifts?businessId=${encodeURIComponent(businessId)}`);
      const data = await res.json();
      setShifts(data.shifts ?? []);
      setStaff(data.staff ?? []);
      setLocations(data.locations ?? []);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setShowDialog(true);
  };

  const openEdit = (shift: Shift) => {
    setEditing(shift);
    setDraft({
      staffId: shift.staff?.id ?? "",
      locationId: shift.location?.id ?? "",
      title: shift.title,
      startAt: toLocalInput(shift.startAt),
      endAt: toLocalInput(shift.endAt),
      notes: shift.notes ?? "",
    });
    setShowDialog(true);
  };

  const save = async () => {
    if (!draft.title || !draft.startAt || !draft.endAt) return;
    setSaving(true);
    const body = {
      ...(editing ? { id: editing.id } : {}),
      businessId,
      staffId: draft.staffId || null,
      locationId: draft.locationId || null,
      title: draft.title,
      startAt: draft.startAt,
      endAt: draft.endAt,
      notes: draft.notes || null,
    };
    const res = await fetch(`/api/admin/shifts`, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(null);
      setShowDialog(false);
      refresh();
    } else {
      showAlert("Failed to save shift");
    }
  };

  const handleDelete = async (shift: Shift) => {
    if (!(await showConfirm(`Delete ${shift.title}?`))) return;
    const res = await fetch(`/api/admin/shifts?id=${encodeURIComponent(shift.id)}`, { method: "DELETE" });
    if (res.ok) {
      refresh();
    } else {
      showAlert("Failed to delete shift");
    }
  };

const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  padding: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "color-mix(in srgb, var(--ink) 45%, transparent)",
};

const DIALOG: CSSProperties = { width: 460, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" };

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

function shiftHours(shift: Shift): string {
  const ms = new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime();
  if (!Number.isFinite(ms)) return "—";
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Shifts</span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>{shifts.length} scheduled</span>
          <button className="primary sm" onClick={openCreate}>
            New shift
          </button>
        </span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14 }}>Schedule staff across locations.</p>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 56 }} />
            <div className="skeleton" style={{ height: 56 }} />
          </div>
        ) : shifts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No shifts scheduled</div>
            <div className="empty-state-description">
              Add the first shift to put a name, a location and a start/end time on the roster.
            </div>
            <button className="primary sm" style={{ marginTop: 6 }} onClick={openCreate}>
              New shift
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shifts.map((shift) => (
              <div key={shift.id} style={ROW}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{shift.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 3 }}>
                    <span className="data" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                      {formatRange(shift.startAt, shift.endAt)}
                    </span>
                    <span className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                      {shiftHours(shift)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 5 }}>
                    <span className={shift.staff ? "lamp lamp-ok" : "lamp lamp-warn"}>
                      {shift.staff?.name ?? "Unassigned"}
                    </span>
                    {shift.location && (
                      <span className="lamp lamp-idle">{shift.location.name}</span>
                    )}
                  </div>
                  {shift.notes && (
                    <p className="meta" style={{ marginTop: 6, marginBottom: 0, maxWidth: "58ch" }}>{shift.notes}</p>
                  )}
                </div>
                <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
                  <button className="ghost sm" onClick={() => openEdit(shift)}>
                    Edit
                  </button>
                  <button className="danger sm" onClick={() => handleDelete(shift)}>
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDialog && (
        <div
          style={OVERLAY}
          onClick={() => {
            if (!saving) {
              setEditing(null);
              setShowDialog(false);
            }
          }}
        >
          <div className="panel" style={DIALOG} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={editing ? "Edit shift" : "New shift"}>
            <div className="panel-head">
              <span className="instrument-label">{editing ? "Edit shift" : "New shift"}</span>
            </div>
            <div className="panel-body">
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="shift-title">Title</label>
                <input
                  id="shift-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Morning counter shift"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
                <div className="field">
                  <label className="field-label" htmlFor="shift-staff">Staff</label>
                  <select id="shift-staff" value={draft.staffId} onChange={(e) => setDraft({ ...draft, staffId: e.target.value })}>
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="shift-location">Location</label>
                  <select id="shift-location" value={draft.locationId} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}>
                    <option value="">No location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="shift-start">Start</label>
                  <input
                    id="shift-start"
                    type="datetime-local"
                    value={draft.startAt}
                    onChange={(e) => setDraft({ ...draft, startAt: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="shift-end">End</label>
                  <input
                    id="shift-end"
                    type="datetime-local"
                    value={draft.endAt}
                    onChange={(e) => setDraft({ ...draft, endAt: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="shift-notes">Notes</label>
                <input
                  id="shift-notes"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  className="ghost"
                  onClick={() => {
                    setEditing(null);
                    setShowDialog(false);
                  }}
                >
                  Cancel
                </button>
                <button className="primary" onClick={save} disabled={saving || !draft.title || !draft.startAt || !draft.endAt}>
                  {saving ? "Saving" : "Save shift"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
