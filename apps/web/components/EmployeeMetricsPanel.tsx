"use client";

import { useEffect, useState, useMemo } from "react";


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

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Employee metrics</span>
        {!loading && staff.length > 0 && (
          <span className="data" style={{ fontSize: 11 }}>{staff.length} technicians</span>
        )}
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14 }}>
          Performance overview per technician. Auto-refreshes with repair/time data.
        </p>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 28 }} />
            <div className="skeleton" style={{ height: 28 }} />
            <div className="skeleton" style={{ height: 28 }} />
          </div>
        )}

        {!loading && !staff.length && (
          <div className="empty-state">
            <div className="empty-state-title">No staff members yet</div>
            <div className="empty-state-description">
              Add technicians on the Staff tab — repairs they complete and hours they clock show up here.
            </div>
          </div>
        )}

        {!loading && staff.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Technician</th>
                  <th scope="col" style={{ textAlign: "right" }}>Repairs done</th>
                  <th scope="col" style={{ textAlign: "right" }}>Revenue</th>
                  <th scope="col" style={{ textAlign: "right" }}>Hours worked</th>
                  <th scope="col" style={{ textAlign: "right" }}>Repairs / hr</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const member = staff.find((s) => s.id === m.staffId);
                  return (
                    <tr key={m.staffId}>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className={member?.active ? "lamp lamp-ok" : "lamp lamp-idle"}>
                            {member?.active ? "Active" : "Inactive"}
                          </span>
                          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{member?.name ?? "—"}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}><span className="data">{m.repairsCompleted}</span></td>
                      <td style={{ textAlign: "right" }}><span className="data">{fmtCurrency(m.totalRevenue)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="data">{m.totalHours}h</span></td>
                      <td style={{ textAlign: "right" }}>
                        <span className={m.efficiency > 0.5 ? "lamp lamp-ok" : "lamp lamp-idle"}>
                          {m.efficiency.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><span className="instrument-label">Total</span></td>
                  <td style={{ textAlign: "right" }}>
                    <span className="data" style={{ color: "var(--ink)" }}>{metrics.reduce((s, m) => s + m.repairsCompleted, 0)}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="data" style={{ color: "var(--ink)" }}>
                      {fmtCurrency(metrics.reduce((s, m) => s + m.totalRevenue, 0))}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="data" style={{ color: "var(--ink)" }}>{metrics.reduce((s, m) => s + m.totalHours, 0)}h</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="data" style={{ color: "var(--ink)" }}>
                      {(metrics.reduce((s, m) => s + m.repairsCompleted, 0) / (metrics.reduce((s, m) => s + m.totalHours, 0) || 1)).toFixed(2)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}