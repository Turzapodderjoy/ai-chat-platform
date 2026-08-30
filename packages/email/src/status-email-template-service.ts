import { prisma } from "@ai-chat-platform/database";

export type StatusEmailKind = "order_status" | "repair_status";

export interface StatusEmailTemplate {
  id: string;
  businessId: string;
  kind: StatusEmailKind;
  statusValue: string;
  subject: string;
  bodyHtml: string;
  enabled: boolean;
}

export interface StatusEmailTemplateInput {
  subject: string;
  bodyHtml: string;
  enabled: boolean;
}

/** One editable template per (business, kind, status) -- "kind" is
 * "order_status" or "repair_status", "statusValue" matches
 * DELIVERY_STATUSES or the repair status list. StatusEmailService looks
 * these up by the exact (businessId, kind, statusValue) triple whenever
 * an Order/RepairAppointment status changes. */
export class StatusEmailTemplateService {
  async listForBusiness(businessId: string): Promise<StatusEmailTemplate[]> {
    const rows = await prisma.statusEmailTemplate.findMany({ where: { businessId } });
    return rows.map(toTemplate);
  }

  async get(businessId: string, kind: StatusEmailKind, statusValue: string): Promise<StatusEmailTemplate | null> {
    const row = await prisma.statusEmailTemplate.findUnique({
      where: { businessId_kind_statusValue: { businessId, kind, statusValue } },
    });
    return row ? toTemplate(row) : null;
  }

  async upsert(
    businessId: string,
    kind: StatusEmailKind,
    statusValue: string,
    input: StatusEmailTemplateInput
  ): Promise<StatusEmailTemplate> {
    const row = await prisma.statusEmailTemplate.upsert({
      where: { businessId_kind_statusValue: { businessId, kind, statusValue } },
      create: { businessId, kind, statusValue, ...input },
      update: { ...input },
    });
    return toTemplate(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.statusEmailTemplate.delete({ where: { id } });
  }
}

type TemplateRow = {
  id: string;
  businessId: string;
  kind: string;
  statusValue: string;
  subject: string;
  bodyHtml: string;
  enabled: boolean;
};

function toTemplate(row: TemplateRow): StatusEmailTemplate {
  return {
    id: row.id,
    businessId: row.businessId,
    kind: row.kind as StatusEmailKind,
    statusValue: row.statusValue,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    enabled: row.enabled,
  };
}
