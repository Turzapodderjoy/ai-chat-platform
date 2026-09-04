"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";
import { SubscriptionStatus } from "./SubscriptionStatus";
import { NavIcon } from "./nav-icons";

interface Appointment {
  id: string;
  status: string;
  appointmentDate: string;
}

interface Invoice {
  balanceDue: number;
}

interface QuickLink {
  tab: string;
  label: string;
  hint: string;
}

const QUICK_LINKS: QuickLink[] = [
  { tab: "orders", label: "Appointments", hint: "Book, track, and manage orders" },
  { tab: "repairs", label: "Repairs", hint: "Device intake and status" },
  { tab: "inventory", label: "Inventory", hint: "Parts, stock, and pricing" },
  { tab: "invoices", label: "Invoices", hint: "Bill customers, record payments" },
  { tab: "contacts", label: "Customer Database", hint: "Every customer, one record" },
  { tab: "reports", label: "Reports", hint: "Revenue, cost, and profit" },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The landing page for a real client login -- a quick "how's the shop
 * doing right now" snapshot, the same subscription info Overview used
 * to show (so Overview itself can be hidden per-account via the
 * existing Client Access allow-list, not a special case here), and
 * one-click links into every panel a client actually opens every day. */
export function ClientHomePanel({
  businessId,
  clientName,
  username,
  onNavigate,
}: {
  businessId: string;
  clientName: string;
  username: string | null;
  onNavigate: (tab: string) => void;
}) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { appointments: Appointment[] }) => setAppointments(d.appointments ?? []));
    fetch(`/api/admin/revenue/invoices?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { invoices: Invoice[] }) => setInvoices(d.invoices ?? []));
  }, [businessId]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todaysAppointments = appointments?.filter((a) => a.appointmentDate.slice(0, 10) === todayKey).length ?? null;
  const activeAppointments = appointments?.filter((a) => a.status !== "completed" && a.status !== "cancelled").length ?? null;
  const outstanding = invoices?.reduce((sum, i) => sum + i.balanceDue, 0) ?? null;

  return (
    <section>
      <div
        style={{
          ...cardStyle,
          background: "linear-gradient(135deg, var(--accent-subtle), var(--surface))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, marginBottom: 4, fontSize: 22 }}>
            {greeting()}{username ? `, ${username}` : ""} 👋
          </h2>
          <p style={{ ...subtleTextStyle, margin: 0 }}>{clientName}</p>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-faint)" }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      <StatCardRow>
        <StatCard label="Today's Appointments" value={todaysAppointments ?? "…"} tone="info" />
        <StatCard label="Active Appointments" value={activeAppointments ?? "…"} tone="accent" />
        <StatCard
          label="Outstanding Balance"
          value={outstanding != null ? `৳${outstanding.toLocaleString()}` : "…"}
          tone={outstanding != null && outstanding > 0 ? "warning" : "success"}
        />
      </StatCardRow>

      <SubscriptionStatus />

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>Quick links</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {QUICK_LINKS.map((link) => (
            <button
              key={link.tab}
              onClick={() => onNavigate(link.tab)}
              className="plain"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 14,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm, 8px)",
                textAlign: "left",
                cursor: "pointer",
                transition: "border-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  borderRadius: "var(--radius-sm, 8px)",
                  background: "var(--accent-subtle)",
                  color: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NavIcon id={link.tab} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{link.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{link.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
