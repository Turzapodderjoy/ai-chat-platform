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

// Panels — hairline box with an instrument-label header, not a card
// with a soft shadow and a floating title.
export const panelStyle: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  boxShadow: "var(--edge-light)",
};

export const cardStyle: CSSProperties = {
  ...panelStyle,
  padding: 16,
  marginBottom: 14,
};

export const cardHoverStyle: CSSProperties = {
  ...panelStyle,
  transition: "border-color var(--dur-state) ease, background var(--dur-state) ease",
};

export const sunkStyle: CSSProperties = {
  background: "var(--panel-sunk)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
  padding: 12,
};

export const machineBlockStyle: CSSProperties = {
  background: "var(--machine-subtle)",
  border: "1px solid var(--machine-line)",
  borderRadius: "var(--r-sm)",
  padding: "12px 14px",
};

// Text
export const subtleTextStyle: CSSProperties = {
  color: "var(--ink-3)",
  fontSize: 12.5,
  marginTop: 4,
};

// Instrument label — sentence case, 11px, tracked a hair.
export const labelTextStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  color: "var(--ink-3)",
  marginBottom: 8,
};

export const metaTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-3)",
};

export const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: "-0.028em",
  color: "var(--ink)",
};

// Data — every number in the console is a monospace instrument reading.
export const dataStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.01em",
};

export const dataStrongStyle: CSSProperties = {
  ...dataStyle,
  fontWeight: 600,
  color: "var(--ink)",
};

export const moneyStyle: CSSProperties = {
  ...dataStrongStyle,
  fontSize: 15,
};

// Buttons
export const primaryButtonStyle: CSSProperties = {
  background: "var(--accent)",
  borderColor: "var(--accent)",
  color: "var(--accent-ink)",
  fontWeight: 600,
};

export const secondaryButtonStyle: CSSProperties = {
  background: "var(--panel)",
  borderColor: "var(--line)",
  color: "var(--ink)",
};

export const dangerButtonStyle: CSSProperties = {
  background: "var(--danger)",
  borderColor: "var(--danger)",
  color: "#fff",
};

export const ghostButtonStyle: CSSProperties = {
  background: "transparent",
  borderColor: "transparent",
  color: "var(--ink-2)",
  boxShadow: "none",
};

export const machineButtonStyle: CSSProperties = {
  background: "var(--machine-subtle)",
  borderColor: "var(--machine-line)",
  color: "var(--machine)",
  fontWeight: 600,
};

export const smallButtonStyle: CSSProperties = {
  padding: "4px 9px",
  fontSize: 12,
  borderRadius: "var(--r-xs)",
};

// Status — the bay lamp replaced the pill badge. `lampStyle` returns the
// container; pair it with `lampToneStyle` for the colour.
export type BadgeTone = "ok" | "warn" | "error" | "neutral" | "info" | "machine";

const LAMP_COLOR: Record<BadgeTone, string> = {
  ok: "var(--success)",
  warn: "var(--warning)",
  error: "var(--danger)",
  neutral: "var(--ink-4)",
  info: "var(--info)",
  machine: "var(--machine-bright)",
};

export function lampTone(tone: BadgeTone): CSSProperties {
  return {
    color: LAMP_COLOR[tone],
    background: "transparent",
    border: "none",
  };
}

export function badgeStyle(tone: BadgeTone): CSSProperties {
  return {
    ...lampStyle,
    ...lampTone(tone),
  };
}

export const lampStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 11.5,
  fontWeight: 500,
  color: "var(--ink-2)",
  whiteSpace: "nowrap",
};

// Inputs
export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  fontSize: 13.5,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
  color: "var(--ink)",
  outline: "none",
};

// Layout
export const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

export const toolbarStyle: CSSProperties = sectionHeaderStyle;

export const gridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

export const grid2Style: CSSProperties = {
  ...gridStyle,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
};

export const grid3Style: CSSProperties = {
  ...gridStyle,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
};

export const grid4Style: CSSProperties = {
  ...gridStyle,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
};

export const responsiveGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
};

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

export const dividerStyle: CSSProperties = {
  height: 1,
  background: "var(--line-soft)",
  margin: "14px 0",
};