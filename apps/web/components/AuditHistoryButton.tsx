"use client";

import { useEffect, useRef, useState } from "react";

import { formatEntry, type AuditEntry } from "../lib/audit-log";

/** Click-to-open activity history, replacing the old hover tooltip --
 * hover has no equivalent on a touch device, so mobile viewers could
 * never see who did what. Same content (full history, newest first),
 * shown in a small popover anchored to the button instead of a title=
 * attribute. Fetches on first open, not on mount, since most rows are
 * never clicked. Used identically in RepairsPanel, InvoicesPanel, and
 * OrderManagementPanel -- one component so all three stay in sync. */
export function AuditHistoryButton({ entityType, entityId }: { entityType: string; entityId: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // Reset so switching to a different row's entity re-fetches instead of
  // showing the previous row's cached history.
  useEffect(() => {
    setEntries(null);
    setOpen(false);
  }, [entityType, entityId]);

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
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
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
      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            minWidth: 220,
            maxWidth: 300,
            maxHeight: 260,
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
        </div>
      )}
    </div>
  );
}
