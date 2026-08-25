"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, shortId } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";

interface Deal {
  id: string;
  businessId: string;
  contactId: string | null;
  title: string;
  amount: number | null;
  stage: string;
  status: string;
  closeDate: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Contact {
  id: string;
  name: string;
}

interface Client {
  id: string;
  name: string;
}

const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
const STAGE_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

/** Sales opportunities moving through a pipeline — HubSpot's Deals
 * object, kanban view (their own real UI is kanban + list; this is the
 * kanban half, the simpler and more useful one for a small team). Not
 * the same thing as an Order (a completed transaction) — a Deal is the
 * opportunity that may or may not become one. */
export function DealsPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [clients, setClients] = useState<Client[] | null>(null);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [contactId, setContactId] = useState("");
  const [targetBusinessId, setTargetBusinessId] = useState(businessId ?? "");
  const [creating, setCreating] = useState(false);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/crm/deals${qs}`)
      .then((r) => r.json())
      .then((d) => setDeals(d.deals));
    fetch(`/api/admin/crm/contacts${qs}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts));
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  useEffect(() => {
    if (businessId) return;
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients));
  }, [businessId]);

  const contactName = useMemo(() => new Map((contacts ?? []).map((c) => [c.id, c.name])), [contacts]);

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>(STAGES.map((s) => [s, []]));
    for (const d of deals ?? []) {
      (map.get(d.stage) ?? map.get("new")!).push(d);
    }
    return map;
  }, [deals]);

  const stats = useMemo(() => {
    if (!deals) return null;
    const open = deals.filter((d) => d.status === "open");
    const won = deals.filter((d) => d.status === "won");
    const openValue = open.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const wonValue = won.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    return { openCount: open.length, openValue, wonCount: won.length, wonValue };
  }, [deals]);

  async function createDeal() {
    const targetId = businessId ?? targetBusinessId;
    if (!targetId || !title.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/admin/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: targetId,
          title,
          amount: amount ? Number(amount) : undefined,
          contactId: contactId || undefined,
        }),
      });
      setTitle("");
      setAmount("");
      setContactId("");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function moveDeal(deal: Deal, stage: string) {
    let lostReason: string | undefined;
    if (stage === "lost") {
      const entered = window.prompt("Why was this deal lost? (required)");
      if (!entered || !entered.trim()) return;
      lostReason = entered.trim();
    }
    const res = await fetch("/api/admin/crm/deals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deal.id, stage, lostReason }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      window.alert(d?.error ?? "Failed to update deal.");
      return;
    }
    refresh();
  }

  async function deleteDeal(deal: Deal) {
    const confirmed = window.confirm(`Delete the deal "${deal.title}"? This cannot be undone.`);
    if (!confirmed) return;
    await fetch(`/api/admin/crm/deals?id=${encodeURIComponent(deal.id)}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Deals</h2>
      <p style={subtleTextStyle}>Sales opportunities moving through a pipeline — separate from a completed Order, this is the chance that may or may not become one.</p>

      {stats && (
        <StatCardRow>
          <StatCard label="Open Deals" value={String(stats.openCount)} hint={`৳${stats.openValue.toLocaleString()}`} tone="info" />
          <StatCard label="Won" value={String(stats.wonCount)} hint={`৳${stats.wonValue.toLocaleString()}`} tone="success" />
        </StatCardRow>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {!businessId && (
          <select value={targetBusinessId} onChange={(e) => setTargetBusinessId(e.target.value)} style={{ padding: 8 }}>
            <option value="">Select client…</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input style={{ padding: 8, minWidth: 160 }} placeholder="Deal title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input style={{ padding: 8, width: 110 }} placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={{ padding: 8 }}>
          <option value="">No contact</option>
          {contacts?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={createDeal} disabled={creating || !title.trim() || (!businessId && !targetBusinessId)} style={primaryButtonStyle}>
          {creating ? "Creating…" : "+ New Deal"}
        </button>
      </div>

      {!deals && <p style={subtleTextStyle}>Loading…</p>}

      {deals && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {STAGES.map((stage) => (
            <div key={stage} style={{ flex: "0 0 220px", minWidth: 220 }}>
              <div style={{ fontSize: 11, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>{STAGE_LABEL[stage]}</span>
                <span>{byStage.get(stage)?.length ?? 0}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 8 }}>
                {(byStage.get(stage) ?? []).map((d) => (
                  <div key={d.id} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
                    {d.amount != null && <div style={{ fontSize: 12, color: "var(--accent-strong)", marginTop: 2 }}>৳{d.amount.toLocaleString()}</div>}
                    {d.contactId && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{contactName.get(d.contactId) ?? "Unknown contact"}</div>}
                    {d.lostReason && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 2 }}>Lost: {d.lostReason}</div>}
                    <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>{shortId(d.id)}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <select value={d.stage} onChange={(e) => moveDeal(d, e.target.value)} style={{ padding: 4, fontSize: 11, flex: 1 }}>
                        {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </select>
                      <button onClick={() => deleteDeal(d)} style={{ fontSize: 11, padding: "4px 6px" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
