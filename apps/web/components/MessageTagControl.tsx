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
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "1px 8px",
            borderRadius: 999,
            fontSize: 11,
            background: "rgba(255,255,255,0.08)",
          }}
        >
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: a.color ?? "#8b949e" }} />
          {a.label}
          {a.source === "ai" && <span style={{ opacity: 0.6, fontSize: 9 }}>AI</span>}
          <button
            onClick={() => onRemove(a.tagId)}
            style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: 0, fontSize: 10 }}
          >
            ✕
          </button>
        </span>
      ))}

      {(hovered || open) && (
        <button
          onClick={() => setOpen((o) => !o)}
          title="Add tag"
          style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6, fontSize: 13, padding: 0 }}
        >
          🏷️
        </button>
      )}

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 10,
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: 8,
            width: 200,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <input
            autoFocus
            placeholder="Search tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: 6, marginBottom: 6, boxSizing: "border-box" }}
          />
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {filtered.map((t) => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "3px 2px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={appliedIds.has(t.id)}
                  onChange={(e) => (e.target.checked ? onAssign(t.id) : onRemove(t.id))}
                />
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: t.color ?? "#8b949e" }} />
                {t.label}
              </label>
            ))}
            {filtered.length === 0 && <div style={{ fontSize: 12, opacity: 0.6, padding: 4 }}>No matching tags.</div>}
          </div>
          <button onClick={() => setOpen(false)} style={{ marginTop: 6, width: "100%", fontSize: 12 }}>
            Done
          </button>
        </div>
      )}
    </span>
  );
}
