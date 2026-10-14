"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

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

const CARD: CSSProperties = {
  padding: 13,
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  background: "var(--panel)",
  boxShadow: "var(--edge-light)",
};

const CONTROL_ROW: CSSProperties = { display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" };

return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Time clock</span>
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {entries.length} entries
        </span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14 }}>
          Staff clock in and out with optional notes. Entries refresh every 30 seconds.
        </p>

        <div className="toolbar">
          <div className="field" style={{ minWidth: 220 }}>
            <label className="field-label" htmlFor="timeclock-staff">Staff member</label>
            <select
              id="timeclock-staff"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              style={{ fontSize: 13 }}
            >
              <option value="">Select staff member</option>
              {staff.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ width: 160 }}>
            <label className="field-label" htmlFor="timeclock-from">From</label>
            <input id="timeclock-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="data" />
          </div>

          <div className="field" style={{ width: 160 }}>
            <label className="field-label" htmlFor="timeclock-to">To</label>
            <input id="timeclock-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="data" />
          </div>
        </div>

        {selectedStaffId && (
          <div style={{ ...CARD, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <span className={currentShift ? "lamp lamp-ok" : "lamp lamp-idle"}>
                {currentShift ? "Clocked in" : "Not clocked in"}
              </span>
              {currentShift ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                  <span className="data" style={{ fontSize: 13, color: "var(--ink)" }}>
                    Since {fmtDateTime(currentShift.clockIn)}
                  </span>
                  <span className="data" style={{ fontSize: 15, color: "var(--accent)" }}>
                    {durationMs(currentShift.clockIn)}
                  </span>
                </div>
              ) : (
                <p className="meta" style={{ marginTop: 6, marginBottom: 0 }}>
                  Clock in to start tracking hours for this person.
                </p>
              )}
              {currentShift?.note && (
                <p className="meta" style={{ marginTop: 6, marginBottom: 0, maxWidth: "48ch" }}>{currentShift.note}</p>
              )}
            </div>

            <div style={CONTROL_ROW}>
              <div className="field" style={{ width: 200 }}>
                <label className="field-label" htmlFor="timeclock-note">Note</label>
                <input
                  id="timeclock-note"
                  placeholder="Optional"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
              <button onClick={() => handleClock("in")} disabled={clocking || !!currentShift} className="primary">
                {clocking ? "Clocking" : "Clock in"}
              </button>
              <button onClick={() => handleClock("out")} disabled={clocking || !currentShift} className="ghost">
                {clocking ? "Clocking" : "Clock out"}
              </button>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No time entries</div>
            <div className="empty-state-description">
              {selectedStaffId
                ? "This person has no clock-ins in the selected range. Widen the dates or clear them."
                : "Pick a staff member, or clear the date range to see every entry."}
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th className="num">Duration</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const member = staff.find((s) => s.id === e.staffId);
                  return (
                    <tr key={e.id}>
                      <td style={{ color: "var(--ink)", fontWeight: 500 }}>{member?.name ?? e.staffId}</td>
                      <td><span className="data" style={{ fontSize: 12 }}>{fmtDateTime(e.clockIn)}</span></td>
                      <td>
                        {e.clockOut ? (
                          <span className="data" style={{ fontSize: 12 }}>{fmtDateTime(e.clockOut)}</span>
                        ) : (
                          <span className="lamp lamp-ok">Running</span>
                        )}
                      </td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{durationMs(e.clockIn, e.clockOut)}</td>
                      <td className="meta">{e.note ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
