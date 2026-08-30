import type { CSSProperties } from "react";

export const cellStyle: CSSProperties = {
  textAlign: "left",
};

export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Card styles
export const cardStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md, 12px)",
  padding: 20,
  marginBottom: 16,
};

export const cardHoverStyle: CSSProperties = {
  ...cardStyle,
  transition: "all 0.2s ease",
  cursor: "default",
};

// Text styles
export const subtleTextStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 13,
  marginTop: 4,
};

export const labelTextStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-muted)",
  marginBottom: 8,
};

// Button styles
export const primaryButtonStyle: CSSProperties = {
  background: "var(--accent)",
  borderColor: "var(--accent)",
  color: "white",
  fontWeight: 500,
};

export const secondaryButtonStyle: CSSProperties = {
  background: "var(--surface)",
  borderColor: "var(--border)",
  color: "var(--text)",
};

export const dangerButtonStyle: CSSProperties = {
  background: "var(--danger)",
  borderColor: "var(--danger)",
  color: "white",
};

// Badge styles
export type BadgeTone = "ok" | "warn" | "error" | "neutral" | "info";

const BADGE_COLORS: Record<BadgeTone, { bg: string; fg: string }> = {
  ok: { bg: "var(--success-subtle)", fg: "var(--success)" },
  warn: { bg: "var(--warning-subtle)", fg: "var(--warning)" },
  error: { bg: "var(--danger-subtle)", fg: "var(--danger)" },
  neutral: { bg: "var(--surface-hover)", fg: "var(--text-secondary)" },
  info: { bg: "var(--info-subtle)", fg: "var(--info)" },
};

export function badgeStyle(tone: BadgeTone): CSSProperties {
  const c = BADGE_COLORS[tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: "var(--radius-full, 9999px)",
    fontSize: 12,
    fontWeight: 500,
    background: c.bg,
    color: c.fg,
    whiteSpace: "nowrap",
  };
}

// Input styles
export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 14,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm, 8px)",
  color: "var(--text)",
  outline: "none",
};

// Section header style
export const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 16,
};

// Grid layouts
export const gridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

export const grid2Style: CSSProperties = {
  ...gridStyle,
  gridTemplateColumns: "repeat(2, 1fr)",
};

export const grid3Style: CSSProperties = {
  ...gridStyle,
  gridTemplateColumns: "repeat(3, 1fr)",
};

export const grid4Style: CSSProperties = {
  ...gridStyle,
  gridTemplateColumns: "repeat(4, 1fr)",
};

// Responsive grid
export const responsiveGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
};

// Flex styles
export const flexCenterStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const flexBetweenStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export const flexGapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

// Divider
export const dividerStyle: CSSProperties = {
  height: 1,
  background: "var(--border-subtle)",
  margin: "16px 0",
};
