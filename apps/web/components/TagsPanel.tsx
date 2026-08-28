"use client";

import { useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";

interface Tag {
  id: string;
  label: string;
  color: string | null;
  businessId: string;
  isFunnelStage: boolean;
  funnelOrder: number | null;
  createdAt: string;
}

/** Mother dashboard's global tag catalog — every tag created here is
 * visible to and usable by every client (businessId "__platform__").
 * Tags only ever get applied by hand (the hover/+tag controls in All
 * Chats) — there is no AI auto-tagging. */
export function TagsPanel() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#58a6ff");
  const [isFunnelStage, setIsFunnelStage] = useState(false);
  const [funnelOrder, setFunnelOrder] = useState(1);
  const [creating, setCreating] = useState(false);

  function refresh() {
    fetch("/api/admin/tags")
      .then((r) => r.json())
      .then((data) => setTags(data.tags));
  }

  useEffect(refresh, []);

  async function addTag() {
    if (!label.trim()) return;
    setCreating(true);

    try {
      await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color, isFunnelStage, funnelOrder: isFunnelStage ? funnelOrder : null }),
      });
      setLabel("");
      setIsFunnelStage(false);
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function toggleFunnelStage(tag: Tag) {
    await fetch("/api/admin/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: tag.id,
        isFunnelStage: !tag.isFunnelStage,
        funnelOrder: !tag.isFunnelStage ? (tag.funnelOrder ?? 1) : null,
      }),
    });
    refresh();
  }

  async function setOrder(tag: Tag, order: number) {
    await fetch("/api/admin/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tag.id, funnelOrder: order }),
    });
    refresh();
  }

  async function deleteTag(tag: Tag) {
    const confirmed = window.confirm(
      `Delete "${tag.label}"? Every conversation/message it's applied to loses this tag — this cannot be undone.`
    );
    if (!confirmed) return;

    await fetch(`/api/admin/tags?id=${encodeURIComponent(tag.id)}`, { method: "DELETE" });
    setTags((prev) => prev?.filter((t) => t.id !== tag.id) ?? prev);
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Tags</h2>
      <p style={subtleTextStyle}>
        Every tag here is visible to and usable by every client, the way Intercom&apos;s tag catalog works. Mark a
        tag as a funnel stage (with an order) to power each client&apos;s conversion-rate and funnel charts —
        everything else is just a flexible label.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <input
          style={{ padding: 8, flex: 1, minWidth: 160 }}
          placeholder="Tag label (e.g. Sold)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTag();
          }}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: 40, height: 34, padding: 0, border: "1px solid var(--border)" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={isFunnelStage} onChange={(e) => setIsFunnelStage(e.target.checked)} />
          Funnel stage
        </label>
        {isFunnelStage && (
          <input
            type="number"
            min={1}
            style={{ width: 60, padding: 8 }}
            value={funnelOrder}
            onChange={(e) => setFunnelOrder(Number(e.target.value))}
          />
        )}
        <button onClick={addTag} disabled={creating} style={primaryButtonStyle}>
          {creating ? "Adding…" : "+ New tag"}
        </button>
      </div>

      {!tags && <p>Loading…</p>}

      {tags && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Tag</th>
              <th style={cellStyle}>Funnel stage</th>
              <th style={cellStyle}>Order</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id}>
                <td style={cellStyle}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: t.color ?? "#8b949e",
                      marginRight: 8,
                    }}
                  />
                  {t.label}
                </td>
                <td style={cellStyle}>
                  <input type="checkbox" checked={t.isFunnelStage} onChange={() => toggleFunnelStage(t)} />
                </td>
                <td style={cellStyle}>
                  {t.isFunnelStage ? (
                    <input
                      type="number"
                      min={1}
                      style={{ width: 60, padding: 4 }}
                      value={t.funnelOrder ?? 1}
                      onChange={(e) => setOrder(t, Number(e.target.value))}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td style={cellStyle}>
                  <button onClick={() => deleteTag(t)}>Delete</button>
                </td>
              </tr>
            ))}
            {tags.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={4}>
                  No tags yet — add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
