"use client";

import { useEffect, useState } from "react";

interface SubscriptionWarning {
  daysLeft: number;
  endDate: string;
}

export function SubscriptionNotification() {
  const [warning, setWarning] = useState<SubscriptionWarning | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkSubscription = () => {
      fetch("/api/billing/subscription")
        .then((r) => r.json())
        .then((data) => {
          const sub = data.subscription;
          if (!sub || !sub.active || !sub.endDate) return;

          const end = new Date(sub.endDate);
          const now = new Date();
          const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysLeft <= 7 && daysLeft > 0) {
            setWarning({ daysLeft, endDate: sub.endDate });
          }
        })
        .catch(() => {});
    };

    checkSubscription();
    const interval = setInterval(checkSubscription, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!warning || dismissed) return null;

  return (
    <div style={{
      position: "fixed",
      top: 16,
      right: 16,
      zIndex: 1000,
      maxWidth: 360,
      padding: 16,
      background: "var(--surface)",
      border: "1px solid var(--warning)",
      borderRadius: "var(--radius-md, 12px)",
      boxShadow: "var(--shadow-lg)",
      animation: "slideIn 0.3s ease-out",
    }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-sm)",
            background: "var(--warning-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--warning)",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Subscription Expiring</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Action required</div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "transparent",
            border: "none",
            padding: 4,
            color: "var(--text-muted)",
            cursor: "pointer",
            borderRadius: "var(--radius-xs)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
        Your subscription expires in{" "}
        <strong style={{ color: "var(--warning)" }}>
          {warning.daysLeft} day{warning.daysLeft > 1 ? "s" : ""}
        </strong>.
        Please contact support to renew.
      </p>
    </div>
  );
}
