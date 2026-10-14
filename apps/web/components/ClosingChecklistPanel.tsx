"use client";

import { useCallback, useEffect, useState } from "react";


interface ChecklistItem {
  id: string;
  label: string;
  category: "cash" | "repairs" | "inventory" | "admin" | "security";
  required: boolean;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  note?: string;
}

const DEFAULT_ITEMS: Omit<ChecklistItem, "completed" | "completedAt" | "completedBy" | "note">[] = [
  { id: "cash-count", label: "Count cash drawer & reconcile", category: "cash", required: true },
  { id: "card-settle", label: "Settle card terminal batches", category: "cash", required: true },
  { id: "bank-deposit", label: "Prepare bank deposit slip", category: "cash", required: false },
  { id: "repair-status", label: "Verify all repairs have status updates", category: "repairs", required: true },
  { id: "repair-ready", label: "Notify customers with 'Ready' repairs", category: "repairs", required: true },
  { id: "repair-invoice", label: "Generate invoices for completed repairs", category: "repairs", required: false },
  { id: "stock-low", label: "Review low-stock alerts & reorder", category: "inventory", required: true },
  { id: "stock-receive", label: "Receive & log incoming stock", category: "inventory", required: false },
  { id: "messages-clear", label: "Clear inbox / reply to pending messages", category: "admin", required: true },
  { id: "appointments-tomorrow", label: "Review tomorrow's appointments", category: "admin", required: true },
  { id: "walkins-logged", label: "Log all walk-ins from today", category: "admin", required: false },
  { id: "doors-locked", label: "Verify all doors locked / alarm set", category: "security", required: true },
  { id: "cameras-check", label: "Confirm cameras recording", category: "security", required: false },
  { id: "backup-verify", label: "Verify daily backup completed", category: "security", required: false },
];

const CATEGORY_LABELS: Record<string, string> = {
  cash: "Cash",
  repairs: "Repairs",
  inventory: "Inventory",
  admin: "Admin",
  security: "Security",
};

export function ClosingChecklistPanel({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ label: "", category: "admin" as ChecklistItem["category"], required: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/closing-checklist?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data: { items: ChecklistItem[] }) => {
        const stored = data.items ?? [];
        const merged = DEFAULT_ITEMS.map((d) => {
          const found = stored.find((s) => s.id === d.id);
          return found ? { ...d, ...found } : { ...d, completed: false };
        });
        const custom = stored.filter((s) => !DEFAULT_ITEMS.some((d) => d.id === s.id));
        setItems([...merged, ...custom]);
      })
      .catch(() => setItems(DEFAULT_ITEMS.map((d) => ({ ...d, completed: false }))));
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  async function toggle(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const updated = { ...item, completed: !item.completed, completedAt: !item.completed ? new Date().toISOString() : undefined, completedBy: !item.completed ? "current-user" : undefined };
    setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
    await save(updated);
  }

  async function save(item: ChecklistItem) {
    await fetch("/api/admin/closing-checklist", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, item }) }).then((r) => { if (r.ok) setError(false); }).catch(() => setError(true));
  }

  async function addCustom() {
    if (!draft.label.trim()) return;
    setSaving(true);
    const newItem: ChecklistItem = { id: `custom-${Date.now()}`, label: draft.label, category: draft.category, required: draft.required, completed: false };
    setItems((prev) => [...prev, newItem]);
    await fetch("/api/admin/closing-checklist", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, item: newItem }) });
    setDraft({ label: "", category: "admin", required: false });
    setShowAdd(false);
    setSaving(false);
  }

  const categories = [...new Set(items.map((i) => i.category))];
  const allRequired = items.filter((i) => i.required);
  const completedRequired = allRequired.filter((i) => i.completed).length;
  const totalRequired = allRequired.length;

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Closing checklist</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className={
              completedRequired === totalRequired && totalRequired > 0
                ? "lamp lamp-ok"
                : completedRequired > 0
                  ? "lamp lamp-warn"
                  : "lamp lamp-idle"
            }
          >
            {completedRequired}/{totalRequired} required
          </span>
          <button onClick={() => setShowAdd(!showAdd)} className="primary sm">
            {showAdd ? "Cancel" : "Add custom task"}
          </button>
        </div>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14, maxWidth: "68ch" }}>
          End-of-day tasks for closing the shop. Required tasks have to be ticked off before you leave.
        </p>

        {error && (
          <p className="field-error" style={{ marginTop: 0 }}>Failed to save. Check connection and retry.</p>
        )}

        {showAdd && (
          <div
            className="panel-sunk"
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "flex-end",
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label className="field-label" htmlFor="aiva-closing-task">Task name</label>
              <input
                id="aiva-closing-task"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 160 }}>
              <label className="field-label" htmlFor="aiva-closing-category">Category</label>
              <select
                id="aiva-closing-category"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ChecklistItem["category"] })}
              >
                <option value="cash">Cash</option>
                <option value="repairs">Repairs</option>
                <option value="inventory">Inventory</option>
                <option value="admin">Admin</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <input
                type="checkbox"
                id="aiva-closing-required"
                checked={draft.required}
                onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
              />
              <label className="field-label" htmlFor="aiva-closing-required" style={{ margin: 0 }}>Required</label>
            </div>
            <button onClick={addCustom} disabled={saving || !draft.label.trim()} className="primary sm">
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category === cat);
            const catDone = catItems.filter((i) => i.completed).length;
            return (
              <div key={cat} className="panel-sunk" style={{ padding: 14 }}>
                <div className="panel-head" style={{ marginBottom: 10 }}>
                  <span className="instrument-label">{CATEGORY_LABELS[cat]}</span>
                  <span
                    className={catDone === catItems.length ? "lamp lamp-ok" : catDone > 0 ? "lamp lamp-warn" : "lamp lamp-idle"}
                  >
                    {catDone}/{catItems.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 10px",
                        background: "var(--panel)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => toggle(item.id)}
                        aria-label={item.label}
                        style={{ flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: item.completed ? "var(--ink-3)" : "var(--ink)",
                            textDecoration: item.completed ? "line-through" : "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          {item.label}
                          <span
                            className={
                              item.completed ? "lamp lamp-ok" : item.required ? "lamp lamp-warn" : "lamp lamp-idle"
                            }
                          >
                            {item.completed ? "Done" : item.required ? "Required" : "Optional"}
                          </span>
                        </div>
                        {item.completed && (
                          <div className="data" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>
                            Completed {fmtTime(item.completedAt)} by {item.completedBy ?? "—"}
                          </div>
                        )}
                      </div>
                      {item.note && (
                        <span
                          className="meta"
                          style={{
                            fontSize: 11.5,
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="panel-sunk"
          style={{ padding: 12, marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}
        >
          <span className="data" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {items.filter((i) => i.completed).length} of {items.length} tasks done
          </span>
          <button
            onClick={() => setItems((prev) => prev.map((i) => ({ ...i, completed: false, completedAt: undefined, completedBy: undefined })))}
            className="ghost sm"
          >
            Reset all
          </button>
        </div>
      </div>
    </section>
  );
}

function fmtTime(iso?: string) { return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""; }