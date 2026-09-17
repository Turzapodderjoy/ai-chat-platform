"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatEntry, type AuditEntry } from "../lib/audit-log";

const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 260;
const GAP = 6;

/** Click-to-open activity history, replacing the old hover tooltip --
 * hover has no equivalent on a touch device, so mobile viewers could
 * never see who did what. Same content (full history, newest first),
 * shown in a small popover anchored to the button instead of a title=
 * attribute. Fetches on first open, not on mount, since most rows are
 * never clicked. Used identically in RepairsPanel, InvoicesPanel, and
 * OrderManagementPanel -- one component so all three stay in sync.
 *
 * Rendered through a portal to document.body with fixed positioning
 * (computed from the button's own bounding rect) rather than an
 * absolutely-positioned child -- every panel this button appears in
 * (Repairs detail, Invoices table, Order items list) has a scrolling
 * ancestor (overflowY: auto), which per the CSS spec also computes
 * overflow-x as auto, silently clipping a plain position:absolute
 * popover the moment it would overflow that container. */
export function AuditHistoryButton({ entityType, entityId }: { entityType: string; entityId: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reset so switching to a different row's entity re-fetches instead of
  // showing the previous row's cached history.
  useEffect(() => {
    setEntries(null);
    setOpen(false);
  }, [entityType, entityId]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    function place() {
      const rect = buttonRef.current!.getBoundingClientRect();
      // Flip above the button if there isn't room below; clamp left so it
      // never renders off the right or left edge of the viewport.
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < POPOVER_MAX_HEIGHT + GAP && rect.top > spaceBelow;
      const top = openUpward ? rect.top - GAP : rect.bottom + GAP;
      const left = Math.min(Math.max(rect.left, 8), window.innerWidth - POPOVER_WIDTH - 8);
      setCoords({ top: openUpward ? top - POPOVER_MAX_HEIGHT : top, left });
    }
    place();
    // A scroll anywhere on the page (not just this popover's own ancestor)
    // can move the button -- re-place on every scroll/resize instead of
    // just closing, since closing on scroll is what makes most native
    // selects/menus feel broken on a long page.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (entries === null && entityId) {
      setLoading(true);
      fetch(`/api/admin/audit-log?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
        .then((r) => r.json())
        .then((d: { entries?: AuditEntry[] }) => setEntries(d.entries ?? []))
        .catch(() => setEntries([]))
        .finally(() => setLoading(false));
    }
  }

  if (!entityId) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="View activity history"
        title="Activity history"
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          background: open ? "var(--accent, #635bff)" : "var(--surface, transparent)",
          color: open ? "#fff" : "var(--text-faint)",
          fontSize: 11,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        🕘
      </button>
      {open && coords && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
              width: POPOVER_WIDTH,
              maxHeight: POPOVER_MAX_HEIGHT,
              overflowY: "auto",
              background: "var(--surface, #1a1a1f)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 650, marginBottom: 6, color: "var(--text-faint)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>
              Activity
            </div>
            {loading && <div style={{ color: "var(--text-faint)" }}>Loading…</div>}
            {!loading && entries && entries.length === 0 && <div style={{ color: "var(--text-faint)" }}>No activity recorded yet.</div>}
            {!loading && entries && entries.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {entries.map((e, i) => (
                  <li key={i}>{formatEntry(e)}</li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
