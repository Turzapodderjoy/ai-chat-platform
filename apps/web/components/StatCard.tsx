"use client";

import { cardStyle } from "./dashboard-styles";

/** One number/status at a glance — the building block for both Overview
 * pages' stat-card rows. */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div style={{ ...cardStyle, marginBottom: 0, minWidth: 160, flex: "1 1 160px" }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export function StatCardRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
      {children}
    </div>
  );
}
