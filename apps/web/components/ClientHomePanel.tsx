"use client";

import { useEffect, useState, useMemo } from "react";

import { cardStyle, subtleTextStyle, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";
import { SubscriptionStatus } from "./SubscriptionStatus";
import { NavIcon } from "./nav-icons";

interface Appointment {
  id: string;
  customerName: string;
  phone: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
  status: string;
  priority: string;
  technicianId?: string;
  rescheduleRequested: boolean;
  cancelRequested: boolean;
  trackingToken: string;
  createdAt: string;
  isWalkIn?: boolean;
  source?: string;
}

interface QuickLink {
  tab: string;
  label: string;
  hint: string;
}

function quickLinks(isRepairType: boolean): QuickLink[] {
  if (isRepairType) {
    return [
      { tab: "repairs", label: "Repairs", hint: "View all repairs and appointments" },
      { tab: "orders", label: "Orders", hint: "Book, track, and manage repairs" },
      { tab: "staff", label: "Staff", hint: "Manage technicians" },
      { tab: "inventory", label: "Inventory", hint: "Parts, stock, and pricing" },
      { tab: "invoices", label: "Invoices", hint: "Bill customers, record payments" },
      { tab: "contacts", label: "Customer Database", hint: "Every customer, one record" },
    ];
  }
  return [
    { tab: "orders", label: "Orders", hint: "Every order taken by the AI or by hand" },
    { tab: "inventory", label: "Inventory", hint: "Parts, stock, and pricing" },
    { tab: "invoices", label: "Invoices", hint: "Bill customers, record payments" },
    { tab: "contacts", label: "Customer Database", hint: "Every customer, one record" },
    { tab: "reports", label: "Reports", hint: "Revenue, cost, and profit" },
  ];
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  booked: "info",
  received: "info",
  in_repair: "warn",
  ready: "warn",
  completed: "ok",
  cancelled: "error",
};

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In Repair",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** The landing page for a real client login -- a quick "how's the shop
 * doing right now" snapshot, the same subscription info Overview used
 * to show (so Overview itself can be hidden per-account via the
 * existing Client Access allow-list, not a special case here), and
 * one-click links into every panel a client actually opens every day.
 *
 * The greeting/date is deliberately computed in an effect (not at
 * render time) so it reflects the viewer's own browser clock and
 * timezone rather than whatever the server happened to render first --
 * matters for clients logging in from a different region than the
 * server. */
export function ClientHomePanel({
  businessId,
  businessType,
  clientName,
  username,
  onNavigate,
}: {
  businessId: string;
  businessType: string;
  clientName: string;
  username: string | null;
  onNavigate: (tab: string) => void;
}) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState("America/New_York");

  useEffect(() => {
    setNow(new Date());
    fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { appointments: Appointment[] }) => setAppointments(d.appointments ?? []));
    fetch(`/api/admin/clients/${businessId}`)
      .then((r) => r.json())
      .then((d: { timezone?: string }) => { if (d.timezone) setTimezone(d.timezone); });
  }, [businessId]);

  // "Today" has to be the SAME calendar day on both sides of every
  // comparison below -- comparing the viewer's local browser date against
  // a UTC-stored timestamp string (the previous approach) put appointments
  // in the wrong bucket for any viewer not in UTC, exactly the mismatch the
  // business timezone setting exists to prevent. en-CA formats as YYYY-MM-DD.
  function dateKeyInZone(date: Date | string): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
  }

  const todayKey = now ? dateKeyInZone(now) : null;

  const stats = useMemo(() => {
    if (!appointments || !todayKey) return null;
    // Count by createdAt (when the repair/order was created) so manually
    // created orders and walk-ins show up on the day they're entered,
    // not just on their scheduled appointmentDate.
    const today = appointments.filter((a) => dateKeyInZone(a.createdAt) === todayKey);
    const active = appointments.filter((a) => a.status !== "completed" && a.status !== "cancelled");
    const urgent = active.filter((a) => a.priority === "urgent" || a.priority === "high");
    const needsAttention = appointments.filter((a) => a.rescheduleRequested || a.cancelRequested);
    const completedToday = appointments.filter((a) => a.status === "completed" && dateKeyInZone(a.appointmentDate) === todayKey);
    // Sub-breakdown for today's items
    const bookedToday = today.filter((a) => !a.isWalkIn && a.source !== "walkin");
    const walkinsToday = today.filter((a) => a.isWalkIn || a.source === "walkin");
    return {
      todayCount: today.length,
      activeCount: active.length,
      urgentCount: urgent.length,
      needsAttentionCount: needsAttention.length,
      completedTodayCount: completedToday.length,
      needsAttention,
      bookedTodayCount: bookedToday.length,
      walkinsTodayCount: walkinsToday.length,
    };
  }, [appointments, todayKey, timezone]);

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
            {now ? greetingFor(now.getHours()) : "Welcome"}{username ? `, ${username}` : ""} 👋
          </h2>
          <p style={{ ...subtleTextStyle, margin: 0 }}>{clientName}</p>
        </div>
        {now && (
          <div style={{ fontSize: 13, color: "var(--text-faint)" }}>
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>

      <StatCardRow>
        <StatCard label="Today's Appointments" value={stats?.todayCount ?? "…"} tone="info" />
        <StatCard label="Active Repairs" value={stats?.activeCount ?? "…"} tone="accent" />
        <StatCard label="Urgent" value={stats?.urgentCount ?? "…"} tone={stats?.urgentCount && stats.urgentCount > 0 ? "danger" : "neutral"} />
        <StatCard label="Needs Attention" value={stats?.needsAttentionCount ?? "…"} tone={stats?.needsAttentionCount && stats.needsAttentionCount > 0 ? "warning" : "neutral"} />
        <StatCard label="Completed Today" value={stats?.completedTodayCount ?? "…"} tone="success" />
      </StatCardRow>

      {stats && (
        <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
          <span>📅 Booked: <strong>{stats.bookedTodayCount ?? 0}</strong></span>
          <span>🚶 Walk-ins: <strong>{stats.walkinsTodayCount ?? 0}</strong></span>
          <span>✅ Completed: <strong>{stats.completedTodayCount ?? 0}</strong></span>
        </div>
      )}

      {stats && stats.needsAttention.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>Needs Attention</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.needsAttention.slice(0, 5).map((a) => (
              <div
                key={a.id}
                onClick={() => onNavigate("repairs")}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  background: "var(--surface)",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{a.customerName}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{a.deviceType}{a.deviceModel ? ` — ${a.deviceModel}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {a.rescheduleRequested && <span style={badgeStyle("warn")}>Reschedule</span>}
                  {a.cancelRequested && <span style={badgeStyle("error")}>Cancel</span>}
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{timeAgo(a.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SubscriptionStatus businessId={businessId} />

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>Quick links</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {quickLinks(businessType === "repair").map((link) => (
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
