"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

import { StatCard, StatCardRow } from "./StatCard";
import { cardStyle, subtleTextStyle, primaryButtonStyle, badgeStyle, shortId, type BadgeTone } from "./dashboard-styles";
import { MarkdownMessage } from "./MarkdownMessage";

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
  createdAt: string;
  updatedAt: string;
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

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

// Web Audio tone, not a bundled audio file — a two-note chime needs no
// asset and works the same everywhere. ponytail: only fires while this
// tab is open; a staff member with the dashboard fully closed gets
// nothing. Real background delivery needs a service worker + Web Push
// subscription (VAPID keys, a push endpoint per device) — a genuinely
// bigger feature, not added here.
function playPingSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch {
    // Audio can fail (autoplay policy before any user interaction) —
    // the visible toast still lands, sound is a bonus, never the only
    // signal.
  }
}

/** Appointment booking + device-repair tracking for a client with no AI
 * bot (see RepairController) — stats, a status chart, a hand-rolled
 * month calendar (no calendar library in this repo), the appointment
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

  const [toast, setToast] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  // null until the first fetch lands — guards against every existing
  // appointment "pinging" as new the moment the panel mounts.
  const knownIdsRef = useRef<Set<string> | null>(null);

  function notifyNewAppointments(fresh: Appointment[]) {
    playPingSound();
    const label = fresh.length === 1
      ? `New appointment: ${fresh[0]!.customerName}`
      : `${fresh.length} new appointments`;
    setToast(label);
    setTimeout(() => setToast((t) => (t === label ? null : t)), 6000);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("New repair appointment", { body: label });
    }
  }

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/repairs${qs}`)
      .then((r) => r.json())
      .then((d: { appointments: Appointment[] }) => {
        if (knownIdsRef.current) {
          const fresh = d.appointments.filter((a) => !knownIdsRef.current!.has(a.id));
          if (fresh.length > 0) notifyNewAppointments(fresh);
        }
        knownIdsRef.current = new Set(d.appointments.map((a) => a.id));
        setAppointments(d.appointments);
      });
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }

  useEffect(() => {
    if (!active || !selected) return;
    const interval = setInterval(() => fetchMessages(selected.trackingToken), 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.trackingToken, active]);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/admin/repairs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    refresh();
    // The status change is logged as a system message in the same
    // conversation (see RepairController.updateStatus) — refetch so it
    // shows up immediately instead of waiting for the next poll.
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

  const stats = useMemo(() => {
    if (!appointments) return null;
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const active = appointments.filter((a) => a.status !== "completed" && a.status !== "cancelled").length;
    const completedThisWeek = appointments.filter(
      (a) => a.status === "completed" && new Date(a.updatedAt).getTime() >= weekAgo
    ).length;
    return { total: appointments.length, active, completedThisWeek };
  }, [appointments]);

  const statusChartData = useMemo(() => {
    if (!appointments) return [];
    return STATUS_OPTIONS.map((s) => ({
      status: STATUS_LABEL[s],
      count: appointments.filter((a) => a.status === s).length,
    })).filter((d) => d.count > 0);
  }, [appointments]);

  // Hand-rolled month grid — no calendar library in this repo, and a
  // single month of dots-per-day is simple enough not to need one.
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

    return {
      label: base.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      cells,
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
    return list;
  }, [appointments, calendarDay, search]);

  return (
    <section style={{ ...cardStyle, position: "relative" }}>
      {toast && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 5,
            background: "var(--accent)",
            color: "var(--bg)",
            padding: "8px 14px",
            borderRadius: 999,
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: "var(--shadow)",
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>Repairs</h2>
          <p style={subtleTextStyle}>Appointment bookings and device-repair tracking — no AI involved, every conversation goes straight to a human.</p>
        </div>
        {notifPermission === "default" && (
          <button
            onClick={() => Notification.requestPermission().then(setNotifPermission)}
            style={{ fontSize: 11.5, whiteSpace: "nowrap" }}
          >
            Enable notifications
          </button>
        )}
        {notifPermission === "granted" && (
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Notifications on</span>
        )}
      </div>

      {businessId && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setEmailSettingsOpen((o) => !o)} style={{ fontSize: 12 }}>
            {emailSettingsOpen ? "Hide" : "Show"} Email Settings
          </button>
          {emailSettingsOpen && (
            <div style={{ marginTop: 10, padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <p style={subtleTextStyle}>
                Booking-confirmation emails are sent through a shared service but shown as coming from this
                business. The sending domain (the part after @ in From email) must be verified first — ask us to set that up.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 10 }}>
                <input placeholder="From name (e.g. PhoneRepairZoneAZ)" value={fromName} onChange={(e) => setFromName(e.target.value)} style={{ padding: 8 }} />
                <input placeholder="From email (e.g. noreply@yourdomain.com)" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} style={{ padding: 8 }} />
                <input placeholder="Tracking page URL (optional)" value={trackingPageUrl} onChange={(e) => setTrackingPageUrl(e.target.value)} style={{ padding: 8 }} />
              </div>
              <button onClick={saveEmailSettings} disabled={savingEmailSettings || !fromName.trim() || !fromEmail.trim()} style={primaryButtonStyle}>
                {savingEmailSettings ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      )}

      {stats && (
        <StatCardRow>
          <StatCard label="Total Appointments" value={String(stats.total)} tone="info" />
          <StatCard label="Active" value={String(stats.active)} tone="warning" />
          <StatCard label="Completed (7d)" value={String(stats.completedThisWeek)} tone="success" />
        </StatCardRow>
      )}

      {statusChartData.length > 0 && (
        <div style={{ height: 180, marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="status" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
                  border: c.count > 0 ? "1px solid var(--border)" : "1px solid transparent",
                  color: c.day ? "var(--text)" : "transparent",
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
          <input
            style={{ padding: 8, width: "100%", marginBottom: 8 }}
            placeholder="Search by name, phone, device, order ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", maxHeight: 300, overflowY: "auto" }}>
          {!appointments && <p style={{ padding: 10, ...subtleTextStyle }}>Loading…</p>}
          {appointments && visibleAppointments.length === 0 && <p style={{ padding: 10, ...subtleTextStyle }}>No appointments match.</p>}
          {visibleAppointments.map((a) => (
            <div
              key={a.id}
              onClick={() => openAppointment(a)}
              style={{
                padding: 10,
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: selectedId === a.id ? "var(--surface-hover)" : "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 12.5 }}>{a.customerName}</strong>
                <span style={badgeStyle(STATUS_TONE[a.status] ?? "neutral")}>{STATUS_LABEL[a.status] ?? a.status}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                {a.deviceType}{a.deviceModel ? ` — ${a.deviceModel}` : ""} · {new Date(a.appointmentDate).toLocaleDateString()}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>Token: {a.trackingToken}</div>
            </div>
          ))}
          </div>
        </div>
      </div>

      {selected && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{selected.phone}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={selected.status}
                onChange={(e) => updateStatus(selected.id, e.target.value)}
                style={{ padding: 6 }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
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
            {selected.email && <div><span style={{ color: "var(--text-faint)" }}>Email</span><br />{selected.email}</div>}
            <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-faint)" }}>Issue</span><br />{selected.issueDescription}</div>
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
