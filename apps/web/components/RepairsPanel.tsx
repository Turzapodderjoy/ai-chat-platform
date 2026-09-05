"use client";

import { useEffect, useMemo, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, badgeStyle, shortId, type BadgeTone } from "./dashboard-styles";
import { MarkdownMessage } from "./MarkdownMessage";
import { OrderItemsEditor } from "./OrderManagementPanel";
import { isNewAppointment, dismissNotification, onNotificationsChanged } from "../lib/appointment-notifications";

interface Appointment {
  id: string;
  businessId: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  email?: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
  status: string;
  priority: string;
  technicianId?: string;
  deviceImages: string[];
  rescheduleRequested: boolean;
  rescheduleNewDate?: string;
  cancelRequested: boolean;
  cancelReason?: string;
  serialNumber?: string;
  contactId?: string;
  isWalkIn?: boolean;
  source?: string;
  items: { id: string; repairAppointmentId: string; productId?: string; kind: "part" | "service"; name: string; quantity: number; defaultPrice: number; overridePrice?: number; finalPrice: number }[];
  createdAt: string;
  updatedAt: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "agent";
  content: string;
  createdAt: string;
}

const STATUS_OPTIONS = ["booked", "received", "in_repair", "ready", "completed", "cancelled"] as const;

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In Repair",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  booked: "info",
  received: "info",
  in_repair: "warn",
  ready: "warn",
  completed: "ok",
  cancelled: "error",
};

const KANBAN_STATUSES = ["booked", "received", "in_repair", "ready", "completed"] as const;

const KANBAN_COLORS: Record<string, string> = {
  booked: "#6366f1",
  received: "#0ea5e9",
  in_repair: "#f59e0b",
  ready: "#10b981",
  completed: "#6b7280",
};

const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_TONE: Record<string, BadgeTone> = {
  low: "neutral",
  normal: "info",
  high: "warn",
  urgent: "error",
};

const PRIORITY_BORDER: Record<string, string> = {
  low: "#6b7280",
  normal: "#6366f1",
  high: "#f59e0b",
  urgent: "#ef4444",
};

function dateKey(iso: string): string {
  return iso.slice(0, 10);
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

/** Appointment booking + device-repair tracking for a client with no AI
 * bot (see RepairController) — a hand-rolled month calendar (no
 * calendar library in this repo), the appointment
 * list with a status control, and a compact reply thread with the
 * appointment's own details shown above it. Same optional-businessId
 * convention as AllChatsPanel/ClientOverviewPanel — works unscoped on
 * the mother dashboard too. */
export function RepairsPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [orderOpen, setOrderOpen] = useState(false);
  const [products, setProducts] = useState<{ id: string; name: string; price: string | null; stock: string | null }[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/admin/products?businessId=${encodeURIComponent(businessId)}&limit=200`)
      .then((r) => r.json())
      .then((d: { products: { id: string; name: string; price: string | null; stock: string | null }[] }) => setProducts(d.products));
    fetch(`/api/admin/staff?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { staff: StaffMember[] }) => setStaff(d.staff ?? []));
  }, [businessId]);

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [trackingPageUrl, setTrackingPageUrl] = useState("");
  const [savingEmailSettings, setSavingEmailSettings] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/admin/repairs/email-settings?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { fromName: string | null; fromEmail: string | null; trackingPageUrl: string | null }) => {
        setFromName(d.fromName ?? "");
        setFromEmail(d.fromEmail ?? "");
        setTrackingPageUrl(d.trackingPageUrl ?? "");
      });
  }, [businessId]);

  async function saveEmailSettings() {
    if (!businessId || !fromName.trim() || !fromEmail.trim()) return;
    setSavingEmailSettings(true);
    try {
      await fetch("/api/admin/repairs/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, fromName, fromEmail, trackingPageUrl: trackingPageUrl || undefined }),
      });
    } finally {
      setSavingEmailSettings(false);
    }
  }

  const [, forceNotifRerender] = useState(0);
  useEffect(() => onNotificationsChanged(() => forceNotifRerender((n) => n + 1)), []);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/repairs${qs}`)
      .then((r) => r.json())
      .then((d: { appointments: Appointment[] }) => setAppointments(d.appointments));
  }

  useEffect(() => {
    if (active) refresh();
  }, [businessId, active]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [businessId, active]);

  const selected = appointments?.find((a) => a.id === selectedId) ?? null;

  function fetchMessages(token: string) {
    fetch(`/api/chat/messages?sessionId=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []));
  }

  function openAppointment(a: Appointment) {
    setSelectedId(a.id);
    setMessages(null);
    fetchMessages(a.trackingToken);
    if (businessId) dismissNotification(businessId, a.id);
  }

  useEffect(() => {
    if (!active || !selected) return;
    const interval = setInterval(() => fetchMessages(selected.trackingToken), 5000);
    return () => clearInterval(interval);
  }, [selected?.trackingToken, active]);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/admin/repairs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    refresh();
    if (selected?.id === id) fetchMessages(selected.trackingToken);
  }

  async function updatePriority(id: string, priority: string) {
    await fetch("/api/admin/repairs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, priority }),
    });
    refresh();
  }

  async function assignTechnician(id: string, technicianId: string) {
    await fetch("/api/admin/repairs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, technicianId: technicianId || null }),
    });
    refresh();
  }

  async function rescheduleRepair(id: string, date: string) {
    await fetch("/api/admin/repairs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, appointmentDate: date }),
    });
    refresh();
    if (selected?.id === id) fetchMessages(selected.trackingToken);
  }

  async function handleRescheduleRequest(id: string, action: "approve" | "reject") {
    await fetch("/api/admin/repairs/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    refresh();
    if (selected?.id === id) fetchMessages(selected.trackingToken);
  }

  async function handleCancelRequest(id: string, action: "approve" | "reject") {
    await fetch("/api/admin/repairs/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    refresh();
    if (selected?.id === id) fetchMessages(selected.trackingToken);
  }

  async function deleteAppointment(a: Appointment) {
    const confirmed = window.confirm(
      `Delete the repair appointment for "${a.customerName}" (${a.trackingToken})? This also removes its message thread — cannot be undone.`
    );
    if (!confirmed) return;

    await fetch(`/api/admin/repairs?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    if (selectedId === a.id) setSelectedId(null);
    setAppointments((prev) => prev?.filter((x) => x.id !== a.id) ?? prev);
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/handoffs/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selected.trackingToken, message: reply }),
      });
      if (res.ok) {
        setReply("");
        fetchMessages(selected.trackingToken);
      }
    } finally {
      setSending(false);
    }
  }

  const calendarMonth = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + monthOffset);
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = firstDay.getDay();

    const counts = new Map<string, number>();
    for (const a of appointments ?? []) {
      const key = dateKey(a.appointmentDate);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const cells: { day: number | null; key: string | null; count: number }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ day: null, key: null, count: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, key, count: counts.get(key) ?? 0 });
    }

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return {
      label: base.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      cells,
      todayKey,
    };
  }, [appointments, monthOffset]);

  const visibleAppointments = useMemo(() => {
    if (!appointments) return [];
    let list = appointments;
    if (calendarDay) list = list.filter((a) => dateKey(a.appointmentDate) === calendarDay);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        [a.id, a.trackingToken, a.customerName, a.phone, a.deviceType, a.deviceModel ?? "", a.issueDescription].some(
          (f) => f.toLowerCase().includes(q)
        )
      );
    }
    list = [...list].sort((a, b) => {
      const diff = new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return list;
  }, [appointments, calendarDay, search, sortOrder]);

  const kanbanColumns = useMemo(() => {
    const cols: Record<string, Appointment[]> = {};
    for (const s of KANBAN_STATUSES) cols[s] = [];
    for (const a of visibleAppointments) {
      const col = cols[a.status];
      if (col) col.push(a);
    }
    return cols;
  }, [visibleAppointments]);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  function renderAppointmentCard(a: Appointment) {
    const isNew = !!businessId && isNewAppointment(businessId, a.id);
    const tech = a.technicianId ? staffMap.get(a.technicianId) : null;
    return (
      <div
        key={a.id}
        onClick={() => openAppointment(a)}
        style={{
          padding: "10px 12px",
          marginBottom: 6,
          borderRadius: "var(--radius-sm)",
          borderLeft: `3px solid ${PRIORITY_BORDER[a.priority] ?? "#6366f1"}`,
          borderRight: "1px solid var(--border)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          background: selectedId === a.id ? "var(--surface-hover)" : isNew ? "var(--accent-subtle)" : "var(--surface)",
          transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <strong style={{ fontSize: 12.5 }}>{a.customerName}</strong>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
            {a.isWalkIn && <span style={{ ...badgeStyle("warn"), background: "#f97316", color: "#fff", fontWeight: 600 }}>🚶 Walk-in</span>}
            {isNew && <span style={badgeStyle("info")}>New</span>}
            {a.priority && a.priority !== "normal" && (
              <span style={badgeStyle(PRIORITY_TONE[a.priority] ?? "neutral")}>{PRIORITY_LABEL[a.priority]}</span>
            )}
            {a.rescheduleRequested && <span style={badgeStyle("warn")}>Reschedule</span>}
            {a.cancelRequested && <span style={badgeStyle("error")}>Cancel</span>}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
          {a.deviceType}{a.deviceModel ? ` — ${a.deviceModel}` : ""} · {timeAgo(a.appointmentDate)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
            {tech ? `🔧 ${tech.name}` : a.trackingToken}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {a.status !== "completed" && a.status !== "cancelled" && (
              <>
                {a.status === "booked" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "received"); }}
                    style={{ fontSize: 10, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    Receive
                  </button>
                )}
                {a.status === "received" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "in_repair"); }}
                    style={{ fontSize: 10, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    Start
                  </button>
                )}
                {a.status === "in_repair" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "ready"); }}
                    style={{ fontSize: 10, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    Ready
                  </button>
                )}
                {a.status === "ready" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "completed"); }}
                    style={{ fontSize: 10, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    Complete
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section style={{ ...cardStyle, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>Repairs</h2>
          <p style={subtleTextStyle}>Appointment bookings and device-repair tracking. New bookings show up in the notification bell above.</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => setViewMode("kanban")}
            style={{ padding: "5px 10px", fontSize: 11, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: viewMode === "kanban" ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", color: "var(--text)" }}
          >
            Board
          </button>
          <button
            onClick={() => setViewMode("list")}
            style={{ padding: "5px 10px", fontSize: 11, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: viewMode === "list" ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", color: "var(--text)" }}
          >
            List
          </button>
          {businessId && (
            <button
              onClick={() => setEmailSettingsOpen((o) => !o)}
              style={{ padding: "5px 10px", fontSize: 11, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer", color: "var(--text-muted)" }}
              title="Email Settings"
            >
              ⚙
            </button>
          )}
        </div>
      </div>

      {emailSettingsOpen && businessId && (
        <div style={{ marginBottom: 16, padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)" }}>
          <p style={{ ...subtleTextStyle, marginBottom: 8 }}>
            Booking-confirmation emails are sent through a shared service but shown as coming from this business.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 10 }}>
            <input placeholder="From name (e.g. PhoneRepairZoneAZ)" value={fromName} onChange={(e) => setFromName(e.target.value)} style={{ padding: 8, fontSize: 12 }} />
            <input placeholder="From email (e.g. noreply@yourdomain.com)" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} style={{ padding: 8, fontSize: 12 }} />
            <input placeholder="Tracking page URL (optional)" value={trackingPageUrl} onChange={(e) => setTrackingPageUrl(e.target.value)} style={{ padding: 8, fontSize: 12 }} />
          </div>
          <button onClick={saveEmailSettings} disabled={savingEmailSettings || !fromName.trim() || !fromEmail.trim()} style={{ ...primaryButtonStyle, fontSize: 12 }}>
            {savingEmailSettings ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          style={{ padding: 8, flex: 1, fontSize: 12 }}
          placeholder="Search by name, phone, device, order ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")} style={{ padding: 8, fontSize: 12 }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {!viewMode.includes("kanban") && (
        <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ width: 280, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <button onClick={() => setMonthOffset((m) => m - 1)}>‹</button>
              <strong style={{ fontSize: 13 }}>{calendarMonth.label}</strong>
              <button onClick={() => setMonthOffset((m) => m + 1)}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, fontSize: 10.5 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} style={{ textAlign: "center", color: "var(--text-faint)", fontWeight: 600 }}>{d}</div>
              ))}
              {calendarMonth.cells.map((c, i) => (
                <div
                  key={i}
                  onClick={() => c.key && setCalendarDay(calendarDay === c.key ? null : c.key)}
                  style={{
                    aspectRatio: "1",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    cursor: c.day ? "pointer" : "default",
                    background: c.key === calendarDay ? "var(--accent-soft)" : "transparent",
                    border: c.key === calendarMonth.todayKey ? "1px solid var(--accent)" : c.count > 0 ? "1px solid var(--border)" : "1px solid transparent",
                    color: c.day ? "var(--text)" : "transparent",
                    fontWeight: c.key === calendarMonth.todayKey ? 700 : 400,
                  }}
                >
                  <span>{c.day ?? ""}</span>
                  {c.count > 0 && <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--accent)", marginTop: 1 }} />}
                </div>
              ))}
            </div>
            {calendarDay && (
              <button onClick={() => setCalendarDay(null)} style={{ marginTop: 8, fontSize: 11, width: "100%" }}>
                Clear date filter ({calendarDay})
              </button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", maxHeight: 400, overflowY: "auto", padding: 6 }}>
              {!appointments && <p style={{ padding: 10, ...subtleTextStyle }}>Loading…</p>}
              {appointments && visibleAppointments.length === 0 && <p style={{ padding: 10, ...subtleTextStyle }}>No appointments match.</p>}
              {visibleAppointments.map((a) => renderAppointmentCard(a))}
            </div>
          </div>
        </div>
      )}

      {viewMode === "kanban" && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
          {KANBAN_STATUSES.map((s) => (
            <div key={s} style={{ minWidth: 220, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: `2px solid ${KANBAN_COLORS[s]}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: KANBAN_COLORS[s] }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{STATUS_LABEL[s]}</span>
                <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto" }}>{kanbanColumns[s]?.length ?? 0}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 500, overflowY: "auto" }}>
                {(kanbanColumns[s]?.length ?? 0) === 0 && (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "var(--text-faint)", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)" }}>
                    No appointments
                  </div>
                )}
                {(kanbanColumns[s] ?? []).map((a) => renderAppointmentCard(a))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{selected.phone}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={selected.status}
                onChange={(e) => updateStatus(selected.id, e.target.value)}
                style={{ padding: 6, fontSize: 12 }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <select
                value={selected.priority || "normal"}
                onChange={(e) => updatePriority(selected.id, e.target.value)}
                style={{ padding: 6, fontSize: 12 }}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
              <select
                value={selected.technicianId || ""}
                onChange={(e) => assignTechnician(selected.id, e.target.value)}
                style={{ padding: 6, fontSize: 12 }}
              >
                <option value="">Unassigned</option>
                {staff.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={selected.appointmentDate ? new Date(selected.appointmentDate).toISOString().slice(0, 16) : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    rescheduleRepair(selected.id, new Date(e.target.value).toISOString());
                  }
                }}
                style={{ padding: 5, fontSize: 12 }}
                title="Reschedule appointment"
              />
              {selected.status !== "cancelled" && selected.status !== "completed" && (
                <button
                  onClick={() => {
                    if (window.confirm(`Cancel repair for "${selected.customerName}"?`)) {
                      updateStatus(selected.id, "cancelled");
                    }
                  }}
                  style={{ padding: "6px 10px", fontSize: 12, color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer" }}
                >
                  Cancel
                </button>
              )}
              <button onClick={() => setOrderOpen((o) => !o)} style={{ padding: "6px 10px", fontSize: 12 }}>
                {orderOpen ? "Close Order" : "Manage Order"}
              </button>
              <button onClick={() => deleteAppointment(selected)} style={{ padding: "6px 10px", fontSize: 12 }}>
                Delete
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, fontSize: 12.5, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <div><span style={{ color: "var(--text-faint)" }}>Order ID</span><br />{shortId(selected.id)}</div>
            <div><span style={{ color: "var(--text-faint)" }}>Device</span><br />{selected.deviceType}{selected.deviceModel ? ` — ${selected.deviceModel}` : ""}</div>
            <div><span style={{ color: "var(--text-faint)" }}>Appointment</span><br />{new Date(selected.appointmentDate).toLocaleString()}</div>
            <div><span style={{ color: "var(--text-faint)" }}>Tracking Token</span><br />{selected.trackingToken}</div>
            {selected.isWalkIn && (
              <div><span style={{ color: "var(--text-faint)" }}>Source</span><br />
                <span style={{ ...badgeStyle("warn"), background: "#f97316", color: "#fff", fontWeight: 600 }}>🚶 Walk-in</span>
              </div>
            )}
            {selected.source && selected.source !== "walk-in" && (
              <div><span style={{ color: "var(--text-faint)" }}>Source</span><br />
                <span style={badgeStyle("neutral")}>{selected.source}</span>
              </div>
            )}
            <div><span style={{ color: "var(--text-faint)" }}>Priority</span><br />
              <span style={badgeStyle(PRIORITY_TONE[selected.priority] ?? "neutral")}>{PRIORITY_LABEL[selected.priority] ?? selected.priority}</span>
            </div>
            <div><span style={{ color: "var(--text-faint)" }}>Technician</span><br />
              {selected.technicianId ? (staffMap.get(selected.technicianId)?.name ?? "Unknown") : <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>Unassigned</span>}
            </div>
            {selected.email && <div><span style={{ color: "var(--text-faint)" }}>Email</span><br />{selected.email}</div>}
            {selected.rescheduleRequested && (
              <div style={{ gridColumn: "1 / -1", padding: "10px 12px", background: "var(--warning-subtle)", borderRadius: "var(--radius-sm)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <strong>Reschedule requested</strong> — New date: {selected.rescheduleNewDate ? new Date(selected.rescheduleNewDate).toLocaleString() : "Not specified"}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleRescheduleRequest(selected.id, "approve")} className="primary" style={{ fontSize: 11, padding: "4px 10px" }}>Approve</button>
                  <button onClick={() => handleRescheduleRequest(selected.id, "reject")} style={{ fontSize: 11, padding: "4px 10px", color: "var(--danger)" }}>Reject</button>
                </div>
              </div>
            )}
            {selected.cancelRequested && (
              <div style={{ gridColumn: "1 / -1", padding: "10px 12px", background: "var(--danger-subtle)", borderRadius: "var(--radius-sm)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <strong>Cancellation requested</strong>{selected.cancelReason ? ` — Reason: ${selected.cancelReason}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleCancelRequest(selected.id, "approve")} className="primary" style={{ fontSize: 11, padding: "4px 10px", background: "var(--danger)" }}>Approve</button>
                  <button onClick={() => handleCancelRequest(selected.id, "reject")} style={{ fontSize: 11, padding: "4px 10px" }}>Reject</button>
                </div>
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-faint)" }}>Issue</span><br />{selected.issueDescription}</div>
          </div>

          {orderOpen && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>
                Order Management {selected.serialNumber ? `— ${selected.serialNumber}` : "(no serial number yet — save at least one item to assign one)"}
              </div>
              <OrderItemsEditor order={selected} products={products} onChanged={refresh} />
            </div>
          )}

          {/* Device Photos */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Device Photos</span>
              <label style={{ fontSize: 11, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)" }}>
                + Upload
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || !selected) return;
                    const urls: string[] = [...(selected.deviceImages || [])];
                    for (const file of Array.from(files)) {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/chat/upload-image", { method: "POST", body: fd });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.url) urls.push(data.url);
                      }
                    }
                    await fetch("/api/admin/repairs/photos", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: selected.id, images: urls }),
                    });
                    refresh();
                  }}
                />
              </label>
            </div>
            {selected.deviceImages && selected.deviceImages.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selected.deviceImages.map((url, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Device photo ${i + 1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                    <button
                      onClick={async () => {
                        if (!selected) return;
                        const newImages = selected.deviceImages.filter((_, idx) => idx !== i);
                        await fetch("/api/admin/repairs/photos", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: selected.id, images: newImages }),
                        });
                        refresh();
                      }}
                      style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "var(--danger)", color: "white", border: "none", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No photos uploaded yet</div>
            )}
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", minHeight: 160, maxHeight: 300, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
            {!messages && <p style={subtleTextStyle}>Loading…</p>}
            {messages?.length === 0 && <p style={subtleTextStyle}>No messages yet from the customer.</p>}
            {messages?.map((m) => {
              if (m.role === "system") {
                return (
                  <div key={m.id} style={{ alignSelf: "center", fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
                    {m.content} · {new Date(m.createdAt).toLocaleString()}
                  </div>
                );
              }
              const isCustomer = m.role === "user";
              return (
                <div key={m.id} style={{ maxWidth: "80%", alignSelf: isCustomer ? "flex-start" : "flex-end" }}>
                  <div
                    style={{
                      background: isCustomer ? "var(--surface)" : "var(--accent)",
                      color: isCustomer ? "var(--text)" : "var(--bg)",
                      border: isCustomer ? "1px solid var(--border)" : "none",
                      borderRadius: isCustomer ? "12px 12px 12px 3px" : "12px 12px 3px 12px",
                      padding: "8px 11px",
                      fontSize: 13,
                    }}
                  >
                    {isCustomer ? m.content : <MarkdownMessage text={m.content} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ flex: 1, padding: 8 }}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
              placeholder="Reply to the customer…"
            />
            <button onClick={sendReply} disabled={sending} style={primaryButtonStyle}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
