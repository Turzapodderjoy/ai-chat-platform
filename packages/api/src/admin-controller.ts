import { ChatUsageLog } from "@ai-chat-platform/chat-service";
import { TenantService } from "@ai-chat-platform/tenant";
import { ConversationService } from "@ai-chat-platform/conversation";
import { prisma } from "@ai-chat-platform/database";

export class AdminController {
  constructor(
    private readonly chatUsageLog: ChatUsageLog,
    private readonly tenants: TenantService,
    private readonly conversations: ConversationService
  ) {}

  chatUsage() {
    return this.chatUsageLog.recent();
  }

  /** Every client, for the mother dashboard's client list. */
  listBusinesses() {
    return this.tenants.listAll();
  }

  /** Its dashboard exists immediately at /dashboard/{id} — one dynamic
   * route serves every client, so nothing needs deploying per company. */
  createClient(name: string, type?: string) {
    if (!name.trim()) {
      throw new Error("Company name is required.");
    }

    return this.tenants.createBusiness(name, type);
  }

  setClientType(id: string, type: string) {
    return this.tenants.setBusinessType(id, type);
  }

  /** The platform-wide AI kill switch for one client -- ChatService
   * checks this on every single message (see chat-service.ts), so
   * turning it off takes effect on the very next customer message, no
   * restart. Flipping it also hides every per-conversation Stop/Resume
   * AI control for this client everywhere they appear (Inbox, Agent
   * Console) -- see AllChatsPanel/AgentConsole's own aiEnabled checks --
   * since a per-conversation override is meaningless once AI is off
   * for the whole client. */
  setClientAiEnabled(id: string, aiEnabled: boolean) {
    return this.tenants.setAiEnabled(id, aiEnabled);
  }

  getClient(id: string) {
    return this.tenants.getBusiness(id);
  }

  /** Removes a client and everything scoped to it: conversations (and
   * their messages, via cascade) — not just the Business row, so nothing
   * is left orphaned. Legacy knowledge/crawl cleanup lived here once;
   * both were deleted with the knowledge pipeline. */
  async deleteClient(businessId: string): Promise<{ deleted: string }> {
    await this.conversations.deleteByBusinessId(businessId);
    await this.tenants.deleteBusiness(businessId);
    return { deleted: businessId };
  }

  async database(): Promise<{ connected: boolean; host: string | null; error?: string }> {
    const url = process.env.DATABASE_URL;
    const host = url ? maskConnectionString(url) : null;

    if (!url) {
      return { connected: false, host: null, error: "DATABASE_URL is not set" };
    }

    try {
      await prisma.$queryRaw`SELECT 1`;
      return { connected: true, host };
    } catch (error) {
      return {
        connected: false,
        host,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace("/", "")}`;
  } catch {
    return "unknown";
  }
}