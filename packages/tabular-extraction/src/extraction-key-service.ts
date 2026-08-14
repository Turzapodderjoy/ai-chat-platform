import { prisma } from "@ai-chat-platform/database";

export interface ExtractionKeySummary {
  id: string;
  label: string | null;
  maskedKey: string;
  createdAt: string;
}

function mask(key: string): string {
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** CRUD for the Groq extraction key pool (see ExtractionApiKey's own
 * schema comment for why this is a flat list, not a single key). Read
 * once at boot by container.ts to build the array TabularExtractionClient/
 * TemplateExtractor's KeyRotator is constructed with — adding or removing
 * a key here takes effect on the next process restart. */
export class ExtractionKeyService {
  async list(): Promise<ExtractionKeySummary[]> {
    const rows = await prisma.extractionApiKey.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      maskedKey: mask(r.apiKey),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Every currently-stored key, unmasked — only ever used at boot to
   * build the real KeyRotator array, never returned to a client. */
  async listRawKeys(): Promise<string[]> {
    const rows = await prisma.extractionApiKey.findMany({ select: { apiKey: true } });
    return rows.map((r) => r.apiKey);
  }

  async add(apiKey: string, label?: string): Promise<ExtractionKeySummary> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error("apiKey is required");
    }

    const row = await prisma.extractionApiKey.create({
      data: { apiKey: trimmed, label: label?.trim() || null },
    });

    return { id: row.id, label: row.label, maskedKey: mask(row.apiKey), createdAt: row.createdAt.toISOString() };
  }

  async remove(id: string): Promise<void> {
    await prisma.extractionApiKey.delete({ where: { id } });
  }
}
