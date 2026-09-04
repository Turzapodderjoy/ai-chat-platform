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
} from "../lib/appointment-notifications";

interface AppointmentSummary {
  id: string;
  customerName: string;
  appointmentDate: string;
  issueDescription: string;
}

/** Topbar bell -- polls this business's repair appointments on its own
 * (independent of whichever tab is actually open, unlike the Repairs
 * panel's own refresh loop) so a new booking surfaces even while the
 * owner is looking at Inventory. See lib/appointment-notifications.ts
 * for the shared localStorage store the Repairs panel's row-highlight
 * also reads from. */
export function AppointmentNotificationBell({ businessId }: { businessId: string }) {
  const [notifications, setNotifications] = useState<AppointmentNotification[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifications(loadNotifications(businessId));
    return onNotificationsChanged(() => setNotifications(loadNotifications(businessId)));
  }, [businessId]);

  useEffect(() => {
    function poll() {
      fetch(`/api/admin/repairs?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((d: { appointments: AppointmentSummary[] }) => {
          const fresh = checkForNewAppointments(businessId, d.appointments ?? []);
          if (fresh.length > 0) playPingSound();
        })
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [businessId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        {notifications.length > 0 && (
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
            {notifications.length}
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
            {notifications.length > 0 && (
              <button
                onClick={() => clearAllNotifications(businessId)}
                className="plain"
                style={{ fontSize: 11.5, color: "var(--text-faint)", cursor: "pointer" }}
              >
                Clear all
              </button>
            )}
          </div>

          {notifications.length === 0 && (
            <p style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "8px 4px" }}>No new appointments.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  position: "relative",
                  padding: "8px 28px 8px 10px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm, 8px)",
                }}
              >
                <button
                  onClick={() => dismissNotification(businessId, n.id)}
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
                <div style={{ fontSize: 12.5, fontWeight: 650 }}>New appointment — {n.customerName}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                  {new Date(n.appointmentDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                {n.issueDescription && (
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>{n.issueDescription}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
