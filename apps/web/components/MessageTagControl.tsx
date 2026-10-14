"use client";

import { useState } from "react";

interface Tag {
  id: string;
  label: string;
  color: string | null;
}

interface TagAssignment {
  tagId: string;
  label: string;
  color: string | null;
  source: string; // "ai" | "manual"
}

/** Hover-to-tag control for a single message — hovering the message
 * reveals a small tag-icon button; clicking opens a search+multiselect
 * popover so several tags can be applied at once. Applied tags render
 * as chips on the message itself, AI-assigned ones visually
 * distinguished from manual ones with a small "AI" badge. Built as one
 * reusable component — also used for order tagging (OrdersPanel). */
export function MessageTagControl({
  catalog,
  applied,
  onAssign,
  onRemove,
}: {
  catalog: Tag[];
  applied: TagAssignment[];
  onAssign: (tagId: string) => void;
  onRemove: (tagId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const appliedIds = new Set(applied.map((a) => a.tagId));
  const filtered = catalog.filter((t) => t.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {applied.map((a) => (
        <span
          key={a.tagId}
          className="panel-sunk"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 4px 2px 8px",
            borderRadius: 999,
            fontSize: 11,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: 999,
              background: a.color ?? "var(--ink-4)",
            }}
          />
          {a.label}
          {a.source === "ai" && <span className="data" style={{ fontSize: 9 }}>AI</span>}
          <button
            onClick={() => onRemove(a.tagId)}
            className="plain sm"
            style={{ padding: "0 4px", fontSize: 10, opacity: 0.6 }}
            aria-label={`Remove tag ${a.label}`}
          >
            Remove
          </button>
        </span>
      ))}

      {(hovered || open) && (
        <button onClick={() => setOpen((o) => !o)} className="plain sm" aria-label="Add tag" aria-expanded={open}>
          Add tag
        </button>
      )}

      {open && (
        <div
          className="panel"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 10,
            marginTop: 6,
            padding: 10,
            width: 220,
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <input
            type="search"
            name="aiva-search-tags"
            aria-label="Search tags"
            autoComplete="off"
            autoFocus
            placeholder="Search tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
          />
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {filtered.map((t) => (
              <label
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 2px", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={appliedIds.has(t.id)}
                  onChange={(e) => (e.target.checked ? onAssign(t.id) : onRemove(t.id))}
                />
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: t.color ?? "var(--ink-4)",
                  }}
                />
                {t.label}
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="empty-state" style={{ padding: "10px 8px" }}>
                <div className="empty-state-title">No matching tags</div>
                <div className="empty-state-description">
                  Create tags in the Tag Dashboard, then pick them here.
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setOpen(false)} className="ghost sm" style={{ marginTop: 8, width: "100%" }}>
            Done
          </button>
        </div>
      )}
    </span>
  );
}