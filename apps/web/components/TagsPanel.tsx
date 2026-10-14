"use client";

import { useEffect, useState } from "react";

import { showConfirm } from "../lib/app-dialog";

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
    const confirmed = await showConfirm(
      `Delete "${tag.label}"? Every conversation/message it's applied to loses this tag — this cannot be undone.`
    );
    if (!confirmed) return;

    await fetch(`/api/admin/tags?id=${encodeURIComponent(tag.id)}`, { method: "DELETE" });
    setTags((prev) => prev?.filter((t) => t.id !== tag.id) ?? prev);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Tags</span>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0 }}>
          Every tag here is visible to and usable by every client, the way Intercom&apos;s tag catalog
          works. Mark a tag as a funnel stage (with an order) to power each client&apos;s conversion-rate
          and funnel charts — everything else is just a flexible label.
        </p>

        <div className="toolbar" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <span className="instrument-label">Tag label</span>
            <input
              placeholder="e.g. Sold"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag();
              }}
            />
          </label>
          <label className="field" style={{ flex: "0 0 auto" }}>
            <span className="instrument-label">Colour</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: 44, height: 34, padding: 2 }}
            />
          </label>
          <label className="field" style={{ flex: "0 0 auto" }}>
            <span className="instrument-label">Funnel stage</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, height: 34 }}>
              <input
                type="checkbox"
                checked={isFunnelStage}
                onChange={(e) => setIsFunnelStage(e.target.checked)}
              />
              Include in funnel
            </label>
          </label>
          {isFunnelStage && (
            <label className="field" style={{ flex: "0 0 auto" }}>
              <span className="instrument-label">Funnel order</span>
              <input
                type="number"
                min={1}
                value={funnelOrder}
                onChange={(e) => setFunnelOrder(Number(e.target.value))}
                style={{ width: 70 }}
              />
            </label>
          )}
          <button onClick={addTag} disabled={creating} className="primary">
            {creating ? "Adding…" : "New tag"}
          </button>
        </div>

        {!tags && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 28 }} />
            <div className="skeleton" style={{ height: 28 }} />
          </div>
        )}

        {tags && tags.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No tags yet</div>
            <div className="empty-state-description">
              Add your first tag above — every client can use it on chats, orders and repairs.
            </div>
          </div>
        )}

        {tags && tags.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Tag</th>
                  <th scope="col">Funnel stage</th>
                  <th scope="col">Order</th>
                  <th scope="col"><span style={{ display: "inline-block", width: 52 }}>Manage</span></th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: t.color ?? "var(--ink-4)",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{t.label}</span>
                      </span>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Mark ${t.label} as a funnel stage`}
                        checked={t.isFunnelStage}
                        onChange={() => toggleFunnelStage(t)}
                      />
                    </td>
                    <td>
                      {t.isFunnelStage ? (
                        <input
                          type="number"
                          min={1}
                          aria-label={`Funnel order for ${t.label}`}
                          value={t.funnelOrder ?? 1}
                          onChange={(e) => setOrder(t, Number(e.target.value))}
                          style={{ width: 70 }}
                        />
                      ) : (
                        <span className="data">—</span>
                      )}
                    </td>
                    <td>
                      <button className="danger sm" onClick={() => deleteTag(t)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}