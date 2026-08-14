"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { KnowledgeHubPanel } from "../../../components/KnowledgeHubPanel";
import { HandoffsPanel } from "../../../components/HandoffsPanel";
import { AllChatsPanel } from "../../../components/AllChatsPanel";
import { StoragePanel } from "../../../components/StoragePanel";
import { AiBrainPanel } from "../../../components/AiBrainPanel";
import { AiParametersPanel } from "../../../components/AiParametersPanel";
import { ChatLearningPanel } from "../../../components/ChatLearningPanel";
import { ChannelsPanel } from "../../../components/ChannelsPanel";
import { ProductCatalogPanel } from "../../../components/ProductCatalogPanel";
import { OrdersPanel } from "../../../components/OrdersPanel";
import { ClientOverviewPanel } from "../../../components/ClientOverviewPanel";
import { ClientTagDashboardPanel } from "../../../components/ClientTagDashboardPanel";
import { TrainingArenaPanel } from "../../../components/TrainingArenaPanel";
import { DashboardShell, type NavGroup } from "../../../components/DashboardShell";

type Tab = "overview" | "tagdashboard" | "knowledge" | "products" | "orders" | "allchats" | "handoffs" | "storage" | "brain" | "parameters" | "arena" | "review" | "channels";

const NAV_GROUPS: NavGroup<Tab>[] = [
  {
    items: [
      { id: "overview", label: "Overview" },
      { id: "tagdashboard", label: "Dashboard" },
      { id: "knowledge", label: "Knowledge Hub" },
      { id: "products", label: "Product Catalog" },
      { id: "orders", label: "Orders" },
      { id: "allchats", label: "All Chats" },
      { id: "handoffs", label: "Handoffs" },
      { id: "storage", label: "Storage" },
      { id: "brain", label: "AI Brain" },
      { id: "parameters", label: "Parameters" },
      { id: "arena", label: "Training Arena" },
      { id: "review", label: "Chat Learning" },
      { id: "channels", label: "Integrations" },
    ],
  },
];

const TAB_IDS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));

interface Client {
  id: string;
  name: string;
}

/**
 * One dynamic route serves every client — there is no per-company file to
 * generate or deploy. Adding a company on the mother dashboard's Clients
 * tab makes its dashboard exist here immediately, and any future edit to
 * this page or the shared panels it renders applies to every client at
 * once, not one at a time.
 */
export default function ClientDashboardClient() {
  const params = useParams<{ businessId: string }>();
  const businessId = params.businessId;
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");
  const [client, setClient] = useState<Client | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // null = unrestricted (admin, or a client account with no restriction
  // set) — every tab shows. A real array is the exact allow-list.
  const [allowedPanels, setAllowedPanels] = useState<string[] | null>(null);

  function logout() {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => router.push("/"));
  }

  // Only an admin session gets the "back to Command Center" link — a
  // real client's session can't reach /dashboard anyway (see proxy.ts),
  // so this just keeps the UI from offering a link that would bounce.
  // A client session's own allowedPanels (set in the mother dashboard's
  // Client Access tab) restricts which tabs render at all — an admin
  // browsing the same URL is never restricted by this.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        setIsAdmin(data.role === "admin");
        if (data.role === "client" && Array.isArray(data.allowedPanels)) {
          setAllowedPanels(data.allowedPanels);
        }
      });
  }, []);

  const visibleGroups: NavGroup<Tab>[] = allowedPanels
    ? NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowedPanels.includes(i.id)) })).filter(
        (g) => g.items.length > 0
      )
    : NAV_GROUPS;

  // If a restriction kicks in after first paint and the currently-open
  // tab isn't in the allow-list, jump to the first tab that is —
  // otherwise the content pane would keep showing a panel whose own nav
  // entry just disappeared.
  useEffect(() => {
    if (allowedPanels && !allowedPanels.includes(tab)) {
      const firstAllowed = visibleGroups[0]?.items[0]?.id;
      if (firstAllowed) setTab(firstAllowed);
    }
  }, [allowedPanels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always renders "overview" on the server/first paint to avoid a
  // hydration mismatch, then jumps to the OAuth callback's ?tab= param
  // (see api/oauth/[channel]/callback) once mounted.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (requested && TAB_IDS.includes(requested)) {
      setTab(requested);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => {
        const match = (data.clients as Client[]).find((c) => c.id === businessId);
        setClient(match ?? null);
      });
  }, [businessId]);

  return (
    <DashboardShell
      sidebarLabel={
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {client?.name ?? businessId}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
            {isAdmin && (
              <a href="/dashboard" style={{ fontSize: 10.5, color: "var(--text-faint)", fontWeight: 400 }}>
                ← Command Center
              </a>
            )}
            <button
              onClick={logout}
              className="plain-link"
              style={{ fontSize: 10.5, color: "var(--text-faint)", fontWeight: 400, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              Log out
            </button>
          </div>
        </div>
      }
      groups={visibleGroups}
      activeTab={tab}
      onSelect={setTab}
    >
      <div style={{ display: tab === "overview" ? "block" : "none" }}>
        <ClientOverviewPanel businessId={businessId} active={tab === "overview"} />
      </div>
      <div style={{ display: tab === "tagdashboard" ? "block" : "none" }}>
        <ClientTagDashboardPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "knowledge" ? "block" : "none" }}>
        <KnowledgeHubPanel businessId={businessId} active={tab === "knowledge"} />
      </div>
      <div style={{ display: tab === "products" ? "block" : "none" }}>
        <ProductCatalogPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "orders" ? "block" : "none" }}>
        <OrdersPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "allchats" ? "block" : "none" }}>
        <AllChatsPanel businessId={businessId} active={tab === "allchats"} />
      </div>
      <div style={{ display: tab === "handoffs" ? "block" : "none" }}>
        <HandoffsPanel businessId={businessId} active={tab === "handoffs"} />
      </div>
      <div style={{ display: tab === "storage" ? "block" : "none" }}>
        <StoragePanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "brain" ? "block" : "none" }}>
        <AiBrainPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "parameters" ? "block" : "none" }}>
        <AiParametersPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "arena" ? "block" : "none" }}>
        <TrainingArenaPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "review" ? "block" : "none" }}>
        <ChatLearningPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "channels" ? "block" : "none" }}>
        <ChannelsPanel businessId={businessId} />
      </div>
    </DashboardShell>
  );
}
