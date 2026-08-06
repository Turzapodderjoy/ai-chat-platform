"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { KnowledgeHubPanel } from "../../../components/KnowledgeHubPanel";
import { HandoffsPanel } from "../../../components/HandoffsPanel";
import { AllChatsPanel } from "../../../components/AllChatsPanel";
import { StoragePanel } from "../../../components/StoragePanel";
import { AiBrainPanel } from "../../../components/AiBrainPanel";
import { AiParametersPanel } from "../../../components/AiParametersPanel";
import { TrainingReviewPanel } from "../../../components/TrainingReviewPanel";
import { ChannelsPanel } from "../../../components/ChannelsPanel";
import { ClientOverviewPanel } from "../../../components/ClientOverviewPanel";
import { ClientTagDashboardPanel } from "../../../components/ClientTagDashboardPanel";
import { TrainingArenaPanel } from "../../../components/TrainingArenaPanel";
import { DashboardShell, type NavGroup } from "../../../components/DashboardShell";

type Tab = "overview" | "tagdashboard" | "knowledge" | "allchats" | "handoffs" | "storage" | "brain" | "parameters" | "arena" | "review" | "channels";

const NAV_GROUPS: NavGroup<Tab>[] = [
  {
    items: [
      { id: "overview", label: "Overview" },
      { id: "tagdashboard", label: "Dashboard" },
      { id: "knowledge", label: "Knowledge Hub" },
      { id: "allchats", label: "All Chats" },
      { id: "handoffs", label: "Handoffs" },
      { id: "storage", label: "Storage" },
      { id: "brain", label: "AI Brain" },
      { id: "parameters", label: "Parameters" },
      { id: "arena", label: "Training Arena" },
      { id: "review", label: "Training Review" },
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
export default function ClientDashboardPage() {
  const params = useParams<{ businessId: string }>();
  const businessId = params.businessId;
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");
  const [client, setClient] = useState<Client | null>(null);

  function logout() {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => router.push("/"));
  }

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
          <div style={{ fontSize: 14 }}>{client?.name ?? businessId}</div>
          <a href="/dashboard" style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>
            ← Mother dashboard
          </a>
          <div>
            <button
              onClick={logout}
              style={{ fontSize: 11, opacity: 0.6, fontWeight: 400, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textDecoration: "underline" }}
            >
              Log out
            </button>
          </div>
        </div>
      }
      groups={NAV_GROUPS}
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
        <KnowledgeHubPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "allchats" ? "block" : "none" }}>
        <AllChatsPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "handoffs" ? "block" : "none" }}>
        <HandoffsPanel businessId={businessId} />
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
        <TrainingReviewPanel businessId={businessId} />
      </div>
      <div style={{ display: tab === "channels" ? "block" : "none" }}>
        <ChannelsPanel businessId={businessId} />
      </div>
    </DashboardShell>
  );
}
