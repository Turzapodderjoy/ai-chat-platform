"use client";

import { useCallback, useEffect, useState } from "react";

import { dataStrongStyle } from "./dashboard-styles";

// Wave B #33 - Multi-location report. Rollup of location-scoped shift + staff
// coverage per location. Orders/repairs/inventory are not location-scoped yet,
// so the header states the boundary instead of implying revenue per location.

interface LocationRow {
  id: string;
  name: string;
  city: string | null;
  isActive: boolean;
  shiftsTotal: number;
  shiftsUpcoming: number;
  shiftsActiveNow: number;
  staffCount: number;
}

interface Report {
  generatedAt: string;
  rows: LocationRow[];
  total: { shiftsTotal: number; shiftsUpcoming: number; shiftsActiveNow: number; staffCount: number } | null;
  scopeBoundary: string;
}

export function MultiLocationReportPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/multi-location-report?businessId=${encodeURIComponent(businessId)}`);
      const data = await res.json();
      setReport(data);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Multi-location coverage</span>
          <div className="meta">
            {report?.scopeBoundary ?? "Shift and staff coverage per location."}
          </div>
        </div>
        <button type="button" className="sm" onClick={refresh}>
          Refresh coverage
        </button>
      </div>

      <div className="panel-body">
        {loading ? (
          <p className="meta">Loading locations</p>
        ) : !report || report.rows.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-title">No locations yet</span>
            <span className="empty-state-description">
              Add locations and assign shifts to see coverage here.
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th className="num" style={{ textAlign: "right" }}>Shifts</th>
                  <th className="num" style={{ textAlign: "right" }}>Upcoming</th>
                  <th className="num" style={{ textAlign: "right" }}>Active now</th>
                  <th className="num" style={{ textAlign: "right" }}>Staff covered</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{r.name}</span>
                      {r.isActive ? (
                        <div><span className="lamp lamp-ok">Active</span></div>
                      ) : (
                        <div><span className="lamp lamp-idle">Inactive</span></div>
                      )}
                      {r.city && <div className="meta">{r.city}</div>}
                    </td>
                    <td className="data num" style={{ textAlign: "right" }}>{r.shiftsTotal}</td>
                    <td className="data num" style={{ textAlign: "right" }}>{r.shiftsUpcoming}</td>
                    <td className="data num" style={{ textAlign: "right" }}>{r.shiftsActiveNow}</td>
                    <td className="data num" style={{ textAlign: "right" }}>{r.staffCount}</td>
                  </tr>
                ))}
                {report.total && (
                  <tr style={{ borderTop: "2px solid var(--line-strong)" }}>
                    <td className="meta" style={{ color: "var(--ink)", fontWeight: 600 }}>Totals</td>
                    <td className="num" style={{ ...dataStrongStyle, textAlign: "right" }}>{report.total.shiftsTotal}</td>
                    <td className="num" style={{ ...dataStrongStyle, textAlign: "right" }}>{report.total.shiftsUpcoming}</td>
                    <td className="num" style={{ ...dataStrongStyle, textAlign: "right" }}>{report.total.shiftsActiveNow}</td>
                    <td className="num" style={{ ...dataStrongStyle, textAlign: "right" }}>{report.total.staffCount}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}