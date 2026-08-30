"use client";

import type { BadgeTone } from "./dashboard-styles";
import { badgeStyle } from "./dashboard-styles";

function ToneIcon({ tone }: { tone: BadgeTone }) {
  const common = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none" as const, stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (tone === "ok") return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
  if (tone === "error") return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>;
  if (tone === "warn") return <svg {...common} strokeWidth={2}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
  if (tone === "info") return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="10" /></svg>;
}

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span style={badgeStyle(tone)}>
      <ToneIcon tone={tone} />
      {children}
    </span>
  );
}
