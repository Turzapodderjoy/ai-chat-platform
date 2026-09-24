"use client";

import { useEffect, useState, useMemo } from "react";

import { cardStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

interface RepairAppointment {
  id: string;
  technicianId?: string;
  status: string;
  appointmentDate: string;
  items: { finalPrice: number; quantity: number }[];
  actualCost?: number;
}

interface TimeEntry {
  id: string;
  staffId: string;
  clockIn: string;
  clockOut: string | null;
}

interface Metrics {
  staffId: string;
  repairsCompleted: number;
  totalRevenue: number;
  totalHours: number;
  avgCompletionHours: number;
  efficiency: number;
}

export function EmployeeMetricsPanel({ businessId }: { businessId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [repairs, setRepairs] = useState<RepairAppointment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/staff?businessId=${encodeURIComponent(businessId)}`).then(r => r.json()),
      fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`).then(r => r.json()),
      fetch(`/api/admin/time-clock?businessId=${encodeURIComponent(businessId)}`).then(r => r.json()),
    ]).then(([staffRes, repairsRes, timeRes]) => {
      setStaff(staffRes.staff ?? []);
      setRepairs(repairsRes.appointments ?? []);
      setTimeEntries(timeRes.entries ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, [businessId]);

  const metrics = useMemo((): Metrics[] => {
    if (!staff.length) return [];

    return staff.map((s) => {
      const staffRepairs = repairs.filter((r) => r.technicianId === s.id && r.status === "completed");
      const repairsCompleted = staffRepairs.length;

      const totalRevenue = staffRepairs.reduce((sum, r) => 
        sum + r.items.reduce((s, i) => s + i.finalPrice * i.quantity, 0), 0);

      const staffTimeEntries = timeEntries.filter((e) => e.staffId === s.id && e.clockOut);
      const totalMs = staffTimeEntries.reduce((sum, e) => 
        sum + (new Date(e.clockOut!).getTime() - new Date(e.clockIn).getTime()), 0);
      const totalHours = Math.round(totalMs / 3_600_000 * 10) / 10;

      const completedWithDuration = staffRepairs.filter((r) => r.appointmentDate);
      let avgCompletionHours = 0;
      if (completedWithDuration.length) {
        // Simplified: use appointmentDate as proxy for completion time
        // Real implementation would need a completedAt field
        avgCompletionHours = 24; // placeholder
      }

      return {
        staffId: s.id,
        repairsCompleted,
        totalRevenue,
        totalHours,
        avgCompletionHours,
        efficiency: totalHours > 0 ? Math.round((repairsCompleted / totalHours) * 100) / 100 : 0,
      };
    });
  }, [staff, repairs, timeEntries]);

  function fmtCurrency(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  }

  if (loading) return <p style={subtleTextStyle}>Loading metrics…</p>;

  return (
    <section style={{ padding: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Employee Metrics</h2>
        <p style={{ ...subtleTextStyle, fontSize: 13 }}>
          Performance overview per technician. Auto-refreshes with repair/time data.
        </p>
      </div>

      {!staff.length && <p style={subtleTextStyle}>No staff members yet.</p>}

      {staff.length > 0 && (
        <div style={{ ...cardStyle, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-faint)" }}>Technician</th>
                <th style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-faint)" }}>Repairs Done</th>
                <th style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-faint)" }}>Revenue</th>
                <th style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-faint)" }}>Hours Worked</th>
                <th style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-faint)" }}>Repairs/Hr</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const member = staff.find((s) => s.id === m.staffId);
                return (
                  <tr key={m.staffId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 500 }}>{member?.name ?? "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{m.repairsCompleted}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtCurrency(m.totalRevenue)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{m.totalHours}h</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: m.efficiency > 0.5 ? "var(--success)" : "var(--text)" }}>
                      {m.efficiency.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 600 }}>
                <td style={{ padding: "8px 10px" }}>Total</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{metrics.reduce((s, m) => s + m.repairsCompleted, 0)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtCurrency(metrics.reduce((s, m) => s + m.totalRevenue, 0))}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{metrics.reduce((s, m) => s + m.totalHours, 0)}h</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{(metrics.reduce((s, m) => s + m.repairsCompleted, 0) / (metrics.reduce((s, m) => s + m.totalHours, 0) || 1)).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}