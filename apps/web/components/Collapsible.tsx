"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

export function Collapsible({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(open ? contentRef.current.scrollHeight : 0);
    }
  }, [open]);

  return (
    <section className="panel">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 14px",
          minHeight: 40,
          background: "transparent",
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
          textAlign: "left",
        }}
      >
        <span className="instrument-label" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              color: "var(--ink-3)",
              flexShrink: 0,
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform var(--dur-panel) var(--ease-out)",
            }}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {badge && <span style={{ marginLeft: 2, flexShrink: 0 }}>{badge}</span>}
        </span>
      </button>
      <div
        ref={contentRef}
        style={{
          height: height === 0 ? 0 : "auto",
          maxHeight: height === 0 ? 0 : undefined,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div className="panel-body" style={{ paddingTop: 0 }}>{children}</div>
      </div>
    </section>
  );
}
