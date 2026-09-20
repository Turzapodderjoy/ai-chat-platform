import { prisma } from "./client";

/** The next number from a business's single shared sequence, e.g.
 * "PRAZ00001" (the business's own documentPrefix + 5 digits; "INV-00001"
 * when no prefix is set). One atomic increment on
 * Business.documentCounter, so two simultaneous bookings can't get the
 * same number and deleting a record never frees its number for reuse --
 * an appointment, its order and its invoice all carry this same value. */
export async function nextDocumentNumber(businessId: string): Promise<string> {
  const row = await prisma.business.update({
    where: { id: businessId },
    data: { documentCounter: { increment: 1 } },
    select: { documentCounter: true, documentPrefix: true },
  });
  return `${row.documentPrefix ?? "INV-"}${String(row.documentCounter).padStart(5, "0")}`;
}
