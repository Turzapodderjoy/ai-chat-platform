"use client";

import { useEffect, useState } from "react";

export interface AuditEntry {
  action: string;
  detail: string | null;
  actorUsername: string;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  booked: "Booked",
  item_added: "Item added",
  item_removed: "Item removed",
  price_overridden: "Price overridden",
  generated: "Invoice generated",
  updated: "Updated",
  marked_paid: "Marked paid",
  deleted: "Deleted",
};

function humanize(s: string): string {
  const spaced = s.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatEntry(e: AuditEntry): string {
  const when = new Date(e.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  // A status change reads better as "Completed by X" than "Status
  // changed by X" -- pull the new status out of the "old -> new" detail.
  if (e.action === "status_changed" && e.detail?.includes(" -> ")) {
    const newStatus = e.detail.split(" -> ")[1] ?? e.detail;
    return `${humanize(newStatus)} by ${e.actorUsername}, ${when}`;
  }
  const label = ACTION_LABEL[e.action] ?? humanize(e.action);
  return `${label} by ${e.actorUsername}, ${when}`;
}

/** Every entry, newest first, one per line -- not just the latest. Used
 * as a hover tooltip (native title=) on a status badge/select. */
export function formatAuditTooltip(entries: AuditEntry[]): string {
  if (entries.length === 0) return "No activity recorded yet.";
  return entries.map(formatEntry).join("\n");
}

/** Fetches and formats an entity's full activity history for a hover
 * tooltip. Re-fetches whenever entityId changes (e.g. selecting a
 * different repair/invoice row). Empty string while loading or if
 * entityId is absent, so callers can just omit the title attribute. */
export function useAuditTooltip(entityType: string, entityId: string | null | undefined): string {
  const [tooltip, setTooltip] = useState("");

  useEffect(() => {
    if (!entityId) {
      setTooltip("");
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/audit-log?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then((r) => r.json())
      .then((d: { entries?: AuditEntry[] }) => {
        if (!cancelled) setTooltip(formatAuditTooltip(d.entries ?? []));
      })
      .catch(() => {
        if (!cancelled) setTooltip("");
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  return tooltip;
}
