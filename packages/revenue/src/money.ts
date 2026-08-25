export interface LineItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

/** Shared subtotal/total math for Quote and Invoice — computed here, not
 * trusted from the client, so a tampered request body can't misreport
 * what a quote/invoice is actually worth. */
export function calcTotals(items: LineItemInput[], discount: number, tax: number) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const total = Math.max(0, subtotal - discount + tax);
  return { subtotal, total };
}
