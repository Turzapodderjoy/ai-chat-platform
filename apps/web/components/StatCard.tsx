"use client";

export type StatTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_COLOR: Record<StatTone, string> = {
  neutral: "var(--text-faint)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--accent)",
};

/** One number/status at a glance — the building block for both Overview
 * pages' stat-card rows. A thin tone-colored top bar (not the whole
 * card tinted) keeps a full row scannable at a glance without turning
 * into a wall of colored boxes — same restrained-semantic-color
 * approach as the rest of the dashboard's badges. */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <div
      style={{
        position: "relative",
        background: "var(--md-surface-1, var(--bg-elevated))",
        border: "1px solid var(--border)",
        borderRadius: "var(--md-shape-lg, var(--radius))",
        padding: "18px 20px 20px",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
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
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: TONE_COLOR[tone] }} />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

/** CSS grid, not flex-wrap — every card in the row sits on the same
 * baseline and column width regardless of how many there are or how
 * long each one's content is, instead of flex-wrap's ragged last row. */
export function StatCardRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 14,
        marginBottom: 28,
      }}
    >
      {children}
    </div>
  );
}
