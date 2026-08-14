"use client";

import type { BadgeTone } from "./dashboard-styles";
import { badgeStyle } from "./dashboard-styles";

/** Tiny inline SVG icons standing in for the ✅/❌/🟢/⚪/⚠️ emoji this
 * dashboard used everywhere — emoji renders differently per OS/browser,
 * carries no real visual weight, and reads as raw status-log output
 * rather than a designed product. A crisp vector glyph inside a pill
 * (see StatusBadge below) is the same information with real polish. */
function ToneIcon({ tone }: { tone: BadgeTone }) {
  const common = { width: 11, height: 11, viewBox: "0 0 24 24", fill: "none" as const, stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (tone === "ok") return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
  if (tone === "error") return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>;
  if (tone === "warn") return <svg {...common} strokeWidth={2.5}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
  if (tone === "info") return <svg {...common} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="5" /></svg>;
  return <svg {...common} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="5" /></svg>;
}

/** The one status pill every panel should reach for instead of
 * hand-rolled "✅ text" — an icon + label in a tone-colored pill. */
export function StatusBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span style={{ ...badgeStyle(tone), display: "inline-flex", alignItems: "center", gap: 5 }}>
      <ToneIcon tone={tone} />
      {children}
    </span>
  );
}
