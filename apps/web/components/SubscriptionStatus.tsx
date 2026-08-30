"use client";

import { useEffect, useState } from "react";
import { cardStyle } from "./dashboard-styles";
import { currencySymbol } from "../lib/currency";

interface SubscriptionStatus {
  subscriptionPlanName: string | null;
  subscriptionFee: number | null;
  subscriptionCurrency: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  subscriptionActive: boolean;
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

  if (loading) return <div style={{ padding: 16, fontSize: 13 }}>Loading subscription...</div>;
  if (!subscription) return null;

  const getStatus = () => {
    if (!subscription.subscriptionActive) return { label: "Disabled", color: "#6b7280", bg: "#f3f4f6" };
    if (!subscription.subscriptionEndDate) return { label: "Active", color: "#10b981", bg: "#ecfdf5" };
    const end = new Date(subscription.subscriptionEndDate);
    const now = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (end.getTime() < now.getTime() - twoDaysMs) return { label: "Expired", color: "#ef4444", bg: "#fef2f2" };
    if (end.getTime() < now.getTime()) return { label: "Grace Period", color: "#f59e0b", bg: "#fffbeb" };
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { label: `Expiring in ${daysLeft}d`, color: "#f59e0b", bg: "#fffbeb" };
    return { label: "Active", color: "#10b981", bg: "#ecfdf5" };
  };

  const status = getStatus();

  return (
    <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Subscription</h3>
        <span
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: 500,
            backgroundColor: status.bg,
            color: status.color,
          }}
        >
          {status.label}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, fontSize: 13 }}>
        {subscription.subscriptionPlanName && (
          <div>
            <div style={{ color: "#6b7280", marginBottom: 2 }}>Plan</div>
            <div style={{ fontWeight: 500 }}>{subscription.subscriptionPlanName}</div>
          </div>
        )}
        {subscription.subscriptionFee && (
          <div>
            <div style={{ color: "#6b7280", marginBottom: 2 }}>Monthly Fee</div>
            <div style={{ fontWeight: 500 }}>{currencySymbol(subscription.subscriptionCurrency)}{subscription.subscriptionFee.toLocaleString()}</div>
          </div>
        )}
        {subscription.subscriptionStartDate && (
          <div>
            <div style={{ color: "#6b7280", marginBottom: 2 }}>Start Date</div>
            <div style={{ fontWeight: 500 }}>{new Date(subscription.subscriptionStartDate).toLocaleDateString()}</div>
          </div>
        )}
        {subscription.subscriptionEndDate && (
          <div>
            <div style={{ color: "#6b7280", marginBottom: 2 }}>End Date</div>
            <div style={{ fontWeight: 500 }}>{new Date(subscription.subscriptionEndDate).toLocaleDateString()}</div>
          </div>
        )}
      </div>

      {!subscription.subscriptionPlanName && !subscription.subscriptionFee && !subscription.subscriptionStartDate && (
        <div style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>No subscription configured</div>
      )}
    </div>
  );
}
