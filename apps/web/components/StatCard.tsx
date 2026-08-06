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
    <div
      style={{
        ...cardStyle,
        marginBottom: 0,
        minWidth: 160,
        flex: "1 1 160px",
        transition: "transform 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>{hint}</div>}
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
