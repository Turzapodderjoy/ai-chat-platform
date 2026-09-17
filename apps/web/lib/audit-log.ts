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

export function formatEntry(e: AuditEntry): string {
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

