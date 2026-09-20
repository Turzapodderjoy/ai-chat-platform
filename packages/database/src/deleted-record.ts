import type { Prisma } from "@prisma/client";

import { prisma } from "./client";

export type DeletedEntityType = "repair" | "invoice" | "contact" | "product";

export interface DeletedRecordRow {
  id: string;
  businessId: string;
  entityType: string;
  entityId: string;
  label: string;
  data: unknown;
  deletedBy: string;
  deletedAt: string;
}

/** Call with the row(s) fetched BEFORE the delete runs, and await it
 * before deleting -- a failure here should stop the delete, since the
 * whole point is that nothing is removed without a copy being kept. */
export async function archiveDeleted(input: {
  businessId: string;
  entityType: DeletedEntityType;
  entityId: string;
  label: string;
  data: unknown;
  deletedBy: string;
}): Promise<void> {
  await prisma.deletedRecord.create({
    data: { ...input, data: JSON.parse(JSON.stringify(input.data)) as Prisma.InputJsonValue },
  });
}

export async function listDeleted(businessId: string, entityType?: string): Promise<DeletedRecordRow[]> {
  const rows = await prisma.deletedRecord.findMany({
    where: { businessId, ...(entityType ? { entityType } : {}) },
    orderBy: { deletedAt: "desc" },
    take: 500,
  });
  return rows.map((r) => ({ ...r, deletedAt: r.deletedAt.toISOString() }));
}
