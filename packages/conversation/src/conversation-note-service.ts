import { prisma } from "@ai-chat-platform/database";

export interface ConversationNote {
  id: string;
  conversationId: string;
  businessId: string;
  author: string;
  body: string;
  createdAt: string;
}

function toNote(row: { id: string; conversationId: string; businessId: string; author: string; body: string; createdAt: Date }): ConversationNote {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Intercom-style internal notes — an aside for teammates on a
 * conversation, never sent to the customer and never mixed into the
 * on-channel Message thread. See ConversationNote's own schema comment
 * for why author is free text rather than a real user id. */
export class ConversationNoteService {
  async list(conversationId: string): Promise<ConversationNote[]> {
    const rows = await prisma.conversationNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toNote);
  }

  async add(input: { conversationId: string; businessId: string; author: string; body: string }): Promise<ConversationNote> {
    if (!input.body.trim()) {
      throw new Error("Note body is required.");
    }
    const row = await prisma.conversationNote.create({ data: input });
    return toNote(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.conversationNote.delete({ where: { id } });
  }
}
