import { prisma } from "./client";

export interface AuditLogEntry {
  action: string;
  detail: string | null;
  actorUsername: string;
  createdAt: string;
}

/** Records one "who did what" row for Repairs/Orders/Invoices --
 * actorUsername comes from resolveAdminActor() (apps/web/lib/admin-actor.ts).
 * Awaited by every caller, same as any other write in this codebase --
 * not fire-and-forget. */
export async function logAudit(input: {
  businessId: string;
  entityType: string;
  entityId: string;
  action: string;
  detail?: string;
  actorUsername: string;
}): Promise<void> {
  await prisma.auditLog.create({ data: input });
}

/** Full history for one entity, newest first -- the hover tooltip on a
 * repair's status or an invoice's status renders every one of these as
 * a multi-line list, not just the latest. */
export async function listAuditLog(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    select: { action: true, detail: true, actorUsername: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
