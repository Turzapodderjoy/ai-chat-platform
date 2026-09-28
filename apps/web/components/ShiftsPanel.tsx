"use client";

import { useCallback, useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle, inputStyle, labelTextStyle } from "./dashboard-styles";
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

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Shifts</h3>
          <p style={subtleTextStyle}>Schedule staff across locations.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ ...labelTextStyle, color: "#6b7280" }}>{shifts.length} shifts</span>
          <button style={primaryButtonStyle} onClick={openCreate}>
            + New Shift
          </button>
        </div>
      </div>

      {loading ? (
        <p style={subtleTextStyle}>Loading shifts…</p>
      ) : shifts.length === 0 ? (
        <p style={subtleTextStyle}>No shifts yet. Schedule your first one.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shifts.map((shift) => (
            <div key={shift.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f9fafb", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{shift.title}</div>
                <p style={{ ...subtleTextStyle, margin: "2px 0 0" }}>
                  {formatRange(shift.startAt, shift.endAt)}
                  {" · "}
                  {shift.staff?.name ?? "Unassigned"}
                  {shift.location ? ` · ${shift.location.name}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={secondaryButtonStyle} onClick={() => openEdit(shift)}>
                  Edit
                </button>
                <button style={dangerButtonStyle} onClick={() => handleDelete(shift)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showDialog) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => {
            if (!saving) {
              setEditing(null);
              setShowDialog(false);
            }
          }}
        >
          <div
            style={{ ...cardStyle, width: 440, maxWidth: "92vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 12 }}>
              {editing ? "Edit Shift" : "New Shift"}
            </h3>

            <label style={{ ...labelTextStyle, display: "block", marginBottom: 4 }}>Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Morning Counter Shift"
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            />

            <label style={{ ...labelTextStyle, display: "block", marginBottom: 4 }}>Staff</label>
            <select
              value={draft.staffId}
              onChange={(e) => setDraft({ ...draft, staffId: e.target.value })}
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <label style={{ ...labelTextStyle, display: "block", marginBottom: 4 }}>Location</label>
            <select
              value={draft.locationId}
              onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            >
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <label style={{ ...labelTextStyle, display: "block", marginBottom: 4 }}>Start</label>
            <input
              type="datetime-local"
              value={draft.startAt}
              onChange={(e) => setDraft({ ...draft, startAt: e.target.value })}
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            />

            <label style={{ ...labelTextStyle, display: "block", marginBottom: 4 }}>End</label>
            <input
              type="datetime-local"
              value={draft.endAt}
              onChange={(e) => setDraft({ ...draft, endAt: e.target.value })}
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
            />

            <label style={{ ...labelTextStyle, display: "block", marginBottom: 4 }}>Notes</label>
            <input
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Optional"
              style={{ ...inputStyle, width: "100%", marginBottom: 12 }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={secondaryButtonStyle} onClick={() => {
                setEditing(null);
                setShowDialog(false);
              }}>
                Cancel
              </button>
              <button
                style={primaryButtonStyle}
                onClick={save}
                disabled={saving || !draft.title || !draft.startAt || !draft.endAt}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}