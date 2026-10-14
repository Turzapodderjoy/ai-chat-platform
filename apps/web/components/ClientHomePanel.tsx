"use client";

import { useEffect, useState, useMemo } from "react";

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

  // Keeps the header clock live instead of freezing at whenever the page
  // happened to load -- doesn't need second-level precision here.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

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
    const bookedToday = today.filter((a) => !a.isWalkIn && !a.source?.startsWith("walk-in"));
    const walkinsToday = today.filter((a) => a.isWalkIn || a.source?.startsWith("walk-in"));
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
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel">
        <div className="panel-head">
          <span className="instrument-label">Shop today</span>
          {now && (
            <span className="data" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(now)}
            </span>
          )}
        </div>
        <div className="panel-body">
          <h2 style={{ margin: 0, fontSize: 19, color: "var(--ink)" }}>
            {now
              ? greetingFor(
                  Number(
                    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now),
                  ),
                )
              : "Welcome"}
            {username ? `, ${username}` : ""}
          </h2>
          <p className="meta" style={{ margin: "4px 0 0" }}>{clientName}</p>
          {now && (
            <div className="data" style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 8 }}>
              {new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(now)}
            </div>
          )}
        </div>
      </div>

      <StatCardRow>
        <StatCard label="Todays appointments" value={stats?.todayCount ?? "…"} tone="info" />
        <StatCard label="Active repairs" value={stats?.activeCount ?? "…"} tone="accent" />
        <StatCard
          label="Urgent"
          value={stats?.urgentCount ?? "…"}
          tone={stats?.urgentCount && stats.urgentCount > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Needs attention"
          value={stats?.needsAttentionCount ?? "…"}
          tone={stats?.needsAttentionCount && stats.needsAttentionCount > 0 ? "warning" : "neutral"}
        />
        <StatCard label="Completed today" value={stats?.completedTodayCount ?? "…"} tone="success" />
      </StatCardRow>

      {stats && (
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <span className="data" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Booked {stats.bookedTodayCount}
          </span>
          <span className="data" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Walk-ins {stats.walkinsTodayCount}
          </span>
          <span className="data" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Completed {stats.completedTodayCount}
          </span>
        </div>
      )}

      {stats && stats.needsAttention.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <span className="instrument-label">Needs attention</span>
            <span className="lamp lamp-warn">{stats.needsAttention.length}</span>
          </div>
          <div className="panel-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats.needsAttention.slice(0, 5).map((a) => (
                <button
                  key={a.id}
                  onClick={() => onNavigate("repairs")}
                  className="plain"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "10px 12px",
                    background: "var(--panel-sunk)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: "var(--r-sm)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
                      {a.customerName}
                    </span>
                    <span className="meta" style={{ display: "block", fontSize: 11.5 }}>
                      {a.deviceType}{a.deviceModel ? ` — ${a.deviceModel}` : ""}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {a.rescheduleRequested && <span className="lamp lamp-warn">Reschedule</span>}
                    {a.cancelRequested && <span className="lamp lamp-err">Cancel</span>}
                    <span className="data" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                      {timeAgo(a.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <SubscriptionStatus businessId={businessId} />

      <div className="panel">
        <div className="panel-head">
          <span className="instrument-label">Quick links</span>
        </div>
        <div className="panel-body">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            {quickLinks(businessType === "repair").map((link) => (
              <button
                key={link.tab}
                onClick={() => onNavigate(link.tab)}
                className="plain"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "var(--panel-sunk)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: "var(--r-sm)",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: "var(--r-sm)",
                    background: "var(--accent-subtle)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <NavIcon id={link.tab} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 13.5, color: "var(--ink)" }}>
                    {link.label}
                  </span>
                  <span className="meta" style={{ display: "block", fontSize: 11.5 }}>{link.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
