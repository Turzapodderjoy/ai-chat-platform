"use client";

import { useEffect, useRef, useState } from "react";
import {
  type AppointmentNotification,
  loadNotifications,
  dismissNotification,
  clearAllNotifications,
  checkForNewAppointments,
  onNotificationsChanged,
  playPingSound,
  isDismissedId,
  dismissId,
} from "../lib/appointment-notifications";

interface AppointmentSummary {
  id: string;
  customerName: string;
  appointmentDate: string;
  issueDescription: string;
}

interface AdminNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

type BellItem =
  | { kind: "appointment"; id: string; title: string; subtitle: string; detail: string }
  | { kind: "admin"; id: string; title: string; subtitle: string; detail: string }
  | { kind: "subscription"; id: string; title: string; subtitle: string; detail: string };

/** Topbar bell -- merges three notification sources into one dropdown:
 * new appointments (own localStorage diffing, see
 * lib/appointment-notifications.ts), admin-sent messages
 * (AdminNotification rows, dismiss tracked by id), and the subscription
 * expiry warning (dismiss keyed by id so it reappears if renewed).
 * Polls independently of whichever tab is open, same reasoning as
 * before -- a topbar element is always mounted. */
export function AppointmentNotificationBell({ businessId }: { businessId: string }) {
  const [appointmentNotifs, setAppointmentNotifs] = useState<AppointmentNotification[]>([]);
  const [adminNotifs, setAdminNotifs] = useState<AdminNotification[]>([]);
  const [subWarning, setSubWarning] = useState<{ id: string; daysLeft: number } | null>(null);
  const [, forceRerender] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAppointmentNotifs(loadNotifications(businessId));
    return onNotificationsChanged(() => {
      setAppointmentNotifs(loadNotifications(businessId));
      forceRerender((n) => n + 1);
    });
  }, [businessId]);

  useEffect(() => {
    function pollAppointments() {
      fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((d: { appointments: AppointmentSummary[] }) => {
          const fresh = checkForNewAppointments(businessId, d.appointments ?? []);
          if (fresh.length > 0) playPingSound();
        })
        .catch(() => {});
    }
    function pollAdmin() {
      fetch(`/api/admin/notifications?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((d: { notifications: AdminNotification[] }) => setAdminNotifs(d.notifications ?? []))
        .catch(() => {});
    }
    function pollSubscription() {
      fetch(`/api/billing/subscription?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((d) => {
          const sub = d.subscription;
          if (!sub || !sub.subscriptionActive || !sub.subscriptionEndDate) {
            setSubWarning(null);
            return;
          }
          const end = new Date(sub.subscriptionEndDate);
          const daysLeft = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 7 && daysLeft > 0) {
            setSubWarning({ id: sub.subscriptionEndDate, daysLeft });
          } else {
            setSubWarning(null);
          }
        })
        .catch(() => {});
    }
    pollAppointments();
    pollAdmin();
    pollSubscription();
    const interval = setInterval(() => {
      pollAppointments();
      pollAdmin();
      pollSubscription();
    }, 15000);
    return () => clearInterval(interval);
  }, [businessId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const items: BellItem[] = [
    ...appointmentNotifs.map((n): BellItem => ({
      kind: "appointment",
      id: n.id,
      title: `New appointment — ${n.customerName}`,
      subtitle: new Date(n.appointmentDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      detail: n.issueDescription,
    })),
    ...adminNotifs
      .filter((n) => !isDismissedId(businessId, "admin", n.id))
      .map((n): BellItem => ({
        kind: "admin",
        id: n.id,
        title: n.title,
        subtitle: new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        detail: n.body,
      })),
    ...(subWarning && !isDismissedId(businessId, "subscription", subWarning.id)
      ? [{
          kind: "subscription" as const,
          id: subWarning.id,
          title: "Subscription expiring",
          subtitle: `${subWarning.daysLeft} day${subWarning.daysLeft > 1 ? "s" : ""} left`,
          detail: "Please contact support to renew.",
        }]
      : []),
  ];

  function dismiss(item: BellItem) {
    if (item.kind === "appointment") dismissNotification(businessId, item.id);
    else dismissId(businessId, item.kind, item.id);
    forceRerender((n) => n + 1);
  }

  function clearAll() {
    clearAllNotifications(businessId);
    adminNotifs.forEach((n) => dismissId(businessId, "admin", n.id));
    if (subWarning) dismissId(businessId, "subscription", subWarning.id);
    forceRerender((n) => n + 1);
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="plain"
        aria-label="Notifications"
        style={{
          position: "relative",
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--radius-sm, 8px)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          cursor: "pointer",
          color: "var(--text)",
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {items.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "var(--danger)",
              color: "white",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxHeight: 400,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md, 12px)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 1000,
            padding: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {items.length > 0 && (
              <button
                onClick={clearAll}
                className="plain"
                style={{ fontSize: 11.5, color: "var(--text-faint)", cursor: "pointer" }}
              >
                Clear all
              </button>
            )}
          </div>

          {items.length === 0 && (
            <p style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "8px 4px" }}>No notifications.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item) => (
              <div
                key={`${item.kind}-${item.id}`}
                style={{
                  position: "relative",
                  padding: "8px 28px 8px 10px",
                  background: "var(--bg)",
                  border: item.kind === "subscription" ? "1px solid var(--warning)" : "1px solid var(--border)",
                  borderRadius: "var(--radius-sm, 8px)",
                }}
              >
                <button
                  onClick={() => dismiss(item)}
                  className="plain"
                  aria-label="Dismiss"
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-faint)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  ✕
                </button>
                <div style={{ fontSize: 12.5, fontWeight: 650 }}>{item.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{item.subtitle}</div>
                {item.detail && (
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>{item.detail}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
