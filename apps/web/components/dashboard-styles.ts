import type { CSSProperties } from "react";

// th/td already get their look from the global `.app-shell th/td` rules
// in globals.css — this is kept only for panels that still pass it
// explicitly, and no longer overrides border/padding so it doesn't
// fight the shared table styling.
export const cellStyle: CSSProperties = {
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

// MD3 "elevation 1" surface: a card is a resting surface tonally
// lighter than the page background, not just a bordered box — the
// border stays (helps separation on the flattest monitors/screenshots)
// but is no longer doing all the work.
export const cardStyle: CSSProperties = {
  background: "var(--md-surface-1, var(--bg-elevated))",
  border: "1px solid var(--border)",
  borderRadius: "var(--md-shape-lg, var(--radius))",
  padding: 22,
  marginBottom: 20,
  boxShadow: "var(--shadow)",
};

export const subtleTextStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 13,
  marginTop: 4,
};

/** A real primary action button — most panels never had a distinct
 * "this is the main verb" style, just a bare <button>. Spread this onto
 * the one or two calls-to-action that matter per panel (Create, Save,
 * Send…); everything else keeps the plain button look from globals.css. */
export const primaryButtonStyle: CSSProperties = {
  background: "var(--accent)",
  borderColor: "var(--accent)",
  color: "#08111f",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
};

export type BadgeTone = "ok" | "warn" | "error" | "neutral" | "info";

const BADGE_COLORS: Record<BadgeTone, { bg: string; fg: string }> = {
  ok: { bg: "var(--success-soft)", fg: "var(--success)" },
  warn: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  error: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  neutral: { bg: "rgba(144, 160, 183, 0.14)", fg: "var(--text-muted)" },
  info: { bg: "var(--accent-soft)", fg: "var(--accent)" },
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
