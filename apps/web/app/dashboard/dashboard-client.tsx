"use client";

import { useEffect, useState } from "react";

import { KnowledgeHubPanel } from "../../components/KnowledgeHubPanel";
import { HandoffsPanel } from "../../components/HandoffsPanel";
import { AllChatsPanel } from "../../components/AllChatsPanel";
import { AiBrainPanel } from "../../components/AiBrainPanel";
import { AiParametersPanel } from "../../components/AiParametersPanel";
import { ChatLearningPanel } from "../../components/ChatLearningPanel";
import { PlatformChannelAppsPanel } from "../../components/PlatformChannelAppsPanel";
import { TagsPanel } from "../../components/TagsPanel";
import { ClientAccessPanel } from "../../components/ClientAccessPanel";
import { OverviewPanel } from "../../components/OverviewPanel";
import { ClientHealthPanel } from "../../components/ClientHealthPanel";
import { ContactsPanel } from "../../components/ContactsPanel";
import { CompaniesPanel } from "../../components/CompaniesPanel";
import { DealsPanel } from "../../components/DealsPanel";
import { QuotesPanel } from "../../components/QuotesPanel";
import { InvoicesPanel } from "../../components/InvoicesPanel";
import { ReportsPanel } from "../../components/ReportsPanel";
import { TrainingArenaPanel } from "../../components/TrainingArenaPanel";
import { StatusBadge } from "../../components/StatusBadge";
import { DashboardShell, type NavGroup } from "../../components/DashboardShell";
import { cardStyle, cellStyle, formatBytes, subtleTextStyle, primaryButtonStyle } from "../../components/dashboard-styles";

// PLATFORM_CONFIG_ID as used by @ai-chat-platform/ai-config — kept as a
// plain literal here rather than importing a backend package into this
// client component just for one string constant.
const PLATFORM_CONFIG_ID = "__platform__";

type Tab = "overview" | "health" | "ai" | "embedding" | "brain" | "parameters" | "review" | "arena" | "channels" | "usage" | "clients" | "access" | "knowledge" | "allchats" | "handoffs" | "database" | "tags" | "contacts" | "companies" | "deals" | "quotes" | "invoices" | "reports";

const NAV_GROUPS: NavGroup<Tab>[] = [
  { items: [{ id: "overview", label: "Overview" }, { id: "health", label: "Client Health" }, { id: "reports", label: "Reports" }] },
  {
    label: "CRM",
    items: [
      { id: "contacts", label: "Contacts" },
      { id: "companies", label: "Companies" },
      { id: "deals", label: "Deals" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { id: "quotes", label: "Quotes" },
      { id: "invoices", label: "Invoices" },
    ],
  },
  { items: [{ id: "clients", label: "Clients" }, { id: "access", label: "Client Access" }] },
  {
    label: "AI Brain",
    items: [
      { id: "brain", label: "AI Brain" },
      { id: "parameters", label: "Parameters" },
      { id: "arena", label: "Training Arena" },
      { id: "review", label: "Chat Learning" },
    ],
  },
  {
    label: "Conversations",
    items: [
      { id: "allchats", label: "Inbox" },
      { id: "handoffs", label: "Handoffs" },
      { id: "tags", label: "Tags" },
    ],
  },
  {
    label: "Content",
    items: [{ id: "knowledge", label: "Knowledge Hub" }],
  },
  {
    label: "Providers",
    items: [
      { id: "ai", label: "AI Providers" },
      { id: "embedding", label: "Embedding Providers" },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "channels", label: "Integrations" },
      { id: "usage", label: "Usage" },
      { id: "database", label: "Database" },
    ],
  },
];

interface ProviderStatus {
  name: string;
  healthy: boolean;
  hasUsableKey: boolean;
  maskedKey: string | null;
  enabled: boolean;
}

interface CatalogEntry {
  id: string;
  label: string;
}

interface ExtractionKeyStatus {
  maskedKey: string;
  healthy: boolean;
  lastError: string | null;
  lastUsedAt: string | null;
}

interface ExtractionKeyEntry {
  id: string;
  label: string | null;
  maskedKey: string;
  createdAt: string;
}

interface ProvidersResponse {
  active: string[];
  status: ProviderStatus[];
  catalog: {
    available: CatalogEntry[];
    planned: CatalogEntry[];
  };
  extraction?: { keys: ExtractionKeyStatus[] };
}

interface AiUsage {
  [provider: string]: {
    requests: number;
    successes: number;
    failures: number;
    tokens: number;
  };
}

interface EmbeddingUsage {
  [provider: string]: {
    requests: number;
    successes: number;
    failures: number;
    tokens: number;
  };
}

interface ChatUsageEntry {
  chatId: string;
  provider: string;
  tokens: number;
  confidence: number;
  createdAt: string;
}

interface DatabaseStatus {
  connected: boolean;
  host: string | null;
  error?: string;
}

interface CacheStats {
  size: number;
  totalHits: number;
}

interface Client {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/** One provider = one card, not a spreadsheet row — a raw <table> for a
 * handful of entities (5-8 providers) reads as a database browser; a
 * small grid of cards reads as a product. Same information, organized
 * as a scannable identity (initial badge + name) with status and
 * actions grouped underneath, instead of six flat columns. */
function ProviderCard({
  name,
  enabled,
  healthy,
  hasUsableKey,
  maskedKey,
  onToggle,
  toggling,
  onRemove,
  removing,
}: {
  name: string;
  enabled: boolean;
  healthy: boolean;
  hasUsableKey: boolean;
  maskedKey: string | null;
  onToggle: () => void;
  toggling: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      style={{
        background: "var(--md-surface-1, var(--bg-elevated))",
        border: "1px solid var(--border)",
        borderRadius: "var(--md-shape-lg, var(--radius))",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 9,
            background: enabled ? "var(--accent-soft)" : "var(--surface)",
            color: enabled ? "var(--accent-strong)" : "var(--text-faint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <code style={{ fontSize: 11, color: "var(--text-faint)", background: "none", border: "none", padding: 0 }}>
            {maskedKey ?? "no key"}
          </code>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <StatusBadge tone={enabled ? "ok" : "neutral"}>{enabled ? "On" : "Off"}</StatusBadge>
        <StatusBadge tone={healthy ? "ok" : "error"}>{healthy ? "Healthy" : "Unhealthy"}</StatusBadge>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onToggle} disabled={toggling} style={{ flex: 1, fontSize: 12, padding: "6px 10px" }}>
          {toggling ? "…" : enabled ? "Turn off" : "Turn on"}
        </button>
        <button onClick={onRemove} disabled={removing || !hasUsableKey} style={{ flex: 1, fontSize: 12, padding: "6px 10px" }}>
          {removing ? "…" : "Remove key"}
        </button>
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUsername(typeof data.username === "string" ? data.username : null));
  }, []);

  return (
    <DashboardShell
      sidebarLabel={
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>AIVA</div>
          <div style={{ fontSize: 10.5, color: "var(--text-faint)", fontWeight: 400, marginTop: 2 }}>
            Command Center
          </div>
          {username && (
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Logged in as {username}</div>
          )}
        </div>
      }
      groups={NAV_GROUPS}
      activeTab={tab}
      onSelect={setTab}
    >
      {/* Every panel stays mounted (hidden via CSS, not unmounted) so
          switching tabs never wipes a panel's local state. */}
      <div style={{ display: tab === "overview" ? "block" : "none" }}>
        <OverviewPanel active={tab === "overview"} />
      </div>
      <div style={{ display: tab === "health" ? "block" : "none" }}>
        <ClientHealthPanel active={tab === "health"} />
      </div>
      <div style={{ display: tab === "ai" ? "block" : "none" }}>
        <AiProvidersPanel />
      </div>
      <div style={{ display: tab === "embedding" ? "block" : "none" }}>
        <EmbeddingProvidersPanel />
      </div>
      <div style={{ display: tab === "brain" ? "block" : "none" }}>
        <AiBrainPanel />
      </div>
      <div style={{ display: tab === "parameters" ? "block" : "none" }}>
        <AiParametersPanel />
      </div>
      <div style={{ display: tab === "arena" ? "block" : "none" }}>
        <TrainingArenaPanel businessId={PLATFORM_CONFIG_ID} />
      </div>
      <div style={{ display: tab === "review" ? "block" : "none" }}>
        <ChatLearningPanel />
      </div>
      <div style={{ display: tab === "channels" ? "block" : "none" }}>
        <PlatformChannelAppsPanel />
      </div>
      <div style={{ display: tab === "usage" ? "block" : "none" }}>
        <UsagePanel />
      </div>
      <div style={{ display: tab === "clients" ? "block" : "none" }}>
        <ClientsPanel />
      </div>
      <div style={{ display: tab === "access" ? "block" : "none" }}>
        <ClientAccessPanel />
      </div>
      <div style={{ display: tab === "knowledge" ? "block" : "none" }}>
        <KnowledgeHubPanel active={tab === "knowledge"} />
      </div>
      <div style={{ display: tab === "allchats" ? "block" : "none" }}>
        <AllChatsPanel active={tab === "allchats"} />
      </div>
      <div style={{ display: tab === "contacts" ? "block" : "none" }}>
        <ContactsPanel active={tab === "contacts"} />
      </div>
      <div style={{ display: tab === "companies" ? "block" : "none" }}>
        <CompaniesPanel active={tab === "companies"} />
      </div>
      <div style={{ display: tab === "deals" ? "block" : "none" }}>
        <DealsPanel active={tab === "deals"} />
      </div>
      <div style={{ display: tab === "quotes" ? "block" : "none" }}>
        <QuotesPanel active={tab === "quotes"} />
      </div>
      <div style={{ display: tab === "invoices" ? "block" : "none" }}>
        <InvoicesPanel active={tab === "invoices"} />
      </div>
      <div style={{ display: tab === "reports" ? "block" : "none" }}>
        <ReportsPanel active={tab === "reports"} />
      </div>
      <div style={{ display: tab === "handoffs" ? "block" : "none" }}>
        <HandoffsPanel active={tab === "handoffs"} />
      </div>
      <div style={{ display: tab === "tags" ? "block" : "none" }}>
        <TagsPanel />
      </div>
      <div style={{ display: tab === "database" ? "block" : "none" }}>
        <DatabasePanel />
      </div>
    </DashboardShell>
  );
}

function ClientsPanel() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [storageByClient, setStorageByClient] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  function refresh() {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => {
        const list: Client[] = data.clients;
        setClients(list);

        // One request per client, in parallel — fine for the handful of
        // clients an internal admin panel deals with; revisit if this
        // ever needs to scale to hundreds at once.
        Promise.all(
          list.map((c) =>
            fetch(`/api/admin/storage?businessId=${encodeURIComponent(c.id)}`)
              .then((r) => r.json())
              .then((info) => [c.id, info.knowledgeBytesEstimate as number] as const)
          )
        ).then((pairs) => setStorageByClient(Object.fromEntries(pairs)));
      });
  }

  useEffect(refresh, []);

  async function addClient() {
    if (!name.trim()) return;
    setCreating(true);

    try {
      await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setName("");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function deleteClient(client: Client) {
    const confirmed = window.confirm(
      `Delete "${client.name}"? This permanently removes their conversations, crawl targets, and indexed knowledge base — it cannot be undone.`
    );
    if (!confirmed) return;

    await fetch(`/api/admin/clients/${client.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Clients</h2>
      <p style={subtleTextStyle}>
        Adding a company creates its dashboard immediately — every client
        shares the same dashboard page (/dashboard/[id]), so there&apos;s
        nothing to deploy per client and every future update applies to all
        of them at once.
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addClient();
          }}
        />
        <button onClick={addClient} disabled={creating} style={primaryButtonStyle}>
          {creating ? "Adding…" : "Add company"}
        </button>
      </div>

      {!clients && <p>Loading…</p>}

      {clients && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Created</th>
              <th style={cellStyle}>Storage used</th>
              <th style={cellStyle}>Dashboard</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td style={cellStyle}>{c.name}</td>
                <td style={cellStyle}>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td style={cellStyle}>
                  {storageByClient[c.id] !== undefined ? formatBytes(storageByClient[c.id]!) : "…"}
                </td>
                <td style={cellStyle}>
                  <a href={`/dashboard/${c.id}`}>/dashboard/{c.id}</a>
                </td>
                <td style={cellStyle}>
                  <button onClick={() => deleteClient(c)}>Delete</button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={5}>
                  No clients yet — add one above.
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

function AiProvidersPanel() {
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [customLabel, setCustomLabel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customSaving, setCustomSaving] = useState(false);
  const [customMessage, setCustomMessage] = useState("");

  function refresh() {
    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then(setData);

    fetch("/api/admin/providers/custom")
      .then((r) => r.json())
      .then((d: { providers: { id: string; label: string }[] }) =>
        setCustomLabels(Object.fromEntries(d.providers.map((p) => [p.id, p.label])))
      );
  }

  useEffect(refresh, []);

  async function toggle(name: string, enabled: boolean) {
    setToggling(name);

    try {
      const res = await fetch("/api/admin/providers/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: name, enabled }),
      });

      if (res.ok) {
        refresh();
      } else {
        const result = await res.json();
        setMessage(`Error: ${result.error}`);
      }
    } finally {
      setToggling(null);
    }
  }

  async function remove(name: string) {
    const confirmed = window.confirm(
      `Remove the API key for "${customLabels[name] ?? name}"? It stays registered but won't be usable until re-activated with a new key.`
    );
    if (!confirmed) return;

    setRemoving(name);

    try {
      const res = await fetch("/api/admin/providers/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: name }),
      });

      if (res.ok) {
        refresh();
      } else {
        const result = await res.json();
        setMessage(`Error: ${result.error}`);
      }
    } finally {
      setRemoving(null);
    }
  }

  useEffect(() => {
    const first = data?.catalog.available[0];
    if (first && !selected) {
      setSelected(first.id);
    }
  }, [data, selected]);

  async function activate() {
    if (!selected || !apiKey.trim()) return;
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/providers/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected, apiKey }),
      });
      const result = await res.json();

      setMessage(
        res.ok
          ? `Activated "${result.activated}" — live now, and saved permanently (survives restarts).`
          : `Error: ${result.error}`
      );

      if (res.ok) {
        setApiKey("");
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  /** For a newly-released provider not in the hardcoded catalog — any
   * vendor speaking the standard OpenAI-compatible /chat/completions
   * shape works here without writing a new adapter package. */
  async function addCustomProvider() {
    if (!customLabel.trim() || !customBaseUrl.trim() || !customModel.trim() || !customApiKey.trim()) return;
    setCustomSaving(true);
    setCustomMessage("");

    try {
      const res = await fetch("/api/admin/providers/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: customLabel,
          baseUrl: customBaseUrl,
          model: customModel,
          apiKey: customApiKey,
        }),
      });
      const result = await res.json();

      setCustomMessage(
        res.ok
          ? `Added "${customLabel}" — live now, and saved permanently.`
          : `Error: ${result.error}`
      );

      if (res.ok) {
        setCustomLabel("");
        setCustomBaseUrl("");
        setCustomModel("");
        setCustomApiKey("");
        refresh();
      }
    } finally {
      setCustomSaving(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>AI Providers</h2>
      <p style={subtleTextStyle}>
        Turn a provider on/off to experiment — disable the others to force
        every chat through one specific provider, or disable one to see
        the rest pick up its traffic. Takes effect on the very next chat
        message, no restart.
      </p>

      {!data && <p>Loading…</p>}

      {data && (
        <>
          {data.status.length === 0 && <p style={subtleTextStyle}>No providers active yet.</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {data.status.map((p) => (
              <ProviderCard
                key={p.name}
                name={customLabels[p.name] ?? p.name}
                enabled={p.enabled}
                healthy={p.healthy}
                hasUsableKey={p.hasUsableKey}
                maskedKey={p.maskedKey}
                onToggle={() => toggle(p.name, !p.enabled)}
                toggling={toggling === p.name}
                onRemove={() => remove(p.name)}
                removing={removing === p.name}
              />
            ))}
          </div>

          <h3 style={{ marginTop: 24 }}>Add a custom provider</h3>
          <p style={subtleTextStyle}>
            Not in the list below? Any provider speaking the standard
            OpenAI-compatible /chat/completions API (which covers most
            newly-released providers) can be added here directly — no code
            change needed.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              style={{ padding: 8, width: 140 }}
              placeholder="Label (e.g. Kimi)"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
            />
            <input
              style={{ padding: 8, flex: 1, minWidth: 220 }}
              placeholder="Base URL (e.g. https://api.example.com/v1/chat/completions)"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
            />
            <input
              style={{ padding: 8, width: 160 }}
              placeholder="Model name"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
            />
            <input
              style={{ padding: 8, width: 160 }}
              placeholder="API key"
              type="password"
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
            />
            <button onClick={addCustomProvider} disabled={customSaving}>
              {customSaving ? "Saving…" : "Add"}
            </button>
          </div>
          {customMessage && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{customMessage}</p>}

          <h3 style={{ marginTop: 24 }}>Add / activate a provider</h3>
          <p style={subtleTextStyle}>
            Only providers with a real, coded adapter can be activated —
            picking one just needs an API key, no redeploy or code change.
            Planned but not-yet-coded providers are listed below for
            visibility.
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{ padding: 8 }}
            >
              {data.catalog.available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              style={{ padding: 8, flex: 1, minWidth: 200 }}
              placeholder="API key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button onClick={activate} disabled={saving} style={primaryButtonStyle}>
              {saving ? "Saving…" : "Activate"}
            </button>
          </div>

          {message && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{message}</p>}

          <p style={{ ...subtleTextStyle, fontSize: 12, marginTop: 12 }}>
            Not implemented yet: {data.catalog.planned.map((p) => p.label).join(", ")}.
            Each needs its adapter written once (implements the same
            AIProvider interface as Groq) before it can be activated here.
          </p>
        </>
      )}
    </section>
  );
}

function EmbeddingProvidersPanel() {
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [extractionKeys, setExtractionKeys] = useState<ExtractionKeyEntry[] | null>(null);
  const [newExtractionKey, setNewExtractionKey] = useState("");
  const [newExtractionLabel, setNewExtractionLabel] = useState("");
  const [addingExtraction, setAddingExtraction] = useState(false);
  const [removingExtraction, setRemovingExtraction] = useState<string | null>(null);
  const [extractionMessage, setExtractionMessage] = useState("");

  function refresh() {
    fetch("/api/admin/embedding-providers")
      .then((r) => r.json())
      .then(setData);
  }

  function refreshExtractionKeys() {
    fetch("/api/admin/extraction-keys")
      .then((r) => r.json())
      .then(setExtractionKeys);
  }

  useEffect(refresh, []);
  useEffect(refreshExtractionKeys, []);

  async function addExtractionKey() {
    if (!newExtractionKey.trim()) return;
    setAddingExtraction(true);
    setExtractionMessage("");

    try {
      const res = await fetch("/api/admin/extraction-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newExtractionKey, label: newExtractionLabel || undefined }),
      });
      const result = await res.json();

      setExtractionMessage(
        res.ok ? "Key added — takes effect on the next server restart." : `Error: ${result.error}`
      );

      if (res.ok) {
        setNewExtractionKey("");
        setNewExtractionLabel("");
        refreshExtractionKeys();
      }
    } finally {
      setAddingExtraction(false);
    }
  }

  async function removeExtractionKey(id: string) {
    const confirmed = window.confirm("Remove this extraction key? Takes effect on the next server restart.");
    if (!confirmed) return;

    setRemovingExtraction(id);
    try {
      await fetch("/api/admin/extraction-keys/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      refreshExtractionKeys();
    } finally {
      setRemovingExtraction(null);
    }
  }

  async function toggle(name: string, enabled: boolean) {
    setToggling(name);

    try {
      const res = await fetch("/api/admin/embedding-providers/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: name, enabled }),
      });

      if (res.ok) {
        refresh();
      } else {
        const result = await res.json();
        setMessage(`Error: ${result.error}`);
      }
    } finally {
      setToggling(null);
    }
  }

  async function remove(name: string) {
    const confirmed = window.confirm(
      `Remove the API key for "${name}"? It stays registered but won't be usable until re-activated with a new key.`
    );
    if (!confirmed) return;

    setRemoving(name);

    try {
      const res = await fetch("/api/admin/embedding-providers/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: name }),
      });

      if (res.ok) {
        refresh();
      } else {
        const result = await res.json();
        setMessage(`Error: ${result.error}`);
      }
    } finally {
      setRemoving(null);
    }
  }

  useEffect(() => {
    const first = data?.catalog.available[0];
    if (first && !selected) {
      setSelected(first.id);
    }
  }, [data, selected]);

  async function activate() {
    if (!selected || !apiKey.trim()) return;
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/embedding-providers/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected, apiKey }),
      });
      const result = await res.json();

      setMessage(
        res.ok
          ? `Activated "${result.activated}" — live now, and saved permanently (survives restarts).`
          : `Error: ${result.error}`
      );

      if (res.ok) {
        setApiKey("");
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Embedding Providers</h2>
      <p style={subtleTextStyle}>
        The same rotation/failover the AI Providers panel does for chat
        replies, but for the embedding step that runs before every
        retrieval and every document upload. Turn a provider on/off to
        experiment — disable the others to force every embedding call
        through one specific provider, or disable one to see the rest
        pick up its traffic. Takes effect on the very next call, no
        restart.
      </p>

      {!data && <p>Loading…</p>}

      {data && (
        <>
          {data.status.length === 0 && <p style={subtleTextStyle}>No embedding providers active yet.</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {data.status.map((p) => (
              <ProviderCard
                key={p.name}
                name={p.name}
                enabled={p.enabled}
                healthy={p.healthy}
                hasUsableKey={p.hasUsableKey}
                maskedKey={p.maskedKey}
                onToggle={() => toggle(p.name, !p.enabled)}
                toggling={toggling === p.name}
                onRemove={() => remove(p.name)}
                removing={removing === p.name}
              />
            ))}
          </div>

          <h3 style={{ marginTop: 24 }}>Add / activate a provider</h3>
          <p style={subtleTextStyle}>
            Only providers with a real, coded adapter can be activated —
            picking one just needs an API key, no redeploy or code change.
            Planned but not-yet-coded providers are listed below for
            visibility.
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{ padding: 8 }}
            >
              {data.catalog.available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              style={{ padding: 8, flex: 1, minWidth: 200 }}
              placeholder="API key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button onClick={activate} disabled={saving} style={primaryButtonStyle}>
              {saving ? "Saving…" : "Activate"}
            </button>
          </div>

          {message && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{message}</p>}

          <p style={{ ...subtleTextStyle, fontSize: 12, marginTop: 12 }}>
            Not implemented yet: {data.catalog.planned.map((p) => p.label).join(", ")}.
            Each needs its adapter written once (implements the same
            EmbeddingProvider interface as Jina) before it can be
            activated here.
          </p>

          <h3 style={{ marginTop: 24 }}>Extraction (Groq)</h3>
          <p style={subtleTextStyle}>
            A separate key pool, not the embedding step above — used by
            the crawler to turn a product page into structured rows
            (name/price/stock) and to derive each site&apos;s own
            extraction pattern. Rotates to the next key on a 429; a key
            marked unhealthy failed its most recent attempt (often
            Groq&apos;s daily token cap, not a config problem — add
            another key rather than waiting it out).
          </p>
          <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>Key</th>
                <th style={cellStyle}>Healthy</th>
                <th style={cellStyle}>Last used</th>
                <th style={cellStyle}>Last error</th>
              </tr>
            </thead>
            <tbody>
              {(data.extraction?.keys ?? []).map((k, i) => (
                <tr key={i}>
                  <td style={cellStyle}>
                    <code style={{ fontSize: 12 }}>{k.maskedKey}</code>
                  </td>
                  <td style={cellStyle}><StatusBadge tone={k.healthy ? "ok" : "error"}>{k.healthy ? "Healthy" : "Unhealthy"}</StatusBadge></td>
                  <td style={cellStyle}>
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: "var(--text-muted)" }}>
                    {k.lastError ?? "—"}
                  </td>
                </tr>
              ))}
              {(data.extraction?.keys ?? []).length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={4}>
                    No GROQ_EXTRACTION_API_KEY configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <h3 style={{ marginTop: 24 }}>Manage extraction keys</h3>
          <p style={subtleTextStyle}>
            Add or remove a Groq key from the extraction pool above without a code change. Takes
            effect on the next server restart, same as any other key rotation change.
          </p>

          {extractionKeys && (
            <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellStyle}>Key</th>
                  <th style={cellStyle}>Label</th>
                  <th style={cellStyle}>Added</th>
                  <th style={cellStyle}></th>
                </tr>
              </thead>
              <tbody>
                {extractionKeys.map((k) => (
                  <tr key={k.id}>
                    <td style={cellStyle}>
                      <code style={{ fontSize: 12 }}>{k.maskedKey}</code>
                    </td>
                    <td style={cellStyle}>{k.label ?? "—"}</td>
                    <td style={cellStyle}>{new Date(k.createdAt).toLocaleString()}</td>
                    <td style={cellStyle}>
                      <button
                        onClick={() => removeExtractionKey(k.id)}
                        disabled={removingExtraction === k.id}
                      >
                        {removingExtraction === k.id ? "…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
                {extractionKeys.length === 0 && (
                  <tr>
                    <td style={cellStyle} colSpan={4}>
                      No keys added here yet — the table above still reflects any
                      GROQ_EXTRACTION_API_KEY[, _2, _3] env vars.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <input
              style={{ padding: 8, flex: 1, minWidth: 200 }}
              placeholder="Groq API key"
              type="password"
              value={newExtractionKey}
              onChange={(e) => setNewExtractionKey(e.target.value)}
            />
            <input
              style={{ padding: 8, width: 160 }}
              placeholder="Label (optional)"
              value={newExtractionLabel}
              onChange={(e) => setNewExtractionLabel(e.target.value)}
            />
            <button onClick={addExtractionKey} disabled={addingExtraction} style={primaryButtonStyle}>
              {addingExtraction ? "Adding…" : "Add key"}
            </button>
          </div>

          {extractionMessage && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{extractionMessage}</p>
          )}
        </>
      )}
    </section>
  );
}

function UsagePanel() {
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [embeddingUsage, setEmbeddingUsage] = useState<EmbeddingUsage | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [chats, setChats] = useState<ChatUsageEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/usage")
      .then((r) => r.json())
      .then((data) => {
        setAiUsage(data.ai);
        setEmbeddingUsage(data.embeddings);
        setCacheStats(data.cache);
      });

    fetch("/api/admin/chat-usage")
      .then((r) => r.json())
      .then((data) => setChats(data.chats));
  }, []);

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Usage</h1>
      <p style={subtleTextStyle}>
        In-memory counters, reset on server restart — and in local testing
        they didn&apos;t even stay consistent request-to-request, which means
        this dev server is handling requests across more than one worker
        with separate memory. Real numbers need a persisted UsageRecord
        table (Postgres), same fix as conversation history below.
      </p>

      {cacheStats && (
        <p style={{ color: "var(--text-muted)" }}>
          Response cache: {cacheStats.size} cached answers, {cacheStats.totalHits}{" "}
          reuses so far — each reuse is a chat answered with 0 LLM tokens.
        </p>
      )}

      <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>By chat</h3>
      {!chats && <p>Loading…</p>}
      {chats && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Chat ID</th>
              <th style={cellStyle}>Provider</th>
              <th style={cellStyle}>Confidence</th>
              <th style={cellStyle}>Tokens</th>
              <th style={cellStyle}>When</th>
            </tr>
          </thead>
          <tbody>
            {chats.map((c, i) => (
              <tr key={i}>
                <td style={cellStyle}>
                  <code style={{ fontSize: 11 }}>{c.chatId}</code>
                </td>
                <td style={cellStyle}>{c.provider}</td>
                <td style={cellStyle}>{Math.round(c.confidence * 100)}%</td>
                <td style={cellStyle}>{c.tokens}</td>
                <td style={cellStyle}>{new Date(c.createdAt).toLocaleTimeString()}</td>
              </tr>
            ))}
            {chats.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={5}>
                  No chats yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
      </div>

      <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>AI providers (totals)</h3>
      {!aiUsage && <p>Loading…</p>}
      {aiUsage && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Provider</th>
              <th style={cellStyle}>Requests</th>
              <th style={cellStyle}>Successes</th>
              <th style={cellStyle}>Failures</th>
              <th style={cellStyle}>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(aiUsage).map(([name, stats]) => (
              <tr key={name}>
                <td style={cellStyle}>{name}</td>
                <td style={cellStyle}>{stats.requests}</td>
                <td style={cellStyle}>{stats.successes}</td>
                <td style={cellStyle}>{stats.failures}</td>
                <td style={cellStyle}>{stats.tokens}</td>
              </tr>
            ))}
            {Object.keys(aiUsage).length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={5}>
                  No AI requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
      </div>

      <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Embedding providers (totals)</h3>
      {!embeddingUsage && <p>Loading…</p>}
      {embeddingUsage && (
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Provider</th>
              <th style={cellStyle}>Requests</th>
              <th style={cellStyle}>Successes</th>
              <th style={cellStyle}>Failures</th>
              <th style={cellStyle}>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(embeddingUsage).map(([name, stats]) => (
              <tr key={name}>
                <td style={cellStyle}>{name}</td>
                <td style={cellStyle}>{stats.requests}</td>
                <td style={cellStyle}>{stats.successes}</td>
                <td style={cellStyle}>{stats.failures}</td>
                <td style={cellStyle}>{stats.tokens}</td>
              </tr>
            ))}
            {Object.keys(embeddingUsage).length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={5}>
                  No embedding calls yet — upload a document or ask a
                  question (retrieval embeds the query too).
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
      </div>
    </section>
  );
}

function DatabasePanel() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);

  useEffect(() => {
    fetch("/api/admin/database")
      .then((r) => r.json())
      .then(setStatus);
  }, []);

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Database</h2>
      <p style={subtleTextStyle}>
        Swap <code>DATABASE_URL</code> in your env (local Postgres today, any
        online Postgres — Neon, Supabase, RDS — tomorrow) and this panel
        reflects it. No connection strings are entered or stored through this
        UI.
      </p>

      {!status && <p>Loading…</p>}

      {status && (
        <ul>
          <li>Status: <StatusBadge tone={status.connected ? "ok" : "error"}>{status.connected ? "Connected" : "Not connected"}</StatusBadge></li>
          <li>Host: {status.host ?? "not set"}</li>
          {status.error && <li>Error: {status.error}</li>}
        </ul>
      )}
    </section>
  );
}
