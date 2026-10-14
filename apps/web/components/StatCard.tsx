"use client";

export type StatTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

// The tone only tints the delta line. The reading itself is always --ink:
// a metric that changes colour with its own value is decoration, not
// information, and status colour is reserved for status.
const DELTA_COLOR: Record<StatTone, string> = {
  neutral: "var(--ink-3)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  accent: "var(--accent)",
};

/** One instrument reading: a quiet label, a large monospace number in
 * --ink, and an optional delta underneath in the tone's colour. Hairline
 * container, no hover state -- a metric does not respond to a cursor. */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <div className="panel" style={{ padding: "12px 14px" }}>
      <div className="meta">{label}</div>
      <div
        className="data"
        style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", lineHeight: 1.15, marginTop: 4 }}
      >
        {value}
      </div>
      {hint && (
        <div className="meta" style={{ marginTop: 3, fontWeight: 500, color: DELTA_COLOR[tone] }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function StatCardRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
        gap: 10,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}