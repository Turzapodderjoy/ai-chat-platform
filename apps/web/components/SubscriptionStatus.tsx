"use client";

import { useEffect, useState } from "react";
import { cardStyle, subtleTextStyle, labelTextStyle, badgeStyle, type BadgeTone } from "./dashboard-styles";
import { currencySymbol } from "../lib/currency";

interface SubscriptionStatus {
  subscriptionPlanName: string | null;
  subscriptionFee: number | null;
  subscriptionCurrency: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  subscriptionActive: boolean;
}

function getStatus(subscription: SubscriptionStatus): { label: string; tone: BadgeTone } {
  if (!subscription.subscriptionActive) return { label: "Disabled", tone: "neutral" };
  if (!subscription.subscriptionEndDate) return { label: "Active", tone: "ok" };

  const end = new Date(subscription.subscriptionEndDate);
  const now = new Date();
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  if (end.getTime() < now.getTime() - twoDaysMs) return { label: "Expired", tone: "error" };
  if (end.getTime() < now.getTime()) return { label: "Grace Period", tone: "warn" };

  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 7) return { label: `Expiring in ${daysLeft}d`, tone: "warn" };
  return { label: "Active", tone: "ok" };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
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

  if (loading) return <div style={{ ...cardStyle, ...subtleTextStyle }}>Loading subscription…</div>;
  if (!subscription) return null;

  const status = getStatus(subscription);
  const hasFee = subscription.subscriptionFee != null;
  const feeText = hasFee
    ? subscription.subscriptionFee === 0
      ? "Free"
      : `${currencySymbol(subscription.subscriptionCurrency)}${subscription.subscriptionFee!.toLocaleString()}/mo`
    : null;

  const hasAnyDetail = subscription.subscriptionPlanName || hasFee || subscription.subscriptionStartDate || subscription.subscriptionEndDate;

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasAnyDetail ? 16 : 0 }}>
        <div style={labelTextStyle}>Subscription</div>
        <span style={badgeStyle(status.tone)}>{status.label}</span>
      </div>

      {hasAnyDetail ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16 }}>
          {subscription.subscriptionPlanName && <Field label="Plan" value={subscription.subscriptionPlanName} />}
          {feeText && <Field label="Fee" value={feeText} />}
          {subscription.subscriptionStartDate && <Field label="Start Date" value={new Date(subscription.subscriptionStartDate).toLocaleDateString()} />}
          {subscription.subscriptionEndDate && <Field label="End Date" value={new Date(subscription.subscriptionEndDate).toLocaleDateString()} />}
        </div>
      ) : (
        <p style={{ ...subtleTextStyle, margin: 0 }}>No subscription configured.</p>
      )}
    </section>
  );
}
