"use client";

import type { BadgeTone } from "./dashboard-styles";

// A lamp with its label. The tone rides the shared .lamp classes in
// globals.css, so status looks identical everywhere and there is no
// second badge shape to drift out of sync.
const LAMP_CLASS: Record<BadgeTone, string> = {
  ok: "lamp-ok",
  warn: "lamp-warn",
  error: "lamp-err",
  info: "lamp-info",
  machine: "lamp-machine",
  neutral: "lamp-idle",
};

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return <span className={`lamp ${LAMP_CLASS[tone]}`}>{children}</span>;
}