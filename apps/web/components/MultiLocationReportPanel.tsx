"use client";

import { useCallback, useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, labelTextStyle } from "./dashboard-styles";

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
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Multi-Location Report</h3>
          <p style={subtleTextStyle}>Shift & staff coverage per location.</p>
        </div>
        <button style={primaryButtonStyle} onClick={refresh}>
          Refresh
        </button>
      </div>

      {report?.scopeBoundary && (
        <p style={{ ...subtleTextStyle, fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>{report.scopeBoundary}</p>
      )}

      {loading ? (
        <p style={subtleTextStyle}>Loading…</p>
      ) : !report || report.rows.length === 0 ? (
        <p style={subtleTextStyle}>No locations yet. Add locations and assign shifts to see coverage.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ ...labelTextStyle, color: "#6b7280", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "8px 10px" }}>Location</th>
                <th style={{ padding: "8px 10px" }}>Shifts (total)</th>
                <th style={{ padding: "8px 10px" }}>Upcoming</th>
                <th style={{ padding: "8px 10px" }}>Active now</th>
                <th style={{ padding: "8px 10px" }}>Staff covered</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px", fontWeight: 600 }}>
                    {r.name}
                    {!r.isActive && <span style={{ ...subtleTextStyle, marginLeft: 6 }}>(inactive)</span>}
                    <div style={{ ...subtleTextStyle, fontWeight: 400, fontSize: 12 }}>{r.city ?? "\u00a0"}</div>
                  </td>
                  <td style={{ padding: "10px" }}>{r.shiftsTotal}</td>
                  <td style={{ padding: "10px" }}>{r.shiftsUpcoming}</td>
                  <td style={{ padding: "10px" }}>{r.shiftsActiveNow}</td>
                  <td style={{ padding: "10px" }}>{r.staffCount}</td>
                </tr>
              ))}
              {report.total && (
                <tr style={{ fontWeight: 700, borderTop: "2px solid #e5e7eb" }}>
                  <td style={{ padding: "10px" }}>Totals</td>
                  <td style={{ padding: "10px" }}>{report.total.shiftsTotal}</td>
                  <td style={{ padding: "10px" }}>{report.total.shiftsUpcoming}</td>
                  <td style={{ padding: "10px" }}>{report.total.shiftsActiveNow}</td>
                  <td style={{ padding: "10px" }}>{report.total.staffCount}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}