"use client";

import { useState, type ReactNode } from "react";

/** Wraps any panel or panel-section with an admin-only hover "remove
 * this for this client" control — the general mechanism behind
 * "there should be a minus sign in every box... clients will not see
 * what we remove". `editable` should only ever be true for an admin
 * session (never a real restricted client login) — see
 * client-dashboard-client.tsx's own `isAdmin`. When `hidden` is true
 * and the viewer is NOT editable, this renders nothing at all (the
 * actual enforcement); when hidden and editable, it still renders
 * (dimmed, with a restore "+") so the admin can find and bring it back. */
export function RemovableSection({
  id,
  hidden,
  editable,
  onToggle,
  children,
}: {
  id: string;
  hidden: boolean;
  editable: boolean;
  onToggle: (widgetId: string, hide: boolean) => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);

  if (hidden && !editable) return null;

  return (
    <div
      style={{ position: "relative", opacity: hidden ? 0.45 : 1 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      {editable && hidden && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            fontSize: 10.5,
            fontWeight: 600,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "2px 8px",
            color: "var(--text-faint)",
            zIndex: 15,
          }}
        >
          Hidden from client
        </div>
      )}
      {editable && (hover || hidden) && (
        <button
          onClick={() => onToggle(id, !hidden)}
          title={hidden ? "Show this for the client" : "Remove this for the client"}
          className="plain"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: hidden ? "var(--success)" : "var(--danger)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1,
            zIndex: 15,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          {hidden ? "+" : "−"}
        </button>
      )}
    </div>
  );
}
