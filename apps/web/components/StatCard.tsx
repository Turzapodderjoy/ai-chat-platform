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
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{
          padding: "8px",
          borderRadius: "var(--radius-sm, 8px)",
          background: config.bg,
          color: config.color,
        }}>
          {icon || (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          )}
        </div>
        {hint && (
          <span style={{ fontSize: 11, color: config.color, fontWeight: 500 }}>{hint}</span>
        )}
      </div>
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
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: 16,
      marginBottom: 24,
    }}>
      {children}
    </div>
  );
}
