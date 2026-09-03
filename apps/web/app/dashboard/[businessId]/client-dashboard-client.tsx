"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

import { KnowledgeHubPanel } from "../../../components/KnowledgeHubPanel";
import { AllChatsPanel } from "../../../components/AllChatsPanel";
import { StoragePanel } from "../../../components/StoragePanel";
import { AiBrainPanel } from "../../../components/AiBrainPanel";
import { AiParametersPanel } from "../../../components/AiParametersPanel";
import { ChatLearningPanel } from "../../../components/ChatLearningPanel";
import { ChannelsPanel } from "../../../components/ChannelsPanel";
import { ProductCatalogPanel } from "../../../components/ProductCatalogPanel";
import { InventoryPanel } from "../../../components/InventoryPanel";
import { StatusEmailTemplatesPanel } from "../../../components/StatusEmailTemplatesPanel";
import { OrdersPanel } from "../../../components/OrdersPanel";
import { DeliveryPanel } from "../../../components/DeliveryPanel";
import { RepairsPanel } from "../../../components/RepairsPanel";
import { StaffPanel } from "../../../components/StaffPanel";
import { ContactsPanel } from "../../../components/ContactsPanel";
import { QuotesPanel } from "../../../components/QuotesPanel";
import { InvoicesPanel } from "../../../components/InvoicesPanel";
import { ReportsPanel } from "../../../components/ReportsPanel";
import { ClientOverviewPanel } from "../../../components/ClientOverviewPanel";
import { ClientTagDashboardPanel } from "../../../components/ClientTagDashboardPanel";
import { TrainingArenaPanel } from "../../../components/TrainingArenaPanel";
import { SubscriptionStatus } from "../../../components/SubscriptionStatus";
import { SubscriptionNotification } from "../../../components/SubscriptionNotification";
import { DashboardShell, type NavGroup } from "../../../components/DashboardShell";
import { RemovableSection } from "../../../components/RemovableSection";
import { AgentConsole } from "../../../components/AgentConsole";
import { UserSettingsPanel } from "../../../components/UserSettingsPanel";

type Tab = "overview" | "tagdashboard" | "knowledge" | "products" | "inventory" | "orders" | "delivery" | "repairs" | "staff" | "allchats" | "storage" | "brain" | "parameters" | "arena" | "review" | "channels" | "contacts" | "quotes" | "invoices" | "reports" | "notifications" | "settings";

const NAV_GROUPS: NavGroup<Tab>[] = [
  { items: [{ id: "overview", label: "Overview" }, { id: "tagdashboard", label: "Dashboard" }, { id: "reports", label: "Reports" }] },
  {
    label: "Conversations",
    items: [
      { id: "allchats", label: "Inbox" },
    ],
  },
  {
    label: "CRM",
    items: [
      { id: "contacts", label: "Contacts" },
    ],
  },
  {
    label: "Sales",
    items: [
      { id: "orders", label: "Orders" },
      { id: "delivery", label: "Delivery" },
      { id: "repairs", label: "Repairs" },
      { id: "staff", label: "Staff" },
      { id: "products", label: "Product Catalog" },
      { id: "inventory", label: "Inventory" },
      { id: "notifications", label: "Notifications" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { id: "quotes", label: "Quotes" },
      { id: "invoices", label: "Invoices" },
    ],
  },
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
    label: "Content",
    items: [
      { id: "knowledge", label: "Knowledge Hub" },
      { id: "storage", label: "Storage" },
    ],
  },
  { items: [{ id: "channels", label: "Integrations" }] },
  { items: [{ id: "settings", label: "User Settings" }] },
];

const TAB_IDS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));

interface Client {
  id: string;
  name: string;
  type: string;
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
  const [username, setUsername] = useState<string | null>(null);
  // null = unrestricted (admin, or a client account with no restriction
  // set) — every tab shows. A real array is the exact allow-list.
  const [allowedPanels, setAllowedPanels] = useState<string[] | null>(null);
  // Admin-only "remove this box for this client" list — see
  // RemovableSection. A panel wrapped in it renders nothing at all for
  // a real (non-admin) client session once its id is in here.
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  // ?view=client -- an admin browsing this URL normally sees everything
  // (see the comment below), which made it impossible to check what a
  // restricted client actually sees without logging out and back in as
  // them. This flag makes an admin session render exactly as that
  // client's own login would, read-only (no RemovableSection editing),
  // using the FIRST non-admin login found for this business -- good
  // enough since in practice a business has one login, and multiple
  // logins for one business share the same panel restrictions anyway.
  const [previewAsClient, setPreviewAsClient] = useState(false);
  // Set once /api/auth/me resolves -- a session created via the owner's
  // own Agents panel gets a completely different, cut-down dashboard
  // (AgentConsole), not just fewer nav tabs on the normal one.
  const [isAgent, setIsAgent] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  // "owner" | "staff" | null -- which role preset this login was
  // created under (see ClientAccount.role). Only an owner gets the
  // User Settings tab (self + staff username/password management).
  const [accountRole, setAccountRole] = useState<string | null>(null);

  function logout() {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => router.push("/"));
  }

  function refreshHiddenWidgets() {
    fetch(`/api/admin/widget-visibility?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { hidden: string[] }) => setHiddenWidgets(d.hidden ?? []));
  }

  useEffect(() => {
    refreshHiddenWidgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  function toggleWidget(widgetId: string, hide: boolean) {
    const req = hide
      ? fetch("/api/admin/widget-visibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, widgetId }),
        })
      : fetch(`/api/admin/widget-visibility?businessId=${encodeURIComponent(businessId)}&widgetId=${encodeURIComponent(widgetId)}`, {
          method: "DELETE",
        });
    req.then(refreshHiddenWidgets);
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
        setIsAgent(data.role === "agent");
        setUsername(typeof data.username === "string" ? data.username : null);
        setAccountId(typeof data.accountId === "string" ? data.accountId : null);
        if ((data.role === "client" || data.role === "agent") && Array.isArray(data.allowedPanels)) {
          setAllowedPanels(data.allowedPanels);
        }
        if (typeof data.accountRole === "string") {
          setAccountRole(data.accountRole);
        }
      });
  }, []);

  // Reads ?view=client on mount (same place the ?tab= param below is
  // read) and, once we know this is really an admin session, fetches
  // this business's own login to borrow its allowedPanels for the
  // preview -- an admin previewing has no allowedPanels of their own.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "client") {
      setPreviewAsClient(true);
    }
  }, []);

  useEffect(() => {
    if (!previewAsClient || !isAdmin) return;
    fetch("/api/admin/client-accounts")
      .then((r) => r.json())
      .then((d: { accounts: { businessId: string | null; isAdmin: boolean; allowedPanels: string[] | null; role: string | null }[] }) => {
        const account = d.accounts?.find((a) => a.businessId === businessId && !a.isAdmin);
        setAllowedPanels(account?.allowedPanels ?? null);
        setAccountRole(account?.role ?? null);
      });
  }, [previewAsClient, isAdmin, businessId]);

  // The actual "is this session unrestricted" check -- previewAsClient
  // makes an admin session behave exactly like the real client session
  // it's standing in for.
  const actsAsClient = !isAdmin || previewAsClient;

  // A repair-shop client bills through Order Management -> Invoice
  // directly, never a Quote — dropped from the nav entirely (for admin
  // too, not just client sessions) rather than just left reachable via
  // allowedPanels for a business type it doesn't apply to.
  const baseGroups: NavGroup<Tab>[] = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.id === "quotes" && client?.type === "repair") return false;
      // User Settings only makes sense for a real owner login (or an
      // admin previewing one) -- an admin just browsing in, or a staff
      // login, has no self-service reason to see it.
      if (i.id === "settings") return accountRole === "owner";
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  // Admin always sees the full nav (even a hidden-for-clients panel
  // stays reachable so it can be un-hidden) — only a real client
  // session's nav is filtered, by allowedPanels AND by any panel the
  // admin removed inline via RemovableSection. Same filter applies
  // when previewing as the client.
  const visibleGroups: NavGroup<Tab>[] = actsAsClient
    ? baseGroups.map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            // User Settings is an inherent owner capability, not a
            // toggleable panel -- exempt from allowedPanels so an owner
            // whose restriction list predates this feature still gets it.
            (i.id === "settings" || allowedPanels === null || allowedPanels.includes(i.id)) &&
            !hiddenWidgets.includes(`panel.${i.id}`)
        ),
      })).filter((g) => g.items.length > 0)
    : baseGroups;

  // If a restriction kicks in after first paint and the currently-open
  // tab isn't in the allow-list, jump to the first tab that is —
  // otherwise the content pane would keep showing a panel whose own nav
  // entry just disappeared.
  useEffect(() => {
    if (!actsAsClient) return;
    const stillVisible = visibleGroups.some((g) => g.items.some((i) => i.id === tab));
    if (!stillVisible) {
      const firstAllowed = visibleGroups[0]?.items[0]?.id;
      if (firstAllowed) setTab(firstAllowed);
    }
  }, [allowedPanels, hiddenWidgets, actsAsClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always renders "overview" on the server/first paint to avoid a
  // hydration mismatch, then jumps to the OAuth callback's ?tab= param
  // (see api/oauth/[channel]/callback) -- or whatever tab a refresh's
  // own URL still carries -- once mounted.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (requested && TAB_IDS.includes(requested)) {
      setTab(requested);
    }
  }, []);

  // Keeps the URL's ?tab= in sync with clicks so a refresh lands back on
  // the same panel instead of resetting to Overview -- replaceState, not
  // router.push, so switching tabs never grows browser history.
  function selectTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  function exitPreview() {
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.location.href = url.toString();
  }

  useEffect(() => {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => {
        const match = (data.clients as Client[]).find((c) => c.id === businessId);
        setClient(match ?? null);
      });
  }, [businessId]);

  if (isAgent && accountId) {
    return <AgentConsole businessId={businessId} username={username} accountId={accountId} onLogout={logout} />;
  }

  return (
    <DashboardShell
      sidebarLabel={
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--accent)", textTransform: "uppercase" }}>AIVA</div>
          <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {client?.name ?? businessId}
          </div>
        </div>
      }
      groups={visibleGroups}
      activeTab={tab}
      onSelect={selectTab}
      username={previewAsClient ? `${username} (previewing as client)` : username}
      onLogout={logout}
      backHref={isAdmin ? "/dashboard" : undefined}
    >
      <SubscriptionNotification />
      {previewAsClient && isAdmin && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 14px",
            marginBottom: 16,
            borderRadius: 8,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>Previewing exactly what this client's own login sees — nothing here is editable.</span>
          <button onClick={exitPreview} className="plain" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Exit preview
          </button>
        </div>
      )}
      {([
        ["overview", (
          <div key="overview">
            <SubscriptionStatus />
            <ClientOverviewPanel businessId={businessId} active={tab === "overview"} />
          </div>
        )],
        ["tagdashboard", <ClientTagDashboardPanel key="tagdashboard" businessId={businessId} />],
        ["knowledge", <KnowledgeHubPanel key="knowledge" businessId={businessId} active={tab === "knowledge"} />],
        ["products", <ProductCatalogPanel key="products" businessId={businessId} />],
        ["inventory", <InventoryPanel key="inventory" businessId={businessId} />],
        ["notifications", <StatusEmailTemplatesPanel key="notifications" businessId={businessId} />],
        ["orders", <OrdersPanel key="orders" businessId={businessId} />],
        ["delivery", <DeliveryPanel key="delivery" businessId={businessId} />],
        ["repairs", <RepairsPanel key="repairs" businessId={businessId} active={tab === "repairs"} />],
        ["staff", <StaffPanel key="staff" businessId={businessId} />],
        ["contacts", <ContactsPanel key="contacts" businessId={businessId} active={tab === "contacts"} />],
        ["quotes", <QuotesPanel key="quotes" businessId={businessId} active={tab === "quotes"} />],
        ["invoices", <InvoicesPanel key="invoices" businessId={businessId} active={tab === "invoices"} />],
        [
          "reports",
          <ReportsPanel
            key="reports"
            businessId={businessId}
            active={tab === "reports"}
            allowedPanels={allowedPanels}
            hiddenWidgets={hiddenWidgets}
            editable={!actsAsClient}
            onToggleWidget={toggleWidget}
          />,
        ],
        ["allchats", <AllChatsPanel key="allchats" businessId={businessId} active={tab === "allchats"} />],
        ["storage", <StoragePanel key="storage" businessId={businessId} />],
        ["brain", <AiBrainPanel key="brain" businessId={businessId} />],
        ["parameters", <AiParametersPanel key="parameters" businessId={businessId} />],
        ["arena", <TrainingArenaPanel key="arena" businessId={businessId} />],
        ["review", <ChatLearningPanel key="review" businessId={businessId} />],
        ["channels", <ChannelsPanel key="channels" businessId={businessId} />],
        ["settings", <UserSettingsPanel key="settings" active={tab === "settings"} />],
      ] as [Tab, ReactNode][])
        .filter(([id]) => id !== "quotes" || client?.type !== "repair")
        .filter(([id]) => id !== "settings" || accountRole === "owner")
        .map(([id, panel]) => (
        <div key={id} style={{ display: tab === id ? "block" : "none" }}>
          <RemovableSection
            id={`panel.${id}`}
            hidden={hiddenWidgets.includes(`panel.${id}`)}
            editable={!actsAsClient}
            onToggle={toggleWidget}
          >
            {panel}
          </RemovableSection>
        </div>
      ))}
    </DashboardShell>
  );
}
