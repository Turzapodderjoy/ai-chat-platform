"use client";

import { useState, type ReactNode } from "react";

/** Reusable MD3-style collapsible section — a labeled header with a
 * chevron that expands/collapses its content with a real height
 * animation (CSS grid-template-rows 0fr/1fr trick, not framer-motion —
 * no new dependency, and this needs no JS height measurement to work).
 * Any panel can wrap a sub-section in this to get the same "click to
 * expand" affordance the sidebar's own nav groups already have. */
export function Collapsible({
  title,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="plain"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "4px 0",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text)",
        }}
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          className="md-chevron"
          data-open={open}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, color: "var(--text-faint)" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows var(--md-duration-medium, 250ms) var(--md-easing-standard, ease)",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ paddingTop: 12 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
