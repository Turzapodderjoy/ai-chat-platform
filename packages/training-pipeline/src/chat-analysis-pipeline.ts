import fs from "fs/promises";
import path from "path";

import { prisma } from "@ai-chat-platform/database";

import { ChatAnalysisService } from "./chat-analysis-service";
import { ReasoningClient } from "./reasoning-client";
import { CHAT_ANALYSIS_SYSTEM_PROMPT, buildChatAnalysisUserPrompt } from "./system-prompt";
import type { AiConfigService } from "@ai-chat-platform/ai-config";
import type { MessageFeedbackService } from "@ai-chat-platform/conversation";

interface RawAnalysisResponse {
  verdict?: string;
  findings?: string;
  instruction?: string;
  input?: string;
  output?: string;
}

const VALID_VERDICTS = new Set(["kept", "dropped_spam", "dropped_irrelevant", "dropped_harmful"]);

const JSONL_PATH = path.join(process.cwd(), "storage", "training", "dataset.jsonl");

/** Batch size per cron run — deliberately small. This shares a dedicated
 * Groq key's rate limit with the daily suggestion pass (see
 * PromptSuggestionService), and there's no reason to rush: unprocessed
 * conversations just get picked up the following day. */
const DEFAULT_BATCH_SIZE = 20;

/** gpt-oss-120b's real constraint turned out to be tokens-per-minute
 * (8000 TPM on this account), not the request-count limit its headers
 * advertise — a single analysis call's reasoning output alone can run
 * 1500-2500 tokens. Found live: firing all 20 calls back-to-back
 * exhausted the budget within seconds and most of the batch 429'd.
 * Pacing one call every few seconds keeps steady-state usage under the
 * limit instead of bursting into it. */
const DELAY_BETWEEN_CALLS_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ChatAnalysisPipeline {
  constructor(
    private readonly analysis: ChatAnalysisService,
    private readonly reasoning: ReasoningClient,
    private readonly aiConfig: AiConfigService,
    private readonly messageFeedback: MessageFeedbackService
  ) {}

  async run(batchSize = DEFAULT_BATCH_SIZE): Promise<{
    processed: number;
    kept: number;
    dropped: number;
    failed: number;
  }> {
    const conversations = await this.analysis.unprocessedConversations(batchSize);

    let kept = 0;
    let dropped = 0;
    let failed = 0;

    for (let i = 0; i < conversations.length; i++) {
      if (i > 0) {
        await sleep(DELAY_BETWEEN_CALLS_MS);
      }

      const conversation = conversations[i]!;

      try {
        const verdict = await this.analyzeOne(conversation);
        if (verdict === "kept") {
          kept += 1;
        } else {
          dropped += 1;
        }
      } catch (error) {
        // Network/parse failure that escaped analyzeOne's own handling —
        // conversation stays unprocessed, tomorrow's run retries it.
        console.error(`Training pipeline: failed to analyze conversation ${conversation.id}:`, error);
        failed += 1;
      }
    }

    return { processed: conversations.length, kept, dropped, failed };
  }

  /** Analyzes ONE specific conversation on demand — used by the Training
   * Arena's "End session & review" button, bypassing the batch/
   * unprocessed-queue machinery `run()` uses. Reuses the exact same
   * extraction logic (analyzeOne) so a Training Arena session and a real
   * customer conversation get identically-shaped findings either way. */
  async analyzeConversationById(conversationId: string): Promise<{
    businessId: string;
    verdict: string;
    findings: string;
  }> {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    // Idempotent — a double-click on "End session & review" (or any other
    // retry) would otherwise crash on ChatAnalysis.conversationId's
    // unique constraint, the same failure class already fixed once for
    // the batch pipeline (see unprocessedConversations()'s comment).
    // Re-analyzing wastes nothing here besides an LLM call, so simplest
    // fix is just to skip straight to returning the existing row.
    const existing = await prisma.chatAnalysis.findUnique({ where: { conversationId } });

    if (!existing) {
      await this.analyzeOne({
        id: conversation.id,
        businessId: conversation.businessId,
        messages: conversation.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
      });
    }

    // ChatAnalysis.conversationId is @unique, so this is exactly the row
    // analyzeOne() just wrote (or the pre-existing one from above).
    const record = await prisma.chatAnalysis.findUniqueOrThrow({ where: { conversationId } });

    return { businessId: conversation.businessId, verdict: record.verdict, findings: record.findings };
  }

  private async analyzeOne(conversation: {
    id: string;
    businessId: string;
    messages: { id: string; role: string; content: string }[];
  }): Promise<string> {
    const aiConfig = await this.aiConfig.getCurrent(conversation.businessId);

    const feedbackByMessageId = await this.messageFeedback.forMessageIds(
      conversation.messages.map((m) => m.id)
    );

    const transcript = conversation.messages
      .map((m) => {
        const feedback = feedbackByMessageId.get(m.id);
        if (!feedback) return `${m.role}: ${m.content}`;

        const annotation =
          feedback.verdict === "fail"
            ? `[Human QA: FAIL${feedback.note ? ` — ${feedback.note}` : ""}]`
            : "[Human QA: PASS]";

        return `${m.role}: ${m.content} ${annotation}`;
      })
      .join("\n");

    const userPrompt = buildChatAnalysisUserPrompt({
      aiBrainSystemPrompt: aiConfig.systemPrompt,
      transcript,
    });

    const result = await this.reasoning.ask(CHAT_ANALYSIS_SYSTEM_PROMPT, userPrompt);

    const parsed = parseJsonResponse<RawAnalysisResponse>(result.content);

    if (!parsed || !parsed.verdict || !VALID_VERDICTS.has(parsed.verdict)) {
      // Malformed/unparseable output — never crashes the batch, just
      // records the failure as its own finding so it's still visible in
      // the audit trail.
      await this.analysis.recordAnalysisAndMarkProcessed({
        conversationId: conversation.id,
        businessId: conversation.businessId,
        verdict: "dropped_irrelevant",
        findings: `Analysis failed: reasoning LLM returned an unparseable response. Raw: ${result.content.slice(0, 300)}`,
        examples: [],
      });
      return "dropped_irrelevant";
    }

    const examples =
      parsed.verdict === "kept" && parsed.instruction && parsed.input && parsed.output
        ? [
            {
              instruction: parsed.instruction,
              input: parsed.input,
              output: `<think>${result.reasoning}</think>${parsed.output}`,
            },
          ]
        : [];

    await this.analysis.recordAnalysisAndMarkProcessed({
      conversationId: conversation.id,
      businessId: conversation.businessId,
      verdict: parsed.verdict,
      findings: parsed.findings ?? "(no findings text returned)",
      examples,
    });

    for (const example of examples) {
      await appendJsonl({
        businessId: conversation.businessId,
        conversationId: conversation.id,
        ...example,
      });
    }

    return parsed.verdict;
  }
}

function parseJsonResponse<T>(raw: string): T | null {
  try {
    // Models occasionally wrap JSON in markdown fences despite
    // instructions not to — strip them defensively before parsing.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

async function appendJsonl(record: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(JSONL_PATH), { recursive: true });
  await fs.appendFile(JSONL_PATH, JSON.stringify(record) + "\n", "utf8");
}
