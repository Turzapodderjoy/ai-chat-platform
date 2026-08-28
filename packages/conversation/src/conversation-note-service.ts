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

  /** Used by the client-scoped Agent Console routes to check a note's
   * businessId before letting an agent/owner delete it -- never trust a
   * client-supplied businessId, only this lookup. */
  async get(id: string): Promise<ConversationNote | null> {
    const row = await prisma.conversationNote.findUnique({ where: { id } });
    return row ? toNote(row) : null;
  }

  async delete(id: string): Promise<void> {
    await prisma.conversationNote.delete({ where: { id } });
  }
}
