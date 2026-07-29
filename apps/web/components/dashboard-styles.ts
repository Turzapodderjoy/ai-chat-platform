import type { CSSProperties } from "react";

export const cellStyle: CSSProperties = {
  border: "1px solid #333",
  padding: "6px 10px",
  textAlign: "left",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Shared visual primitives added for the dashboard redesign — opt-in,
// additive only. Existing panels keep their own markup/data-fetching;
// these just give every panel the same card/badge look instead of each
// one improvising its own <section> + ad-hoc emoji status text.

export const cardStyle: CSSProperties = {
  border: "1px solid #30363d",
  borderRadius: 10,
  padding: 20,
  marginBottom: 20,
};

export const subtleTextStyle: CSSProperties = {
  opacity: 0.6,
  fontSize: 13,
  marginTop: 4,
};

export type BadgeTone = "ok" | "warn" | "error" | "neutral" | "info";

const BADGE_COLORS: Record<BadgeTone, { bg: string; fg: string }> = {
  ok: { bg: "rgba(63, 185, 80, 0.15)", fg: "#3fb950" },
  warn: { bg: "rgba(210, 153, 34, 0.15)", fg: "#d29922" },
  error: { bg: "rgba(248, 81, 73, 0.15)", fg: "#f85149" },
  neutral: { bg: "rgba(139, 148, 158, 0.15)", fg: "#8b949e" },
  info: { bg: "rgba(88, 166, 255, 0.15)", fg: "#58a6ff" },
};

/** A small colored pill — `<span style={badgeStyle("ok")}>Healthy</span>` —
 * replacing the scattered "✅/❌/🟢/⚪ + text" conventions each panel used
 * to invent on its own with one consistent look. */
export function badgeStyle(tone: BadgeTone): CSSProperties {
  const c = BADGE_COLORS[tone];
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: c.bg,
    color: c.fg,
    whiteSpace: "nowrap",
  };
}
