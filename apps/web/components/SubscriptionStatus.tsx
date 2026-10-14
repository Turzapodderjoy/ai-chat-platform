"use client";

import { useEffect, useState } from "react";
import { currencySymbol } from "../lib/currency";

interface SubscriptionStatus {
  subscriptionPlanName: string | null;
  subscriptionFee: number | null;
  subscriptionCurrency: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  subscriptionActive: boolean;
}

function getStatus(subscription: SubscriptionStatus): { label: string; lamp: string } {
  if (!subscription.subscriptionActive) return { label: "Disabled", lamp: "lamp lamp-idle" };
  if (!subscription.subscriptionEndDate) return { label: "Active", lamp: "lamp lamp-ok" };

  const end = new Date(subscription.subscriptionEndDate);
  const now = new Date();
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  if (end.getTime() < now.getTime() - twoDaysMs) return { label: "Expired", lamp: "lamp lamp-err" };
  if (end.getTime() < now.getTime()) return { label: "Grace period", lamp: "lamp lamp-warn" };

  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 7) return { label: `Expiring in ${daysLeft}d`, lamp: "lamp lamp-warn" };
  return { label: "Active", lamp: "lamp lamp-ok" };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="instrument-label" style={{ display: "block", marginBottom: 3 }}>{label}</span>
      <span className="data" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
        {value}
      </span>
    </div>
  );
}

export function SubscriptionStatus({ businessId }: { businessId: string }) {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/billing/subscription?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data) => {
        setSubscription(data.subscription);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [businessId]);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Subscription</span>
        </div>
        <div className="panel-body">
          <div className="skeleton" style={{ height: 34 }} />
        </div>
      </section>
    );
  }
  if (!subscription) return null;

  const status = getStatus(subscription);
  const hasFee = subscription.subscriptionFee != null;
  const feeText = hasFee
    ? subscription.subscriptionFee === 0
      ? "Free"
      : `${currencySymbol(subscription.subscriptionCurrency)}${subscription.subscriptionFee!.toLocaleString()}/30 days`
    : null;

  const hasAnyDetail = subscription.subscriptionPlanName || hasFee || subscription.subscriptionStartDate || subscription.subscriptionEndDate;

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Subscription</span>
        <span className={status.lamp}>{status.label}</span>
      </div>

      <div className="panel-body">
        {hasAnyDetail ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16 }}>
            {subscription.subscriptionPlanName && <Field label="Plan" value={subscription.subscriptionPlanName} />}
            {feeText && <Field label="Fee" value={feeText} />}
            {subscription.subscriptionStartDate && (
              <Field label="Start date" value={new Date(subscription.subscriptionStartDate).toLocaleDateString()} />
            )}
            {subscription.subscriptionEndDate && (
              <Field label="End date" value={new Date(subscription.subscriptionEndDate).toLocaleDateString()} />
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">No subscription configured</div>
            <div className="empty-state-description">
              This business has no plan attached, so status emails and automations stay paused.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
