"use client";

import { cardStyle, subtleTextStyle, primaryButtonStyle } from "./dashboard-styles";
import { SubscriptionStatus } from "./SubscriptionStatus";

interface QuickLink {
  tab: string;
  label: string;
}

const QUICK_LINKS: QuickLink[] = [
  { tab: "orders", label: "Appointments" },
  { tab: "repairs", label: "Repairs" },
  { tab: "inventory", label: "Inventory" },
];

/** The landing page for a real client login -- a greeting, the same
 * subscription info Overview used to show (so Overview itself can be
 * hidden per-account via the existing Client Access allow-list, not a
 * special case here), and one-click links into the panels a client
 * actually opens every day. Deliberately thin: this is a jumping-off
 * point, not a dashboard of its own. */
export function ClientHomePanel({
  clientName,
  username,
  onNavigate,
}: {
  clientName: string;
  username: string | null;
  onNavigate: (tab: string) => void;
}) {
  return (
    <section>
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Welcome back{username ? `, ${username}` : ""}</h2>
        <p style={{ ...subtleTextStyle, margin: 0 }}>{clientName}</p>
      </div>

      <SubscriptionStatus />

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Quick links</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {QUICK_LINKS.map((link) => (
            <button key={link.tab} onClick={() => onNavigate(link.tab)} style={primaryButtonStyle}>
              {link.label} →
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
