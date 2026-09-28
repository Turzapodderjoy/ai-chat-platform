import { useEffect, useState } from "react";

export const SUBSCRIPTION_CURRENCIES = ["USD", "BDT", "EUR"] as const;
export type SubscriptionCurrency = (typeof SUBSCRIPTION_CURRENCIES)[number];

const SYMBOLS: Record<string, string> = {
  USD: "$",
  BDT: "৳",
  EUR: "€",
};

export function currencySymbol(code: string | null | undefined): string {
  return SYMBOLS[code || "USD"] || (code ? `${code} ` : "$");
}

/** A business's money symbol (from Business.subscriptionCurrency), for
 * panels that show prices/totals but don't already have the business
 * record in scope. Defaults to the platform-wide USD symbol until the
 * fetch resolves, matching currencySymbol()'s own fallback. */
export function useCurrencySymbol(businessId: string): string {
  const [symbol, setSymbol] = useState("$");
  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/billing/subscription?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d) => setSymbol(currencySymbol(d.subscription?.subscriptionCurrency)))
      .catch(() => {});
  }, [businessId]);
  return symbol;
}
