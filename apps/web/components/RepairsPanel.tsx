"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { MarkdownMessage } from "./MarkdownMessage";
import { OrderItemsEditor } from "./OrderManagementPanel";
import { isNewAppointment, dismissNotification, onNotificationsChanged } from "../lib/appointment-notifications";
import { showConfirm } from "../lib/app-dialog";
import { AuditHistoryButton } from "./AuditHistoryButton";
import { WalkInDialog } from "./WalkInDialog";
import { RepairReceiptPopup } from "./RepairReceiptPopup";

// ponytail: feature-gate so the print popup can be hidden / restored for a
// client contract without touching the feature code. Flip to true to re-enable.
const RECEIPT_POPUP_ENABLED = true;

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
  totalOverride?: number;
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
  booked: "New",
  received: "Received",
  in_repair: "In repair",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Repair status is a bay lamp, never a badge or a coloured pill.
const STATUS_LAMP: Record<string, string> = {
  booked: "lamp-info",
  received: "lamp-idle",
  in_repair: "lamp-warn",
  ready: "lamp-ok",
  completed: "lamp-ok",
  cancelled: "lamp-err",
};

const KANBAN_STATUSES = ["booked", "received", "in_repair", "ready", "completed"] as const;

const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_LAMP: Record<string, string> = {
  low: "lamp-idle",
  normal: "lamp-idle",
  high: "lamp-warn",
  urgent: "lamp-err",
};

// The card's left accent bar carries priority, so urgency is legible at a
// glance across the whole board. Semantic only — neutral tones for the
// default priorities, never a colour for its own sake.
const PRIORITY_EDGE: Record<string, string> = {
  low: "var(--line)",
  normal: "var(--line)",
  high: "var(--warning)",
  urgent: "var(--danger)",
};

// ——— shared layout constants ———————————————————————————————————————

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  background: "var(--canvas)",
  overflow: "hidden",
  position: "relative",
};

const headRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const headTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  minWidth: 0,
};

const cardStyle: CSSProperties = {
  padding: "12px 14px",
  marginBottom: 8,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  cursor: "pointer",
  background: "var(--panel)",
  transition: "background var(--dur-state) ease, border-color var(--dur-state) ease",
};

const cardSelectedStyle: CSSProperties = {
  ...cardStyle,
  background: "var(--accent-subtle)",
  borderColor: "var(--accent)",
  boxShadow: "inset 2px 0 0 var(--accent)",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 8,
  flexWrap: "wrap",
};

// Source markers (walk-in, website, counter) are facts, not statuses —
// quiet ink on a sunk well rather than three competing colours.
const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "1px 7px",
  borderRadius: "var(--r-xs)",
  background: "var(--panel-sunk)",
  border: "1px solid var(--line-soft)",
  color: "var(--ink-2)",
  fontSize: 11,
  fontWeight: 500,
};

const cardTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13.5,
  color: "var(--ink)",
  marginBottom: 2,
};

const cardIssueStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--ink-3)",
  marginBottom: 10,
  lineHeight: 1.45,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const cardFootStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const cardActionsStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid var(--line-soft)",
};

const cardActionStyle: CSSProperties = { flex: 1 };

const calendarGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 3,
};

const dayCellStyle: CSSProperties = {
  aspectRatio: "1",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--r-xs)",
  border: "1px solid transparent",
  color: "var(--ink)",
};

const boardScrollStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  overflowX: "auto",
  paddingBottom: 8,
  flex: 1,
  minHeight: 0,
};

const columnStyle: CSSProperties = {
  minWidth: 280,
  flex: 1,
  display: "flex",
  flexDirection: "column",
};

const columnHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: "1px solid var(--line)",
};

const columnBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflowY: "auto",
  background: "var(--panel-sunk)",
  borderRadius: "var(--r-sm)",
  padding: 6,
  border: "1px solid var(--line-soft)",
  minHeight: 100,
};

// Segmented control — the selected segment is unmistakable: cobalt fill,
// white label, hairline lifted off its neighbours.
const segmentGroupStyle: CSSProperties = {
  display: "inline-flex",
  padding: 2,
  gap: 2,
  background: "var(--panel-sunk)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
};

const segmentOnStyle: CSSProperties = {
  background: "var(--accent)",
  borderColor: "var(--accent)",
  color: "var(--accent-ink)",
  fontWeight: 600,
};

const segmentOffStyle: CSSProperties = {
  background: "transparent",
  borderColor: "transparent",
  color: "var(--ink-2)",
};

const iconButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  padding: 0,
  flexShrink: 0,
};

const drawerStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "60%",
  minWidth: 500,
  maxWidth: 800,
  zIndex: 100,
  background: "var(--canvas)",
  borderLeft: "1px solid var(--line)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "var(--shadow-pop)",
};

const drawerBodyStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: 16 };

const specGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
  gap: 1,
  marginBottom: 18,
  background: "var(--line-soft)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
  overflow: "hidden",
};

const specCellStyle: CSSProperties = {
  padding: "9px 12px",
  background: "var(--panel)",
  minWidth: 0,
};

const threadStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
  overflow: "hidden",
};

const threadScrollStyle: CSSProperties = {
  minHeight: 200,
  maxHeight: 400,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "var(--canvas)",
};

const bubbleShellStyle: CSSProperties = { maxWidth: "80%", display: "flex", flexDirection: "column", gap: 4 };

// Customer = sunk well. Staff = raised panel with a cobalt edge. AI/agent =
// the amber machine block. Three authors, three signatures.
const bubbleCustomerStyle: CSSProperties = {
  background: "var(--panel-sunk)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
  padding: "8px 11px",
  fontSize: 13,
  color: "var(--ink)",
};

const bubbleStaffStyle: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--accent-line)",
  borderRadius: "var(--r-sm)",
  padding: "8px 11px",
  fontSize: 13,
  color: "var(--ink)",
};

const bubbleMachineStyle: CSSProperties = {
  ...bubbleStaffStyle,
  background: "var(--machine-subtle)",
  borderColor: "var(--machine-line)",
  color: "var(--ink)",
};

const bubbleMetaStyle: CSSProperties = { fontSize: 11, color: "var(--ink-4)" };

const toastStyle: CSSProperties = {
  position: "fixed",
  bottom: 24,
  right: 24,
  zIndex: 200,
  width: 320,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  boxShadow: "var(--shadow-pop)",
  padding: 16,
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
export function RepairsPanel({ businessId, active = true, accountRole }: { businessId?: string; active?: boolean; accountRole?: string | null }) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  // Board view defaults to a 3-day window (yesterday/today/tomorrow) so
  // the board doesn't fill up with every appointment ever booked --
  // "3day" is the default, switchable to "all" to see everything.
  const [boardDateFilter, setBoardDateFilter] = useState<"3day" | "all">("3day");
  const [orderOpen, setOrderOpen] = useState(false);
  const [completedPromptId, setCompletedPromptId] = useState<string | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; price: string | null; stock: string | null }[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [timezone, setTimezone] = useState<string | undefined>(undefined);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [receiptPopupId, setReceiptPopupId] = useState<string | null>(null);

  const canDelete = accountRole === "owner" || accountRole === "admin";

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/admin/clients/${businessId}`)
      .then((r) => r.json())
      .then((d: { timezone?: string; name?: string }) => { if (d.timezone) setTimezone(d.timezone); if (d.name) setBusinessName(d.name); });
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => onNotificationsChanged(() => forceNotifRerender((n) => n + 1)), []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [businessId, active]);

  const selected = appointments?.find((a) => a.id === selectedId) ?? null;

  // Who created a staff-entered appointment: the "booked" audit entry's
  // actor. A website-form booking has no such entry (its own source says
  // "website"), so this stays null for those.
  const [bookedBy, setBookedBy] = useState<string | null>(null);
  useEffect(() => {
    setBookedBy(null);
    if (!selected?.id) return;
    let cancelled = false;
    fetch(`/api/admin/audit-log?entityType=repair&entityId=${encodeURIComponent(selected.id)}`)
      .then((r) => r.json())
      .then((d: { entries?: { action: string; actorUsername: string }[] }) => {
        if (!cancelled) setBookedBy(d.entries?.find((e) => e.action === "booked")?.actorUsername ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected?.id]);

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  // Click outside to close
  useEffect(() => {
    if (!selectedId) return;
    function handleClickOutside(e: MouseEvent) {
      const panel = document.getElementById("repair-detail-panel");
      if (panel && !panel.contains(e.target as Node)) {
        setSelectedId(null);
      }
    }
    // Delay adding listener to avoid immediate trigger
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedId]);

  async function updateStatus(id: string, status: string) {
    // "Mark Received" opens the print/sticker popup first; the status only
    // changes once the staff confirms (Print / No need Print) or cancels.
    // Flag flips off/on to temporarily remove the popup from production.
    if (status === "received" && RECEIPT_POPUP_ENABLED) {
      setReceiptPopupId(id);
      return;
    }
    await updateStatusNow(id, status);
  }

  async function updateStatusNow(id: string, status: string, details?: Record<string, unknown>) {
    await fetch("/api/admin/repairs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details ? { id, status, details } : { id, status }),
    });
    refresh();
    if (selected?.id === id) fetchMessages(selected.trackingToken);
    // Floats an in-app "create an order?" prompt right here in the
    // Repairs panel instead of a native browser dialog -- a completed
    // repair is exactly the moment staff need to bill it.
    if (status === "completed") setCompletedPromptId(id);
  }

  const receiptAppointment = receiptPopupId
    ? (appointments?.find((a) => a.id === receiptPopupId) ?? null)
    : null;

  function confirmReceived(print: boolean, edits: { customerName: string; phone: string; email: string; deviceType: string; deviceModel: string; issueDescription: string; totalOverride: number | null }) {
    const appt = receiptAppointment;
    if (!appt) return;
    // Live-edited receipt fields ride along with the status change so they
    // override the repair's stored details.
    const details = {
      customerName: edits.customerName,
      phone: edits.phone,
      email: edits.email,
      deviceType: edits.deviceType,
      deviceModel: edits.deviceModel,
      issueDescription: edits.issueDescription,
      totalOverride: edits.totalOverride,
    };
    if (print) window.print();
    setReceiptPopupId(null);
    updateStatusNow(appt.id, "received", details);
  }

  function openOrderForCompleted() {
    if (!completedPromptId) return;
    setSelectedId(completedPromptId);
    setOrderOpen(true);
    setCompletedPromptId(null);
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
    const confirmed = await showConfirm(
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
    if (viewMode === "kanban" && boardDateFilter === "3day") {
      const today = new Date();
      const keys = new Set([-1, 0, 1].map((offset) => {
        const d = new Date(today);
        d.setDate(d.getDate() + offset);
        return dateKey(d.toISOString());
      }));
      list = list.filter((a) => keys.has(dateKey(a.appointmentDate)));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      // Every word in the query has to match SOMEWHERE across the fields
      // (not all in the same field) -- "iphone crack" now finds a
      // deviceType "iPhone" whose issueDescription is "Screen cracked",
      // which a single-substring match against the whole query never did.
      const words = q.split(/\s+/).filter(Boolean);
      list = list.filter((a) => {
        const fields = [a.id, a.trackingToken, a.customerName, a.phone, a.deviceType, a.deviceModel ?? "", a.issueDescription, a.serialNumber ?? ""].map((f) =>
          f.toLowerCase()
        );
        return words.every((w) => fields.some((f) => f.includes(w)));
      });
    }
    list = [...list].sort((a, b) => {
      const diff = new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return list;
  }, [appointments, calendarDay, search, sortOrder, viewMode, boardDateFilter]);

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
    const isSelected = selectedId === a.id;
    const priorityEdge = isSelected ? "var(--accent)" : PRIORITY_EDGE[a.priority] ?? "var(--line)";
    const sourceLabel =
      a.isWalkIn && a.source?.startsWith("walk-in (")
        ? `Walk-in (${a.source.slice(9, -1)})`
        : a.source === "website"
          ? "Website"
          : a.source && !a.source.startsWith("walk-in")
            ? a.source
            : a.isWalkIn
              ? "Walk-in"
              : null;
    return (
      <div
        key={a.id}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => openAppointment(a)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAppointment(a); } }}
        style={{ ...(isSelected ? cardSelectedStyle : cardStyle), boxShadow: isSelected ? "inset 2px 0 0 var(--accent)" : `inset 2px 0 0 ${priorityEdge}` }}
      >
        {/* Status lamp + provenance */}
        <div style={chipRowStyle}>
          <span className={`lamp ${STATUS_LAMP[a.status] ?? "lamp-idle"}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
          {isNew && <span className="lamp lamp-info">New</span>}
          {a.rescheduleRequested && <span className="lamp lamp-warn">Reschedule requested</span>}
          {a.cancelRequested && <span className="lamp lamp-err">Cancel requested</span>}
          {a.priority && a.priority !== "normal" && (
            <span className={`lamp ${PRIORITY_LAMP[a.priority] ?? "lamp-idle"}`}>{PRIORITY_LABEL[a.priority]} priority</span>
          )}
        </div>

        {/* Customer + device */}
        <div style={cardTitleStyle}>{a.customerName}</div>
        <div className="meta" style={{ marginBottom: 6 }}>
          {a.deviceType}
          {a.deviceModel ? ` ${a.deviceModel}` : ""}
        </div>
        {a.serialNumber && (
          <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6 }}>
            {a.serialNumber}
          </div>
        )}
        {sourceLabel && (
          <div style={{ marginBottom: 6 }}>
            <span style={chipStyle}>{sourceLabel}</span>
          </div>
        )}

        {/* Issue preview */}
        <div style={cardIssueStyle}>{a.issueDescription}</div>

        {/* Footer: technician + age */}
        <div style={cardFootStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
            {tech ? <span className="meta">{tech.name}</span> : <span className="meta">Unassigned</span>}
          </div>
          <span className="data meta" title={a.appointmentDate}>{timeAgo(a.appointmentDate)}</span>
        </div>

        {/* Quick actions — one button per column, labelled for what happens */}
        {a.status !== "completed" && a.status !== "cancelled" && (
          <div style={cardActionsStyle}>
            {a.status === "booked" && (
              <button className="primary sm" style={cardActionStyle} onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "received"); }}>
                Mark received
              </button>
            )}
            {a.status === "received" && (
              <button className="primary sm" style={cardActionStyle} onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "in_repair"); }}>
                Start repair
              </button>
            )}
            {a.status === "in_repair" && (
              <button className="primary sm" style={cardActionStyle} onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "ready"); }}>
                Mark ready
              </button>
            )}
            {a.status === "ready" && (
              <button className="primary sm" style={cardActionStyle} onClick={(e) => { e.stopPropagation(); updateStatus(a.id, "completed"); }}>
                Complete repair
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section style={listStyle}>
      {/* Panel head — instrument label plus the board controls */}
      <div className="panel-head" style={{ flexWrap: "wrap", rowGap: 8 }}>
        <div style={headTitleStyle}>
          <span className="instrument-label">Repairs</span>
          <span className="meta">
            {appointments === null ? "Loading work orders" : `${visibleAppointments.length} of ${appointments.length} shown`}
          </span>
        </div>
        <div style={headRowStyle}>
          {businessId && (
            <button className="sm" onClick={() => setWalkInOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="5.4" r="1.8" />
                <path d="M9 20.2 10.6 15l2.6 2.6M9 20.2h4.3M14 15.2 15.2 13l-1-3.3" />
                <path d="M6.4 12.2 4 15.6l3.4 1.4M17.6 12.2 20 15.6l-3.4 1.4" />
              </svg>
              Walk-in
            </button>
          )}
          <div style={segmentGroupStyle} role="group" aria-label="Repairs view">
            <button
              className="sm"
              onClick={() => setViewMode("kanban")}
              aria-pressed={viewMode === "kanban"}
              style={viewMode === "kanban" ? segmentOnStyle : segmentOffStyle}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="6" height="10" x="3" y="2" rx="1" /><rect width="6" height="10" x="15" y="2" rx="1" /><rect width="6" height="10" x="9" y="8" rx="1" />
              </svg>
              Board
            </button>
            <button
              className="sm"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              style={viewMode === "list" ? segmentOnStyle : segmentOffStyle}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" />
                <line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" />
              </svg>
              List
            </button>
          </div>
          {businessId && (
            <button
              className="ghost sm"
              onClick={() => setEmailSettingsOpen((o) => !o)}
              aria-expanded={emailSettingsOpen}
              aria-label="Booking email settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Email settings */}
      {emailSettingsOpen && businessId && (
        <div className="panel-sunk" style={{ margin: "12px 16px 0", padding: 14 }}>
          <p className="meta" style={{ margin: "0 0 12px" }}>
            Booking confirmations go out through a shared service and arrive in your business name.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label className="field-label" htmlFor="repair-from-name">From name</label>
              <input id="repair-from-name" placeholder="PhoneRepairZoneAZ" value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="repair-from-email">From email</label>
              <input id="repair-from-email" type="email" placeholder="noreply@yourdomain.com" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="repair-tracking-url">Tracking page URL</label>
              <input id="repair-tracking-url" type="url" placeholder="Optional" value={trackingPageUrl} onChange={(e) => setTrackingPageUrl(e.target.value)} />
            </div>
          </div>
          <button className="primary sm" onClick={saveEmailSettings} disabled={savingEmailSettings || !fromName.trim() || !fromEmail.trim()}>
            {savingEmailSettings ? "Saving" : "Save email settings"}
          </button>
        </div>
      )}

      {/* Toolbar — search, sort, and the board date window */}
      <div className="toolbar" style={{ margin: 0, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0 }}>
          <input
            type="search"
            name="aiva-search-repairs"
            autoComplete="off"
            aria-label="Search work orders"
            // minWidth: 0 overrides the flex item default of min-width: auto
            // (an input's own min-content floor) -- without it, a sibling
            // with no flex-basis of its own (the sort <select>) can end up
            // claiming nearly all the row's width and squeezing this down
            // to ~18px, confirmed live: the search box was rendering as a
            // near-invisible sliver next to a huge dropdown.
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Name, phone, device, issue, serial or order ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Sort work orders"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
            style={{ flexShrink: 0, width: "auto" }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        {viewMode === "kanban" && (
          <div style={segmentGroupStyle} role="group" aria-label="Board date window">
            <button
              className="sm"
              onClick={() => setBoardDateFilter("3day")}
              aria-pressed={boardDateFilter === "3day"}
              style={boardDateFilter === "3day" ? segmentOnStyle : segmentOffStyle}
            >
              Yesterday to tomorrow
            </button>
            <button
              className="sm"
              onClick={() => setBoardDateFilter("all")}
              aria-pressed={boardDateFilter === "all"}
              style={boardDateFilter === "all" ? segmentOnStyle : segmentOffStyle}
            >
              All dates
            </button>
          </div>
        )}
      </div>

      {/* Board body */}
      <div style={{ padding: "0 16px 16px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {!viewMode.includes("kanban") && (
        <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0, flexWrap: "wrap" }}>
          <div style={{ width: isMobile ? "100%" : 280, flexShrink: isMobile ? 1 : 0, minWidth: isMobile ? 0 : 280 }}>
            <div className="panel-head" style={{ minHeight: 36, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)" }}>
              <button className="ghost sm" onClick={() => setMonthOffset((m) => m - 1)} aria-label="Previous month">&lsaquo;</button>
              <span className="instrument-label" style={{ margin: 0 }}>{calendarMonth.label}</span>
              <button className="ghost sm" onClick={() => setMonthOffset((m) => m + 1)} aria-label="Next month">&rsaquo;</button>
            </div>
            <div style={{ ...calendarGridStyle, marginTop: 8 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="data meta" style={{ textAlign: "center" }}>{d}</div>
              ))}
              {calendarMonth.cells.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!c.day}
                  onClick={() => c.key && setCalendarDay(calendarDay === c.key ? null : c.key)}
                  aria-pressed={c.key === calendarDay}
                  aria-label={`${c.day ?? ""}${c.count ? `, ${c.count} booked` : ""}`}
                  style={{
                    ...dayCellStyle,
                    cursor: c.day ? "pointer" : "default",
                    background: c.key === calendarDay ? "var(--accent-subtle)" : c.count > 0 ? "var(--panel-sunk)" : "transparent",
                    borderColor: c.key === calendarDay ? "var(--accent)" : c.key === calendarMonth.todayKey ? "var(--line-strong)" : "transparent",
                    color: c.day ? "var(--ink)" : "transparent",
                    fontWeight: c.key === calendarMonth.todayKey ? 700 : 400,
                  }}
                >
                  <span className="data" style={{ fontSize: 11.5 }}>{c.day ?? ""}</span>
                  {c.count > 0 && <span className="data" style={{ fontSize: 9.5, color: "var(--ink-3)", lineHeight: 1 }}>{c.count}</span>}
                </button>
              ))}
            </div>
            {calendarDay && (
              <button className="ghost sm" onClick={() => setCalendarDay(null)} style={{ marginTop: 8, width: "100%" }}>
                Clear date filter <span className="data">{calendarDay}</span>
              </button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: isMobile ? 0 : 280 }}>
            <div className="panel-scroll" style={{ maxHeight: 460, padding: 6, background: "var(--panel-sunk)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)" }}>
              {!appointments && (
                <div style={{ padding: 12, background: "var(--panel)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                  <div className="skeleton skeleton-text" style={{ width: "45%" }} />
                  <div className="skeleton skeleton-text" style={{ width: "70%" }} />
                  <div className="skeleton skeleton-text" />
                </div>
              )}
              {appointments && visibleAppointments.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-title">No work orders match this view</span>
                  <span className="empty-state-description">Clear the search or the date filter, or switch the board to all dates to see the whole queue.</span>
                </div>
              )}
              {visibleAppointments.map((a) => renderAppointmentCard(a))}
            </div>
          </div>
        </div>
      )}

      {viewMode === "kanban" && (
        <div style={boardScrollStyle}>
          {KANBAN_STATUSES.map((s) => (
            // No maxWidth here on purpose -- flex:1 with only a minWidth
            // floor means the columns actually fill whatever width the
            // screen has (confirmed live: the previous 320px cap left a
            // dead gap on anything wider than 5*320px, with a pointless
            // horizontal scrollbar to reach it).
            <div key={s} style={{ ...columnStyle, ...(isMobile ? { minWidth: 260, flex: "0 0 260" } : null) }}>
              {/* Column header — the column's lamp doubles as the rule beneath it */}
              <div style={columnHeadStyle}>
                <span className={`lamp ${STATUS_LAMP[s] ?? "lamp-idle"}`} style={{ fontWeight: 600 }}>{STATUS_LABEL[s]}</span>
                <span className="data meta" style={{ marginLeft: "auto" }}>{kanbanColumns[s]?.length ?? 0}</span>
              </div>
              {/* Column body */}
              <div className="panel-scroll" style={columnBodyStyle}>
                {(kanbanColumns[s] ?? []).map((a) => renderAppointmentCard(a))}
                {(kanbanColumns[s]?.length ?? 0) === 0 && (
                  <div className="empty-state" style={{ padding: "16px 14px", background: "transparent" }}>
                    <span className="empty-state-description">Nothing here right now.</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {selected && (
        <div id="repair-detail-panel" className="panel" style={{ ...drawerStyle, ...(isMobile ? { width: "100%", minWidth: 0, maxWidth: "none", borderLeft: "none" } : null) }}>
          {/* Header bar */}
          <div className="panel-head" style={{ alignItems: "flex-start", flexWrap: "wrap", rowGap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <button className="ghost sm" style={iconButtonStyle} onClick={() => setSelectedId(null)} aria-label="Close work order">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{selected.customerName}</div>
                <div className="meta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className={`lamp ${STATUS_LAMP[selected.status] ?? "lamp-idle"}`}>{STATUS_LABEL[selected.status] ?? selected.status}</span>
                  <span className="data">{selected.phone}</span>
                  {selected.email && <span>{selected.email}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                aria-label="Repair status"
                value={selected.status}
                onChange={(e) => updateStatus(selected.id, e.target.value)}
                style={{ width: "auto", fontSize: 12.5 }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <AuditHistoryButton entityType="repair" entityId={selected.id} />
              <select
                aria-label="Assigned technician"
                value={selected.technicianId || ""}
                onChange={(e) => assignTechnician(selected.id, e.target.value)}
                style={{ width: "auto", fontSize: 12.5 }}
              >
                <option value="">Unassigned</option>
                {staff.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button className={orderOpen ? "sm" : "primary sm"} aria-expanded={orderOpen} onClick={() => setOrderOpen((o) => !o)}>
                {orderOpen ? "Close order" : "Create order"}
              </button>
              {canDelete && (
                <button
                  className="ghost sm"
                  style={{ ...iconButtonStyle, color: "var(--danger)" }}
                  onClick={() => deleteAppointment(selected)}
                  aria-label="Delete work order"
                  title="Delete work order"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="panel-scroll" style={drawerBodyStyle}>
            {/* Work-order facts */}
            <div style={specGridStyle}>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Order number</div>
                <div className="data" style={{ color: "var(--ink)", fontWeight: 600 }}>{selected.serialNumber ?? "Not assigned"}</div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Device</div>
                <div style={{ color: "var(--ink)", fontSize: 13 }}>
                  {selected.deviceType}{selected.deviceModel ? ` ${selected.deviceModel}` : ""}
                </div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Slot booked</div>
                <div className="data" style={{ color: "var(--ink)", fontSize: 12.5 }}>
                  {(() => {
                    const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });
                    if (selected.isWalkIn) return "Walk-in";
                    // An order made from the dashboard (no customer-picked slot)
                    // stamps appointmentDate = "now", i.e. within moments of
                    // createdAt -- a real booked slot is never that close.
                    const noSlot = Math.abs(new Date(selected.appointmentDate).getTime() - new Date(selected.createdAt).getTime()) < 60_000;
                    return noSlot ? "No slot chosen" : fmt(selected.appointmentDate);
                  })()}
                </div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Created</div>
                <div className="data" style={{ color: "var(--ink)", fontSize: 12.5 }}>
                  {new Date(selected.createdAt).toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Source</div>
                <div style={{ color: "var(--ink)", fontSize: 13 }}>
                  {selected.source === "website" ? "Website booking" : selected.source?.startsWith("walk-in") ? selected.source : selected.source ? selected.source : selected.isWalkIn ? "Walk-in" : "Scheduled"}
                </div>
              </div>
              <div style={specCellStyle}>
                <div className="instrument-label" style={{ marginBottom: 4 }}>Tracking code</div>
                <button
                  className="ghost sm"
                  style={{ marginLeft: -9, fontFamily: "var(--font-mono)", fontSize: 12 }}
                  onClick={() => { navigator.clipboard.writeText(selected.trackingToken); }}
                  aria-label="Copy tracking code"
                  title="Copy tracking code"
                >
                  {selected.trackingToken}
                </button>
              </div>
            </div>

            {/* Issue */}
            <div style={{ marginBottom: 20 }}>
              <div className="panel-head" style={{ minHeight: 36, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)", marginBottom: 12 }}>
                <span className="instrument-label">Reported issue</span>
              </div>
              <div style={{ padding: 12, background: "var(--panel-sunk)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
                {selected.issueDescription}
              </div>
            </div>

            {/* Device photos */}
            <div style={{ marginBottom: 20 }}>
              <div className="panel-head" style={{ minHeight: 36, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)", marginBottom: 12 }}>
                <span className="instrument-label">Device photos</span>
                <label className="sm" style={{ cursor: "pointer" }}>
                  Upload photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label="Upload device photos"
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
                      <img src={url} alt={`Device photo ${i + 1}`} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }} />
                      <button
                        className="sm"
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
                        aria-label={`Remove device photo ${i + 1}`}
                        style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, padding: 0, borderRadius: "var(--r-pill)", background: "var(--panel)", borderColor: "var(--line-strong)" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: "18px 16px" }}>
                  <span className="empty-state-title">No photos yet</span>
                  <span className="empty-state-description">Upload the intake photos so whoever picks up the repair can see the damage.</span>
                </div>
              )}
            </div>

            {/* Reschedule / cancel requests */}
            {(selected.rescheduleRequested || selected.cancelRequested) && (
              <div style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {selected.rescheduleRequested && (
                  <div style={{ ...specCellStyle, background: "var(--warning-subtle)", border: "1px solid var(--machine-line)", borderRadius: "var(--r-sm)", padding: 12, flex: 1, minWidth: 240 }}>
                    <div style={{ marginBottom: 6 }}><span className="lamp lamp-warn">Reschedule requested</span></div>
                    {selected.rescheduleNewDate && <div className="meta" style={{ marginBottom: 10 }}>Asked for <span className="data">{new Date(selected.rescheduleNewDate).toLocaleString()}</span></div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="primary sm" onClick={() => handleRescheduleRequest(selected.id, "approve")}>Approve new time</button>
                      <button className="danger sm" onClick={() => handleRescheduleRequest(selected.id, "reject")}>Keep current slot</button>
                    </div>
                  </div>
                )}
                {selected.cancelRequested && (
                  <div style={{ ...specCellStyle, background: "var(--danger-subtle)", border: "1px solid var(--danger)", borderRadius: "var(--r-sm)", padding: 12, flex: 1, minWidth: 240 }}>
                    <div style={{ marginBottom: 6 }}><span className="lamp lamp-err">Cancel requested</span></div>
                    {selected.cancelReason && <div className="meta" style={{ marginBottom: 10 }}>{selected.cancelReason}</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="danger sm" onClick={() => handleCancelRequest(selected.id, "approve")}>Approve cancellation</button>
                      <button className="sm" onClick={() => handleCancelRequest(selected.id, "reject")}>Keep the repair</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Order items */}
            {orderOpen && (
              <div style={{ marginBottom: 20 }}>
                <div className="panel-head" style={{ minHeight: 36, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)", marginBottom: 12 }}>
                  <span className="instrument-label">Order items</span>
                </div>
                <div style={{ padding: 12, background: "var(--panel)", borderRadius: "var(--r-sm)", border: "1px solid var(--line)" }}>
                  <OrderItemsEditor order={selected} products={products} onChanged={refresh} />
                </div>
              </div>
            )}

            {/* Conversation — customer, staff and AI each get their own signature */}
            <div>
              <div className="panel-head" style={{ minHeight: 36, padding: "0 0 8px", borderBottom: "1px solid var(--line-soft)", marginBottom: 12 }}>
                <span className="instrument-label">Conversation</span>
              </div>
              <div style={threadStyle}>
                <div className="panel-scroll" style={threadScrollStyle}>
                  {!messages && (
                    <div>
                      <div className="skeleton skeleton-text" style={{ width: "40%" }} />
                      <div className="skeleton skeleton-text" style={{ width: "65%" }} />
                    </div>
                  )}
                  {messages?.length === 0 && (
                    <div className="empty-state" style={{ padding: "18px 16px" }}>
                      <span className="empty-state-title">No messages yet</span>
                      <span className="empty-state-description">Write the first reply to confirm the intake details with the customer.</span>
                    </div>
                  )}
                  {messages?.map((m) => {
                    if (m.role === "system") {
                      return (
                        <div key={m.id} className="data meta" style={{ alignSelf: "center", textAlign: "center", maxWidth: "80%" }}>
                          {m.content} <span style={{ opacity: 0.7 }}>{new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                      );
                    }
                    const isCustomer = m.role === "user";
                    const isMachine = m.role === "assistant" || m.role === "agent";
                    const shell: CSSProperties = {
                      ...bubbleShellStyle,
                      alignSelf: isCustomer ? "flex-start" : "flex-end",
                    };
                    return (
                      <div key={m.id} style={shell}>
                        <div style={isCustomer ? bubbleCustomerStyle : isMachine ? bubbleMachineStyle : bubbleStaffStyle}>
                          {isCustomer ? m.content : <MarkdownMessage text={m.content} />}
                        </div>
                        <span className="data" style={bubbleMetaStyle}>
                          {isCustomer ? "Customer" : isMachine ? "Assistant" : "Staff"}
                          {" "}
                          {new Date(m.createdAt).toLocaleTimeString("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line)", background: "var(--panel)" }}>
                  <input
                    aria-label="Reply to the customer"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="Write a reply to the customer"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
                  />
                  <button className="primary" onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? "Sending" : "Send reply"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {completedPromptId && (() => {
        const apt = appointments?.find((a) => a.id === completedPromptId);
        if (!apt) return null;
        return (
          <div className="panel" style={toastStyle}>
            <div className="instrument-label" style={{ marginBottom: 6 }}>Repair completed</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 14 }}>
              {apt.customerName}&apos;s {apt.deviceType} is marked completed. Create an order to bill it.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="sm" onClick={() => setCompletedPromptId(null)}>
                Not now
              </button>
              <button className="primary sm" onClick={openOrderForCompleted}>
                Create order
              </button>
            </div>
          </div>
        );
      })()}

      {walkInOpen && businessId && (
        <WalkInDialog
          businessId={businessId}
          staff={staff}
          onClose={() => setWalkInOpen(false)}
          onCreated={(created) => {
            setWalkInOpen(false);
            refresh();
            setSelectedId(created.id);
          }}
        />
      )}

      {receiptAppointment && (
        <RepairReceiptPopup
          appointment={receiptAppointment}
          products={products}
          businessName={businessName}
          onPrint={(edits) => confirmReceived(true, edits)}
          onNoNeedPrint={(edits) => confirmReceived(false, edits)}
          onClose={() => setReceiptPopupId(null)}
          onItemsChanged={() => {
            refresh();
            setSelectedId(receiptAppointment.id);
          }}
        />
      )}
    </section>
  );
}
