export const SUBSCRIPTION_CURRENCIES = ["BDT", "USD", "EUR"] as const;
export type SubscriptionCurrency = (typeof SUBSCRIPTION_CURRENCIES)[number];

const SYMBOLS: Record<string, string> = {
  BDT: "৳",
  USD: "$",
  EUR: "€",
};

export function currencySymbol(code: string | null | undefined): string {
  return SYMBOLS[code || "BDT"] || (code ? `${code} ` : "৳");
}
