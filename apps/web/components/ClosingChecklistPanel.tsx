"use client";

import { useCallback, useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";

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
  cash: "💰 Cash",
  repairs: "🔧 Repairs",
  inventory: "📦 Inventory",
  admin: "📋 Admin",
  security: "🔒 Security",
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
    <section style={{ padding: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Closing Checklist</h2>
          <p style={{ ...subtleTextStyle, fontSize: 13 }}>
            End-of-day tasks. {completedRequired}/{totalRequired} required done.
            {completedRequired === totalRequired && totalRequired > 0 && <span style={{ marginLeft: 8, color: "var(--success)", fontWeight: 600 }}>✓ All required complete</span>}
          </p>
          {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>Failed to save. Check connection and retry.</p>}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={primaryButtonStyle}> {showAdd ? "Cancel" : "+ Add custom task"} </button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <input placeholder="Task name *" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} style={{ padding: 8, flex: 1, minWidth: 200 }} />
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ChecklistItem["category"] })} style={{ padding: 8, width: 140 }}>
            <option value="cash">Cash</option><option value="repairs">Repairs</option><option value="inventory">Inventory</option><option value="admin">Admin</option><option value="security">Security</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, padding: 8 }}>
            <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Required
          </label>
          <button onClick={addCustom} disabled={saving || !draft.label.trim()} style={primaryButtonStyle}> {saving ? "Saving…" : "Add"} </button>
        </div>
      )}

      {categories.map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{CATEGORY_LABELS[cat]}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {catItems.map((item) => (
                <div key={item.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                  <input type="checkbox" checked={item.completed} onChange={() => toggle(item.id)} style={{ width: 18, height: 18, accentColor: "var(--accent)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: item.completed ? "var(--text-muted)" : "var(--text)", textDecoration: item.completed ? "line-through" : "none" }}> {item.label} </div>
                    {item.completed && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}> Completed {fmtTime(item.completedAt)} by {item.completedBy ?? "—"} </div>}
                    {item.required && <span style={{ fontSize: 9, fontWeight: 600, color: "var(--warning)", marginLeft: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(245,158,11,0.15)" }}> Required </span>}
                  </div>
                  {item.note && <span style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.note}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ ...cardStyle, padding: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}> {items.filter((i) => i.completed).length} / {items.length} tasks done </div>
        <button onClick={() => setItems((prev) => prev.map((i) => ({ ...i, completed: false, completedAt: undefined, completedBy: undefined })))} style={{ ...primaryButtonStyle, fontSize: 11, padding: "6px 12px" }}> Reset All </button>
      </div>
    </section>
  );
}

function fmtTime(iso?: string) { return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""; }