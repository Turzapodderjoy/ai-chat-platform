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
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md, 12px)",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text)",
          fontSize: 14,
          fontWeight: 500,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: "var(--text-muted)",
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 0.2s ease",
            }}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span>{title}</span>
          {badge && <span style={{ marginLeft: 4 }}>{badge}</span>}
        </div>
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
        <div style={{ padding: "0 16px 16px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
