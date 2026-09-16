"use client";

export type StatTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE_CONFIG: Record<StatTone, { color: string; bg: string }> = {
  neutral: { color: "var(--text-muted)", bg: "var(--surface-hover)" },
  success: { color: "var(--success)", bg: "var(--success-subtle)" },
  warning: { color: "var(--warning)", bg: "var(--warning-subtle)" },
  danger: { color: "var(--danger)", bg: "var(--danger-subtle)" },
  info: { color: "var(--info)", bg: "var(--info-subtle)" },
  accent: { color: "var(--accent)", bg: "var(--accent-subtle)" },
};

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
  const config = TONE_CONFIG[tone];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md, 12px)",
        padding: "20px",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {hint && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: config.color, fontWeight: 500 }}>{hint}</span>
        </div>
      )}
      <div style={{
        fontSize: 28,
        fontWeight: 700,
        color: "var(--text)",
        letterSpacing: "-0.02em",
        lineHeight: 1,
        marginBottom: 6,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 13,
        color: "var(--text-muted)",
        fontWeight: 500,
      }}>
        {label}
      </div>
    </div>
  );
}

export function StatCardRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
      gap: 16,
      marginBottom: 24,
    }}>
      {children}
    </div>
  );
}
