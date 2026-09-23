"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, badgeStyle } from "./dashboard-styles";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

interface TimeEntry {
  id: string;
  staffId: string;
  clockIn: string;
  clockOut: string | null;
  note: string | null;
}

export function TimeClockPanel({ businessId }: { businessId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [note, setNote] = useState("");
  const [clocking, setClocking] = useState(false);
  const [currentShift, setCurrentShift] = useState<TimeEntry | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  function refreshStaff() {
    fetch(`/api/admin/staff?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { staff: StaffMember[] }) => setStaff(d.staff ?? []));
  }

  function refreshEntries() {
    const qs = new URLSearchParams({ businessId });
    if (selectedStaffId) qs.set("staffId", selectedStaffId);
    if (fromDate) qs.set("from", fromDate + "T00:00:00");
    if (toDate) qs.set("to", toDate + "T23:59:59");
    fetch(`/api/admin/time-clock?${qs}`)
      .then((r) => r.json())
      .then((d: { entries: TimeEntry[] }) => setEntries(d.entries ?? []));
  }

  function refreshCurrentShift() {
    if (!selectedStaffId) {
      setCurrentShift(null);
      return;
    }
    fetch(`/api/admin/time-clock?businessId=${encodeURIComponent(businessId)}&staffId=${encodeURIComponent(selectedStaffId)}`)
      .then((r) => r.json())
      .then((d: { entries: TimeEntry[] }) => {
        const open = (d.entries ?? []).find((e) => !e.clockOut);
        setCurrentShift(open ?? null);
      });
  }

  useEffect(() => {
    refreshStaff();
  }, [businessId]);

  useEffect(() => {
    refreshEntries();
    refreshCurrentShift();
    const interval = setInterval(() => {
      refreshCurrentShift();
      refreshEntries();
    }, 30000);
    return () => clearInterval(interval);
  }, [businessId, selectedStaffId, fromDate, toDate]);

  async function handleClock(action: "in" | "out") {
    if (!selectedStaffId) return;
    setClocking(true);
    try {
      const res = await fetch("/api/admin/time-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, staffId: selectedStaffId, action, note }),
      });
      if (res.ok) {
        setNote("");
        refreshEntries();
        refreshCurrentShift();
      }
    } finally {
      setClocking(false);
    }
  }

  function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
  }

  function durationMs(start: string, end?: string | null) {
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diff = e - s;
    const hrs = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    return `${hrs}h ${mins}m`;
  }

  return (
    <section style={{ padding: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Time Clock</h2>
        <p style={{ ...subtleTextStyle, fontSize: 13 }}>
          Staff clock in/out with optional notes. Entries auto-refresh every 30s.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <select
          value={selectedStaffId}
          onChange={(e) => setSelectedStaffId(e.target.value)}
          style={{ padding: 8, minWidth: 200 }}
        >
          <option value="">Select staff member</option>
          {staff.filter((s) => s.active).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.role})
            </option>
          ))}
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          style={{ padding: 8, width: 160 }}
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          style={{ padding: 8, width: 160 }}
        />
      </div>

      {selectedStaffId && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ ...cardStyle, padding: 12, flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Current Shift</div>
            {currentShift ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Clocked in: {fmtDateTime(currentShift.clockIn)}</div>
                {currentShift.note && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{currentShift.note}</div>}
                <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 6 }}>Running: {durationMs(currentShift.clockIn)}</div>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)" }}>Not clocked in</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ padding: 8, width: 200 }}
            />
            <button onClick={() => handleClock("in")} disabled={clocking || !!currentShift} style={primaryButtonStyle}>
              {clocking ? "Clocking…" : "Clock In"}
            </button>
            <button onClick={() => handleClock("out")} disabled={clocking || !currentShift} style={{ ...primaryButtonStyle, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
              {clocking ? "Clocking…" : "Clock Out"}
            </button>
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-faint)" }}>Staff</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-faint)" }}>Clock In</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-faint)" }}>Clock Out</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-faint)" }}>Duration</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-faint)" }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>
                  No time entries found
                </td>
              </tr>
            )}
            {entries.map((e) => {
              const member = staff.find((s) => s.id === e.staffId);
              return (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "8px 10px" }}>{member?.name ?? e.staffId}</td>
                  <td style={{ padding: "8px 10px" }}>{fmtDateTime(e.clockIn)}</td>
                  <td style={{ padding: "8px 10px" }}>{e.clockOut ? fmtDateTime(e.clockOut) : <span style={badgeStyle("info")}>Active</span>}</td>
                  <td style={{ padding: "8px 10px" }}>{durationMs(e.clockIn, e.clockOut)}</td>
                  <td style={{ padding: "8px 10px", color: "var(--text-muted)" }}>{e.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}