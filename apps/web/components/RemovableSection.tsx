"use client";

import { useState, type ReactNode, type CSSProperties } from "react";

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
  style,
}: {
  id: string;
  hidden: boolean;
  editable: boolean;
  onToggle: (widgetId: string, hide: boolean) => void;
  children: ReactNode;
  /** Merged into the root div's style -- e.g. a full-height flex panel
   * (an inbox with its own internal scroll regions) needs this wrapper
   * to actually stretch instead of defaulting to block/shrink-to-fit,
   * or its reply box ends up stranded below the fold. */
  style?: CSSProperties;
}) {
  // The remove control is hover-only for admins, which has no touch
  // equivalent -- so it also stays put whenever the section is hidden
  // (where it is the only way back). Rest is unchanged.
  const [hover, setHover] = useState(false);

  if (hidden && !editable) return null;

  return (
    <div
      style={{ position: "relative", opacity: hidden ? 0.45 : 1, ...style }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      {editable && hidden && (
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 15 }}>
          <span className="lamp lamp-idle">Hidden from client</span>
        </div>
      )}
      {editable && (hover || hidden) && (
        <button
          type="button"
          onClick={() => onToggle(id, !hidden)}
          title={hidden ? "Show this for the client" : "Remove this for the client"}
          aria-label={hidden ? `Show ${id} for the client` : `Remove ${id} for the client`}
          className="sm"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            padding: 0,
            borderRadius: "var(--r-sm)",
            background: hidden ? "var(--success-subtle)" : "var(--danger-subtle)",
            borderColor: hidden ? "var(--success)" : "var(--danger)",
            color: hidden ? "var(--success)" : "var(--danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 15,
            boxShadow: "none",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            {hidden ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14" />}
          </svg>
        </button>
      )}
    </div>
  );
}
