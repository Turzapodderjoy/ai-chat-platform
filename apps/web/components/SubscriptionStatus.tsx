"use client";

import { useEffect, useState } from "react";
import { cardStyle, labelTextStyle } from "./dashboard-styles";

interface SubscriptionStatus {
  planName: string | null;
  fee: number | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

export function SubscriptionStatus() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then((r) => r.json())
      .then((data) => {
        setSubscription(data.subscription);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ ...cardStyle, padding: 20, textAlign: "center", color: "var(--text-muted)" }}>
        Loading subscription...
      </div>
    );
  }
  if (!subscription) return null;

  const getStatus = () => {
    if (!subscription.active) return { label: "Disabled", color: "var(--text-muted)", bg: "var(--surface-hover)", icon: "⏸" };
    if (!subscription.endDate) return { label: "Active", color: "var(--success)", bg: "var(--success-subtle)", icon: "✓" };
    const end = new Date(subscription.endDate);
    const now = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (end.getTime() < now.getTime() - twoDaysMs) return { label: "Expired", color: "var(--danger)", bg: "var(--danger-subtle)", icon: "✕" };
    if (end.getTime() < now.getTime()) return { label: "Grace Period", color: "var(--warning)", bg: "var(--warning-subtle)", icon: "⚠" };
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { label: `Expiring in ${daysLeft}d`, color: "var(--warning)", bg: "var(--warning-subtle)", icon: "⚠" };
    return { label: "Active", color: "var(--success)", bg: "var(--success-subtle)", icon: "✓" };
  };

  const status = getStatus();

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={labelTextStyle}>Subscription</div>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: "var(--radius-full)",
          fontSize: 13,
          fontWeight: 500,
          backgroundColor: status.bg,
          color: status.color,
        }}>
          <span>{status.icon}</span>
          {status.label}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
        {subscription.planName && (
          <div style={{ padding: "12px", background: "var(--surface-hover)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Plan</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{subscription.planName}</div>
          </div>
        )}
        {subscription.fee && (
          <div style={{ padding: "12px", background: "var(--surface-hover)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Monthly Fee</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>৳{subscription.fee.toLocaleString()}</div>
          </div>
        )}
        {subscription.startDate && (
          <div style={{ padding: "12px", background: "var(--surface-hover)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Start Date</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{new Date(subscription.startDate).toLocaleDateString()}</div>
          </div>
        )}
        {subscription.endDate && (
          <div style={{ padding: "12px", background: "var(--surface-hover)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>End Date</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{new Date(subscription.endDate).toLocaleDateString()}</div>
          </div>
        )}
      </div>

      {!subscription.planName && !subscription.fee && !subscription.startDate && (
        <div style={{ padding: "16px", background: "var(--surface-hover)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>No subscription configured</div>
        </div>
      )}
    </div>
  );
}
