"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** Toast notification for new bookings */
function Toast({ notification, onClose }: { notification: AppointmentNotification; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        padding: "12px 14px",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-pop)",
        zIndex: 9999,
        animation: "slideInRight 0.3s var(--ease-out)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span className="lamp lamp-info">New booking</span>
        <button onClick={onClose} className="plain sm">Dismiss</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{notification.customerName}</div>
      <div className="data" style={{ fontSize: 12, color: "var(--ink-3)", margin: "3px 0 4px" }}>
        {new Date(notification.appointmentDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </div>
      <div className="meta" style={{ fontSize: 12, lineHeight: 1.45 }}>{notification.issueDescription}</div>
    </div>
  );
}

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
  const [toast, setToast] = useState<AppointmentNotification | null>(null);

  useEffect(() => {
    setAppointmentNotifs(loadNotifications(businessId));
    return onNotificationsChanged(() => {
      setAppointmentNotifs(loadNotifications(businessId));
      forceRerender((n) => n + 1);
    });
  }, [businessId]);

  const showToast = useCallback((n: AppointmentNotification) => {
    setToast(n);
    playPingSound();
  }, []);

  useEffect(() => {
    function pollAppointments() {
      fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((d: { appointments: AppointmentSummary[] }) => {
          const fresh = checkForNewAppointments(businessId, d.appointments ?? []);
          if (fresh.length > 0 && fresh[0]) {
            showToast(fresh[0]);
          }
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
  }, [businessId, showToast]);

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
        aria-label={items.length > 0 ? `Notifications, ${items.length} unread` : "Notifications"}
        style={{
          position: "relative",
          width: 34,
          height: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink)",
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
              top: 1,
              right: 1,
              width: 8,
              height: 8,
              borderRadius: "var(--r-pill)",
              background: "var(--danger)",
            }}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 400,
            overflowY: "auto",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-pop)",
            zIndex: 1000,
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <span className="instrument-label">Notifications{items.length > 0 ? ` · ${items.length}` : ""}</span>
            {items.length > 0 && (
              <button onClick={clearAll} className="ghost sm">Clear all</button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: "14px 12px" }}>
              <div className="empty-state-title">Nothing new</div>
              <div className="empty-state-description">
                New bookings, admin messages and renewal warnings land here.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  style={{
                    position: "relative",
                    padding: "9px 10px",
                    background: "var(--panel-sunk)",
                    border: `1px solid ${item.kind === "subscription" ? "var(--warning)" : "var(--line-soft)"}`,
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", paddingRight: 74 }}>
                    {item.title}
                  </div>
                  <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>
                    {item.subtitle}
                  </div>
                  {item.detail && (
                    <div className="meta" style={{ fontSize: 11.5, marginTop: 3 }}>{item.detail}</div>
                  )}
                  <div style={{ position: "absolute", top: 5, right: 6 }}>
                    <button
                      onClick={() => dismiss(item)}
                      className="plain sm"
                      aria-label={`Dismiss ${item.title}`}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && <Toast notification={toast} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
