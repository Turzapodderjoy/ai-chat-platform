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
    // Check every 6 hours (21600000ms) but for demo we check on mount
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
    const interval = setInterval(checkSubscription, 6 * 60 * 60 * 1000); // Every 6 hours
    return () => clearInterval(interval);
  }, []);

  if (!warning || dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1000,
        maxWidth: 360,
        padding: 16,
        backgroundColor: "#fffbeb",
        border: "1px solid #fcd34d",
        borderRadius: 8,
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <strong style={{ fontSize: 14, color: "#92400e" }}>Subscription Expiring</strong>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            fontSize: 18,
            color: "#92400e",
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <p style={{ fontSize: 13, color: "#92400e", margin: 0, lineHeight: 1.5 }}>
        Your subscription expires in <strong>{warning.daysLeft} day{warning.daysLeft > 1 ? "s" : ""}</strong>.
        Please contact support to renew.
      </p>
    </div>
  );
}
