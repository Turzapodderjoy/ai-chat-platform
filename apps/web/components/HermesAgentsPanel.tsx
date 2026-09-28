"use client";

import { useEffect, useState } from "react";

import { showAlert, showConfirm } from "../lib/app-dialog";
import {
  cardStyle,
  dangerButtonStyle,
  inputStyle,
  primaryButtonStyle,
  subtleTextStyle,
} from "./dashboard-styles";
import { ModelSelector } from "./ModelSelector";

interface HermesAgentBusiness {
  id: string;
  name: string;
  slug: string;
  hermesEnabled: boolean;
}

interface HermesAgent {
  slug: string;
  provisioned: boolean;
  model: string | null;
  provider: string | null;
  soul: string | null;
  businesses: HermesAgentBusiness[];
}

export function HermesAgentsPanel() {
  const [agents, setAgents] = useState<HermesAgent[] | null>(null);
  const [error, setError] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // All businesses for assignment dropdown
  const [allBusinesses, setAllBusinesses] = useState<Array<{ id: string; name: string }>>([]);
  const [fetchingBusinesses, setFetchingBusinesses] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/hermes-agents");
      const data = (await res.json()) as { agents: HermesAgent[] };
      setAgents(data.agents ?? []);
      setError("");
    } catch {
      setAgents([]);
      setError("Could not load Hermes agents.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setFetchingBusinesses(true);
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => {
        const businesses = (data.clients ?? []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        }));
        setAllBusinesses(businesses);
      })
      .catch(() => setAllBusinesses([]))
      .finally(() => setFetchingBusinesses(false));
  }, []);

  async function createAgent() {
    const slug = newSlug.trim().toLowerCase();
    if (!slug) {
      await showAlert("Enter an agent slug first (lowercase letters, digits, dashes).");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/hermes-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json()) as { slug?: string; apiKey?: string; error?: string };
      if (!res.ok || !data.apiKey) {
        await showAlert(data.error ?? "Failed to create agent.");
        return;
      }
      setNewSlug("");
      await refresh();
      await showAlert(
        `Agent '${data.slug}' created.\n\nCopy this API key now — it is only shown once:\n\n${data.apiKey}`
      );
    } catch {
      await showAlert("Could not create agent.");
    } finally {
      setCreating(false);
    }
  }

  async function saveAgent(agent: HermesAgent, patch: { soul?: string; model?: string; provider?: string }) {
    const res = await fetch(`/api/admin/hermes-agents/${agent.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      await showAlert(data.error ?? "Failed to save.");
      return;
    }
    await refresh();
  }

  async function deleteAgent(agent: HermesAgent) {
    if (!(await showConfirm(`Delete Hermes agent '${agent.slug}'?\n\nThis removes its profile, persona, memory and API key from disk.`))) {
      return;
    }
    const res = await fetch(`/api/admin/hermes-agents/${agent.slug}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      await showAlert(data.error ?? "Failed to delete.");
      return;
    }
    await refresh();
  }

  async function assignBusiness(agent: HermesAgent, businessId: string) {
    try {
      const res = await fetch(`/api/admin/clients/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hermesProfile: agent.slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        await showAlert(data.error ?? "Failed to assign business.");
        return;
      }
      await refresh();
    } catch {
      await showAlert("Could not assign business.");
    }
  }

  async function unassignBusiness(agent: HermesAgent, businessId: string) {
    try {
      const res = await fetch(`/api/admin/clients/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hermesProfile: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        await showAlert(data.error ?? "Failed to unassign business.");
        return;
      }
      await refresh();
    } catch {
      await showAlert("Could not unassign business.");
    }
  }

  return (
    <div style={{ maxWidth: 920, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Hermes Agents</div>
        <div style={subtleTextStyle}>
          One agent per business (or a shared one). Each has its own persona (SOUL) and persistent memory, served
          under <code>/p/&lt;slug&gt;/v1/chat/completions</code>. Set a model override to pick the AI; leaving it
          blank uses the gateway default. A business with <code>hermesEnabled</code> routes its chats here.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            style={inputStyle}
            placeholder="new agent slug (e.g. downtown-dental)"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
          />
          <button style={primaryButtonStyle} onClick={createAgent} disabled={creating}>
            {creating ? "Creating…" : "Create agent"}
          </button>
        </div>
        {error && <div style={{ color: "#b3261e", marginTop: 8 }}>{error}</div>}
      </div>

      {(agents ?? []).map((agent) => {
        const open = openSlug === agent.slug;
        return (
          <div key={agent.slug} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div
                style={{ cursor: "pointer", flex: 1 }}
                onClick={() => setOpenSlug(open ? null : agent.slug)}
              >
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace" }}>{agent.slug}</span>
                {!agent.provisioned && (
                  <span style={{ color: "#b3261e", fontSize: 12, marginLeft: 8 }}>missing API key</span>
                )}
                <div style={subtleTextStyle}>
                  {agent.model ?? "default model"}
                  {agent.provider ? ` · ${agent.provider}` : ""}
                </div>
                {agent.businesses.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    <div style={subtleTextStyle}>Used by:</div>
                    {agent.businesses.map((b) => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span style={{ color: b.hermesEnabled ? "var(--success)" : "var(--text-muted)" }}>
                          {b.name} {b.hermesEnabled ? "(live)" : "(off)"}
                        </span>
                        <button
                          className="plain"
                          onClick={(e) => { e.stopPropagation(); unassignBusiness(agent, b.id); }}
                          style={{ fontSize: 11, color: "var(--danger)", padding: "2px 6px" }}
                          title="Unassign"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div style={{ marginTop: 4 }}>
                      <select
                        value=""
                        onChange={(e) => { e.stopPropagation(); if (e.target.value) assignBusiness(agent, e.target.value); }}
                        disabled={fetchingBusinesses}
                        style={{ ...inputStyle, fontSize: 12, padding: "4px 8px", width: "100%" }}
                      >
                        <option value="" disabled selected>Assign another business…</option>
                        {allBusinesses
                          .filter((biz) => !agent.businesses.some((ab) => ab.id === biz.id))
                          .map((biz) => (
                            <option key={biz.id} value={biz.id}>{biz.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    <div style={subtleTextStyle}>Not assigned to any business.</div>
                    <select
                      value=""
                      onChange={(e) => { e.stopPropagation(); if (e.target.value) assignBusiness(agent, e.target.value); }}
                      disabled={fetchingBusinesses}
                      style={{ ...inputStyle, fontSize: 12, padding: "4px 8px", width: "100%" }}
                    >
                      <option value="" disabled selected>Assign a business…</option>
                      {allBusinesses.map((biz) => (
                        <option key={biz.id} value={biz.id}>{biz.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <button style={dangerButtonStyle} onClick={() => deleteAgent(agent)}>
                Delete
              </button>
            </div>

            {open && <EditableAgent agent={agent} onSave={saveAgent} />}
          </div>
        );
      })}

      {agents !== null && agents.length === 0 && !error && (
        <div style={cardStyle}>
          <div style={subtleTextStyle}>No agents yet — create one above.</div>
        </div>
      )}
    </div>
  );
}

function EditableAgent({
  agent,
  onSave,
}: {
  agent: HermesAgent;
  onSave: (agent: HermesAgent, patch: { soul?: string; model?: string; provider?: string }) => Promise<void>;
}) {
  const [soul, setSoul] = useState(agent.soul ?? "");
  const [model, setModel] = useState(agent.model ?? "");
  const [provider, setProvider] = useState(agent.provider ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const patch: { soul?: string; model?: string; provider?: string } = {};
      if ((soul.trim() ?? "") !== (agent.soul ?? "").trim()) patch.soul = soul;
      const m = model.trim();
      const p = provider.trim();
      if (m !== (agent.model ?? "")) patch.model = m;
      if (p !== (agent.provider ?? "")) patch.provider = p;
      if (Object.keys(patch).length > 0) await onSave(agent, patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <label style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        Model (AIVA_MODEL · blank = gateway default)
        <div style={{ marginTop: 4 }}>
          <ModelSelector
            value={model.trim() || null}
            provider={provider.trim() || null}
            slug={agent.slug}
            onChange={(m, p) => {
              setModel(m ?? "");
              setProvider(p ?? "");
            }}
          />
        </div>
      </label>
      <label style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        Persona (SOUL.md)
        <textarea
          style={{ ...inputStyle, minHeight: 180, marginTop: 4, fontFamily: "monospace", fontSize: 12 }}
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
        />
      </label>
      <div>
        <button style={primaryButtonStyle} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save agent"}
        </button>
      </div>
    </div>
  );
}