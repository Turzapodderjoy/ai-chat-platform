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
