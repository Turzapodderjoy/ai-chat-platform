import { AIManager } from "@ai-chat-platform/ai-manager";
import { PromptEngine } from "@ai-chat-platform/prompt-engine";
import { Retriever, RetrievedChunk } from "@ai-chat-platform/retriever";
import { ConversationService, ConversationMessage } from "@ai-chat-platform/conversation";
import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { AiConfigService } from "@ai-chat-platform/ai-config";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { MasterCsvService } from "@ai-chat-platform/knowledge-refresh";

import { ChatUsageLog } from "./chat-usage-log";
import { ResponseCache } from "./response-cache";
import type {
  ChatRequest,
  ChatResponse,
  ChatSource,
} from "./types";

// Admin-only provenance for an answer — which page/document it actually
// came from, so a wrong or missing answer can be traced back to exactly
// what the AI read (or didn't). Deduped by source label (a page can
// contribute several chunks; only its best score matters here), capped
// so a heavily-expanded retrieval (see VectorStoreRetriever's sibling-
// chunk pull-in) doesn't turn this into a huge list.
const MAX_SOURCES_SHOWN = 6;

function buildSources(retrieved: RetrievedChunk[]): ChatSource[] {
  const bestByLabel = new Map<string, { score: number; embeddingProvider?: string }>();

  for (const chunk of retrieved) {
    const label =
      (chunk.metadata?.url as string | undefined) ??
      (chunk.metadata?.filename as string | undefined) ??
      "unknown source";
    const existing = bestByLabel.get(label);
    if (!existing || chunk.score > existing.score) {
      bestByLabel.set(label, {
        score: chunk.score,
        embeddingProvider: chunk.metadata?.embeddingProvider as string | undefined,
      });
    }
  }

  return Array.from(bestByLabel.entries())
    .map(([label, { score, embeddingProvider }]) => ({ label, score, embeddingProvider }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SOURCES_SHOWN);
}

// Emitted by the LLM itself (see the system prompt's ANSWERING FROM THE
// KNOWLEDGE BASE section) when it can't help from the knowledge base OR
// the customer explicitly asks for a human — the ONLY reliable, language-
// agnostic way to know that, since retrieval confidence measures how well
// the knowledge base matches the QUESTION, not whether the AI actually
// managed to answer it or whether the customer just typed "talk to a
// human". Before this, handoff was decided entirely from confidence
// BEFORE the LLM ever ran, so the AI could say "let me connect you with a
// team member" in its own reply and nothing would actually happen — no
// handoff record, invisible to the Handoffs queue, customer stuck talking
// to the bot forever.
const HANDOFF_MARKER = "[[NEEDS_HUMAN]]";

// Belt-and-suspenders for HANDOFF_MARKER: the system prompt tells the AI
// to always append the marker when it offers a human handoff, but
// instruction-following on a magic string isn't 100% reliable —
// especially in Bangla/Banglish generation, observed in real training
// analysis reports in two different ways: (1) the AI says "connecting
// you with a team member" but drops the marker, and (2) the AI admits
// "I don't have this information" without offering a handoff OR the
// marker at all, even though the system prompt requires both whenever it
// admits it can't answer. "team member"/"টিম মেম্বার" are reserved by this
// system's own canned messages for case (1); the "don't have
// information" phrasings below are the system prompt's own canonical
// admission language for case (2) — matching them is a safe,
// low-false-positive fallback since a real customer question is never
// phrased this way, only the AI's own admission is.
const HANDOFF_INTENT_FALLBACK =
  /team member|টিম মেম্বার|knowledge base|তথ্য (নেই|নাই)|tothyo[^.]*(nei|nai)|don'?t have (that|this|any) (specific )?information/i;

// The handoff summary is a short internal note for a human agent, not a
// customer-facing answer — a smaller cap is appropriate and keeps this
// background call cheap regardless of which provider handles it.
const SUMMARY_MAX_TOKENS = 300;

const HANDOFF_MESSAGE_EN =
  "I don't have any information about that in our knowledge base. Let me connect you with a team member who can help — they'll pick up right where this conversation left off.";

const HANDOFF_MESSAGE_BN =
  "এই বিষয়ে আমাদের নলেজ বেসে কোনো তথ্য নেই। আমি আপনাকে একজন টিম মেম্বারের সাথে সংযুক্ত করছি — তিনি এই কথোপকথন যেখানে শেষ হয়েছে সেখান থেকেই শুরু করবেন।";

const ALREADY_WAITING_MESSAGE_EN =
  "You're connected with a human agent — they'll see your message and reply here shortly.";

const ALREADY_WAITING_MESSAGE_BN =
  "আপনি একজন মানব এজেন্টের সাথে সংযুক্ত আছেন — তিনি শীঘ্রই এখানে আপনার বার্তা দেখে উত্তর দেবেন।";

const HANDOFF_MESSAGE_BANGLISH =
  "Dukkhito, amader knowledge base e ei bishoye kono tothyo nei. Ami apnake ekjon team member-er sathe connect kore dicchi — uni ei conversation ja jekhane sesh hoyeche sekhan theke shuru korben.";

const ALREADY_WAITING_MESSAGE_BANGLISH =
  "Apni ekjon human agent-er sathe connected achen — tini shiggiri apnar message dekhe eikhane reply korben.";

// A plain greeting has no real content to reason about, yet letting the
// LLM generate a reply for it is where nonsense like "How can Amader
// help you today?" comes from — the "always say Amader, never Apnar"
// business-identity rule (meant for Bangla/Banglish sentences) bleeding
// into an English sentence where "Amader" isn't even a word. A greeting
// is 100% predictable, so it gets a fixed, always-correct reply instead
// of a roll of the dice — also skips retrieval/LLM entirely, so it's
// instant and free. Must match the ENTIRE trimmed message, not just
// contain a greeting word, so "hi, what's the price of X" still goes
// through the real pipeline.
const GREETING_BN = /^(হ্যালো|হাই|সালাম|আসসালামু\s*আলাইকুম)[।!?\s]*$/;
const GREETING_BANGLISH = /^(assalamu\s*[-']?\s*alaikum|salam|hi|hello|hey|heyy+|yo|ki\s*obostha|kemon\s*(acho|achen|acen)|kmn\s*(acho|achen))[.!?\s]*$/i;
const GREETING_EN = /^(hi+|hello|hey+|hiya|yo|good\s*(morning|afternoon|evening))[.!?\s]*$/i;

const GREETING_MESSAGE_EN = "Hi! How can I help you today?";
const GREETING_MESSAGE_BN = "হ্যালো! আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?";
const GREETING_MESSAGE_BANGLISH = "Hi! Ami apnake ki bhabe shahajjo korte pari?";

/** Returns the canned greeting reply if this message is nothing but a
 * greeting, else null. Bangla-script and the common Banglish greeting
 * words (salam, assalamualaikum, kemon achen) resolve their own
 * language directly; a bare "hi"/"hello" defers to the business's
 * language setting/heuristic via cannedMessageLanguage, same as every
 * other canned message in this file. */
function greetingReply(languageMode: string, userMessage: string): string | null {
  const trimmed = userMessage.trim();

  if (GREETING_BN.test(trimmed)) {
    return GREETING_MESSAGE_BN;
  }

  if (GREETING_BANGLISH.test(trimmed) && !GREETING_EN.test(trimmed)) {
    return GREETING_MESSAGE_BANGLISH;
  }

  if (GREETING_EN.test(trimmed)) {
    const lang = cannedMessageLanguage(languageMode, userMessage);
    return lang === "bangla" ? GREETING_MESSAGE_BN : lang === "banglish" ? GREETING_MESSAGE_BANGLISH : GREETING_MESSAGE_EN;
  }

  return null;
}

// ponytail: Bangla-script detection only (Unicode block ঀ-৿) —
// cheap and exact, no AI call needed for these canned messages. Banglish
// (romanized Bengali) isn't reliably detectable by regex, so it falls
// back to the English canned message; real Banglish handling is the
// system prompt's job, for actual LLM-generated answers.
function isBangla(text: string): boolean {
  return /[ঀ-৿]/.test(text);
}

/** Which register to use for the canned (non-LLM) messages below — when
 * the business has locked a language, canned messages respect the lock
 * too instead of mirroring the customer like "auto" mode does. */
function cannedMessageLanguage(languageMode: string, userMessage: string): "english" | "bangla" | "banglish" {
  if (languageMode === "english" || languageMode === "bangla" || languageMode === "banglish") {
    return languageMode;
  }
  return isBangla(userMessage) ? "bangla" : "english";
}

/** Prepended-none, appended-last so it reads as the most recent/most
 * specific instruction — a strong override the model can't miss,
 * regardless of how the rest of the (fully admin-editable) system
 * prompt is worded. Returns "" for "auto", meaning no override at all:
 * the base prompt's own "match the customer's register" instructions
 * apply exactly as they always have. */
function languageLockInstruction(languageMode: string): string {
  const LANGUAGE_LABEL: Record<string, string> = {
    english: "English",
    bangla: "natural Bangla (Bengali script)",
    banglish: "Banglish (Bangla written in Latin/Roman letters)",
  };

  const label = LANGUAGE_LABEL[languageMode];
  if (!label) return "";

  return `\n\nHARD LANGUAGE LOCK — STRICT, NON-NEGOTIABLE, OVERRIDES EVERYTHING ABOVE (including any "match the customer's language" instruction elsewhere in this prompt): this business has locked ALL replies to ${label}. This is a hard setting, not a preference — there is no exception to it, ever.
- Understand the customer's message in whatever language or register they actually wrote it in — that part is unrestricted.
- Your reply, however, is ALWAYS in ${label} — every single message, with zero exceptions.
- Do NOT switch language mid-conversation. Do NOT mirror the customer's language. Do NOT switch even if the customer explicitly asks you to reply in a different language, insists, or writes only in that other language for the rest of the conversation.
- If any earlier instruction in this prompt says to match/mirror the customer's language, that instruction is overridden by this lock and no longer applies.`;
}

// Folds recent turns into the string embedded for retrieval — a bare
// "price?" carries almost no signal alone, but "is X authentic? ...
// price?" retrieves the right chunks. Last 4 messages (2 full turns),
// not just 2 (1 turn) — confirmed live: a real 3-question narrowing
// flow ("air compressor?" -> "cheapest one?" -> "anything cheaper than
// THAT?") lost the "air compressor" category anchor by the third
// question with only a 2-message window, and the answer came back with
// an unrelated cheap product (a drill machine) instead. Still
// deliberately bounded, not the whole history, so retrieval stays
// focused on the current subject rather than diluted by genuinely old,
// unrelated turns.
function buildRetrievalQuery(history: ConversationMessage[], currentMessage: string): string {
  const recent = history.slice(-4).map((m) => m.content).join(" ");
  return recent ? `${recent} ${currentMessage}`.trim() : currentMessage;
}

export class ChatService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly retriever: Retriever,
    private readonly prompts: PromptEngine,
    private readonly ai: AIManager,
    private readonly embeddings: EmbeddingManager,
    private readonly responseCache: ResponseCache,
    private readonly usageLog: ChatUsageLog,
    private readonly aiConfig: AiConfigService,
    private readonly vectorStore: VectorStoreManager,
    private readonly masterCsv: MasterCsvService
  ) {}

  // 200K chars (~50K tokens) — conservative, safely under the smallest
  // context window among every currently-rotated provider (Groq/Mistral/
  // Cerebras are ~128K tokens), leaving headroom for system prompt,
  // history, and output. A business whose whole indexed knowledge base
  // fits under this budget skips retrieval entirely (see chat()) — the
  // same reason uploading a small doc straight into Gemini/ChatGPT "just
  // works": nothing needs to be found because nothing was left out.
  private static readonly FULL_CONTEXT_CHAR_BUDGET = 200_000;

  /** Null if the business's knowledge base is too large for full-context
   * mode (falls back to normal chunk retrieval) — otherwise every unique
   * chunk of text they have, shaped as RetrievedChunk[] so it's a drop-in
   * replacement for retriever.retrieve()'s return value. */
  private async getFullContextIfSmallEnough(
    businessId: string
  ): Promise<RetrievedChunk[] | null> {
    const texts = await this.vectorStore.listUniqueChunkTexts(businessId);
    const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

    if (texts.length === 0 || totalChars > ChatService.FULL_CONTEXT_CHAR_BUDGET) {
      return null;
    }

    return texts.map((text, i) => ({ id: `full-context-${i}`, text, score: 1 }));
  }

  /** The scheduled knowledge-refresh job's consolidated CSV — every
   * product/price/spec across every crawled page and uploaded document
   * for this business, in one place. Owner's own words: the AI should
   * scan this when answering, not just whatever a handful of top-K
   * chunks happened to surface. Always tried first and merged ALONGSIDE
   * (never instead of) normal retrieval/full-context below — the master
   * CSV only updates on its schedule, so live retrieval still covers
   * anything newer, and prose content the CSV doesn't include at all.
   * Null if none exists yet or it's grown past a sane single-prompt
   * budget (same reasoning/size as FULL_CONTEXT_CHAR_BUDGET). */
  private async getMasterCsvChunkIfAvailable(businessId: string): Promise<RetrievedChunk | null> {
    const csv = await this.masterCsv.get(businessId);
    if (!csv || !csv.content || csv.content.length > ChatService.FULL_CONTEXT_CHAR_BUDGET) {
      return null;
    }

    return { id: "master-csv", text: csv.content, score: 1 };
  }

  async chat(
    request: ChatRequest
  ): Promise<ChatResponse> {

    const businessId = request.businessId ?? "default";

    // Read live, every request — this is the whole point of moving it
    // out of hardcoded constants: a dashboard edit takes effect on the
    // very next message, no redeploy or restart.
    const config = await this.aiConfig.getCurrent(businessId);

    const conversation =
      await this.conversations.getOrCreate(
        request.sessionId,
        businessId,
        request.isTraining ? "trainer" : "anonymous",
        request.isTraining ?? false,
        request.channel ?? "website",
        request.externalUserId ?? null
      );

    // Fetched before this turn's message is recorded, so it's "everything
    // said so far" — exactly what the prompt needs to resolve a follow-up
    // like "the price" against whatever product was just discussed.
    const priorHistory =
      await this.conversations.history(
        request.sessionId,
        config.historyTurns
      );

    await this.conversations.addMessage(
      request.sessionId,
      "user",
      request.message
    );

    // Already being handled by a human — don't let the bot jump back in.
    // (Doesn't record this as a message: the customer's real messages
    // while waiting should just accumulate for the agent to read, not
    // get interleaved with a repeated "you're waiting" notice.) Skipped
    // entirely for a Training Arena session — the whole point there is
    // to keep talking to the AI after it hands off, to correct exactly
    // that behavior, not to simulate the real "you're waiting" UX.
    if (!conversation.isTraining && conversation.handoffStatus !== "bot") {
      const lang = cannedMessageLanguage(config.languageMode, request.message);
      return {
        answer:
          lang === "bangla"
            ? ALREADY_WAITING_MESSAGE_BN
            : lang === "banglish"
              ? ALREADY_WAITING_MESSAGE_BANGLISH
              : ALREADY_WAITING_MESSAGE_EN,
        provider: "human",
        tokens: 0,
        confidence: 0,
        handoff: true,
      };
    }

    // A plain "hi"/"salam" gets a fixed, always-grammatical reply
    // instead of an LLM roll of the dice — see greetingReply's own
    // comment for why. Checked after the already-waiting handoff (a
    // human taking over still wins) but before retrieval/LLM, so it's
    // instant and costs nothing.
    const greeting = greetingReply(config.languageMode, request.message);
    if (greeting) {
      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        greeting,
        "canned"
      );

      this.usageLog.record({
        chatId: request.sessionId,
        provider: "canned",
        tokens: 0,
        confidence: 1,
        createdAt: new Date().toISOString(),
      });

      return {
        answer: greeting,
        provider: "canned",
        tokens: 0,
        confidence: 1,
        messageId: savedMessage.id,
      };
    }

    // A bare follow-up ("price?" right after "is the X authentic?") has
    // almost no retrievable signal on its own — embedding just that turn
    // finds weak/wrong chunks, confidence falls under the handoff floor,
    // and the conversation gets handed off before the history-aware
    // prompt below ever gets a chance to resolve "price of what". Folding
    // the most recent turn into the RETRIEVAL query (not the final answer
    // prompt, which already gets full history correctly) fixes this —
    // it's the same "follow-ups need context" reasoning the cache skip
    // just below already applies, just applied one step earlier.
    const retrievalQuery = buildRetrievalQuery(priorHistory, request.message);

    const queryEmbeddingResult =
      await this.embeddings.embed(retrievalQuery);
    const queryEmbedding = queryEmbeddingResult.embedding;
    const queryEmbeddingProvider = queryEmbeddingResult.provider;

    // The semantic cache only makes sense for a standalone, context-free
    // question (classic FAQ). A short follow-up like "price" is only
    // meaningful alongside the conversation before it, so skip the cache
    // once there IS prior history — otherwise it could confidently return
    // a cached answer for a completely different product.
    const cached =
      priorHistory.length === 0
        ? this.responseCache.find(queryEmbedding, businessId, queryEmbeddingProvider)
        : null;

    if (cached) {
      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        cached.answer,
        `${cached.provider} (cached)`
      );

      this.usageLog.record({
        chatId: request.sessionId,
        provider: `${cached.provider} (cached)`,
        tokens: 0,
        confidence: cached.confidence,
        createdAt: new Date().toISOString(),
      });

      return {
        answer: cached.answer,
        provider: cached.provider,
        tokens: 0,
        confidence: cached.confidence,
        cached: true,
        messageId: savedMessage.id,
      };
    }

    // Deliberately NOT passing queryEmbedding/queryEmbeddingProvider here
    // (unlike the cache lookup above, which legitimately wants one fixed
    // vector to key on) — retrieval needs to search every embedding
    // provider's space and merge by score, not just whichever single
    // provider rotation picked for the cache key. See
    // VectorStoreRetriever.retrieve()'s own comment for why.
    const fullContext = await this.getFullContextIfSmallEnough(businessId);

    // full-context mode already hands the model every chunk this
    // business has (tabular included) — the master CSV would be pure
    // duplication there. It matters for the businesses that DON'T
    // qualify for full-context (too large): those still only get top-K
    // retrieval by default, so prepending the master CSV is what
    // actually gives the model the whole table at once for them.
    //
    // The master CSV lookup (one indexed DB read) and retrieval (multi-
    // provider embedding + vector search) are independent — run them in
    // parallel, not sequentially, so adding the CSV lookup doesn't add
    // its own latency on top of retrieval's. Confirmed live: awaiting
    // them one after another pushed an already-borderline-slow business
    // past this route's 12s hard timeout on every call.
    const __tRetrieveStart = Date.now();
    const [masterCsvChunk, retrievedFromSearch] = fullContext
      ? [null, null]
      : await Promise.all([
          this.getMasterCsvChunkIfAvailable(businessId),
          this.retriever.retrieve(retrievalQuery, { businessId }),
        ]);
    console.log(`[perf] retrieve took ${Date.now() - __tRetrieveStart}ms`);

    const retrievedRaw =
      fullContext ??
      [...(masterCsvChunk ? [masterCsvChunk] : []), ...(retrievedFromSearch ?? [])];

    // Groq's per-account token-per-minute budget (12,000 on the 70B
    // model at last check, HALF that on the 8B one) counts one large
    // request's own tokens against it, not just cumulative usage -- a
    // single call over budget always 413s, no amount of waiting fixes
    // it. Sibling-chunk expansion capped per-document (see
    // vector-store-retriever.ts) but nothing capped the TOTAL across
    // every matched document -- a multi-clause question matching
    // several products could still stack up 80k+ chars (~20k tokens)
    // and blow the limit outright. fullContext/master-CSV already have
    // their own explicit budget (FULL_CONTEXT_CHAR_BUDGET) for the same
    // reason; this applies it to the normal top-K + sibling-expansion
    // path too. Keeps the highest-scored chunks, drops the rest --
    // exactly what "top-K" already means, just enforced by size as well
    // as count.
    // Raised alongside the retriever's wider top-K (see
    // vector-store-retriever.ts) -- still leaves headroom under Groq
    // 70B's 12,000 TPM cap after the ~1,460-token system prompt, history,
    // and the maxTokens generation reserve (up to 1,536) are counted in.
    const RETRIEVAL_CONTEXT_CHAR_BUDGET = 32_000;
    let runningChars = 0;
    const retrieved = fullContext
      ? retrievedRaw
      : [...retrievedRaw]
          .sort((a, b) => b.score - a.score)
          .filter((chunk) => {
            if (runningChars >= RETRIEVAL_CONTEXT_CHAR_BUDGET) return false;
            runningChars += chunk.text.length;
            return true;
          });
    console.log(
      `[perf] retrieved ${retrieved.length}/${retrievedRaw.length} chunks, ${retrieved.reduce((s, c) => s + c.text.length, 0)} chars`
    );

    // Top retrieval score doubles as a rough "grounding confidence" for
    // this answer — how well the knowledge base actually backs it. Shown
    // in the dashboard; no longer gates whether the AI gets to attempt
    // an answer (see the retrieved.length check below for why).
    const confidence = retrieved[0]?.score ?? 0;
    const sources = buildSources(retrieved);

    // Only skip the LLM entirely when there is LITERALLY nothing indexed
    // for this business (a genuinely empty knowledge base) — this used to
    // check `confidence < config.handoffFloor` instead, which also fired
    // for perfectly normal messages with low semantic similarity to any
    // chunk (a plain "hello" scores ~0 against a product catalog with no
    // greeting content) and handed off BEFORE the AI ever got a chance to
    // greet naturally, exactly as its own system prompt already tells it
    // to. The AI's own [[NEEDS_HUMAN]] marker (below) is now the accurate
    // decision-maker for "can't help"/"customer asked for a human" — this
    // check's only remaining job is to avoid wasting an LLM call on a
    // business with zero indexed content at all. Training Arena sessions
    // never take this shortcut regardless of retrieval results — the
    // platform-wide Training Arena has NO knowledge base by design (it's
    // for testing general behavior, not product content), so this check
    // would otherwise fire on every single message there and the AI
    // would never actually be reached — defeating the entire feature.
    if (!request.isTraining && retrieved.length === 0) {
      const fullHistory = [
        ...priorHistory,
        { id: "pending", role: "user" as const, content: request.message, provider: null, sources: null, confidence: null, createdAt: new Date() },
      ];
      const { summary, tokens: summaryTokens } = await this.buildHandoffSummary(fullHistory);
      await this.conversations.requestHandoff(
        request.sessionId,
        "empty_knowledge_base",
        summary
      );

      const handoffLang = cannedMessageLanguage(config.languageMode, request.message);
      const handoffMessage =
        handoffLang === "bangla"
          ? HANDOFF_MESSAGE_BN
          : handoffLang === "banglish"
            ? HANDOFF_MESSAGE_BANGLISH
            : HANDOFF_MESSAGE_EN;

      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        handoffMessage,
        "handoff",
        sources,
        confidence
      );

      this.usageLog.record({
        chatId: request.sessionId,
        provider: "handoff",
        tokens: summaryTokens,
        confidence,
        createdAt: new Date().toISOString(),
      });

      return {
        answer: handoffMessage,
        provider: "handoff",
        tokens: summaryTokens,
        confidence,
        handoff: true,
        messageId: savedMessage.id,
        sources,
      };
    }

    const prompt =
      this.prompts.build({
        systemPrompt: config.systemPrompt + languageLockInstruction(config.languageMode),
        context:
          retrieved.map(chunk => chunk.text),
        history:
          priorHistory.map(m => ({ role: m.role, content: m.content })),
        userMessage:
          request.message,
      });

    console.log(
      `[perf] prompt chars: system=${prompt.systemPrompt.length} user=${prompt.userPrompt.length}`
    );
    const __tAiStart = Date.now();
    const aiResponse =
      await this.ai.chat(
        prompt.userPrompt,
        {
          temperature: config.temperature,
          systemPrompt: prompt.systemPrompt,
          maxTokens: config.maxTokens,
          topP: config.topP ?? undefined,
          frequencyPenalty: config.frequencyPenalty ?? undefined,
          presencePenalty: config.presencePenalty ?? undefined,
          stop: config.stopSequences
            ? config.stopSequences.split(",").map(s => s.trim()).filter(Boolean)
            : undefined,
          seed: config.seed ?? undefined,
        }
      );
    console.log(`[perf] ai.chat took ${Date.now() - __tAiStart}ms, provider=${aiResponse.provider}`);

    // The AI itself decided (see HANDOFF_MARKER's comment) — strip the
    // marker before the customer ever sees it either way.
    const wantsHandoff =
      aiResponse.response.includes(HANDOFF_MARKER) ||
      HANDOFF_INTENT_FALLBACK.test(aiResponse.response);
    const cleanedAnswer = aiResponse.response.replaceAll(HANDOFF_MARKER, "").trim();

    let summaryTokens = 0;

    if (wantsHandoff) {
      const fullHistory = [
        ...priorHistory,
        { id: "pending", role: "user" as const, content: request.message, provider: null, sources: null, confidence: null, createdAt: new Date() },
      ];
      const built = await this.buildHandoffSummary(fullHistory);
      summaryTokens = built.tokens;
      await this.conversations.requestHandoff(
        request.sessionId,
        "ai_requested",
        built.summary
      );
    }

    const savedMessage = await this.conversations.addMessage(
      request.sessionId,
      "assistant",
      cleanedAnswer,
      wantsHandoff ? `${aiResponse.provider} (handoff)` : aiResponse.provider,
      sources,
      confidence
    );

    this.usageLog.record({
      chatId: request.sessionId,
      provider: wantsHandoff ? "handoff" : aiResponse.provider,
      // Includes the handoff summary's own LLM call cost when applicable
      // — previously silently dropped from the per-chat total (though it
      // was still counted in the aggregate provider totals), which made
      // the two token displays inconsistent for any handed-off chat.
      tokens: aiResponse.tokens + summaryTokens,
      confidence,
      createdAt: new Date().toISOString(),
    });

    // Same reasoning as the lookup above — only cache answers to
    // standalone first questions, not context-dependent follow-ups. Also
    // never cache a handoff — it's a decline, not a reusable answer, and
    // caching it would keep returning "let me connect you" for a
    // question a fixed knowledge base gap might answer correctly later.
    if (priorHistory.length === 0 && !wantsHandoff) {
      this.responseCache.store(
        queryEmbedding,
        businessId,
        request.message,
        cleanedAnswer,
        aiResponse.provider,
        confidence,
        queryEmbeddingProvider
      );
    }

    return {
      answer: cleanedAnswer,
      provider: aiResponse.provider,
      tokens: aiResponse.tokens,
      confidence,
      handoff: wantsHandoff || undefined,
      messageId: savedMessage.id,
      sources,
    };
  }

  private async buildHandoffSummary(
    history: ConversationMessage[]
  ): Promise<{ summary: string; tokens: number }> {
    const transcript = history
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    try {
      const result = await this.ai.chat(
        `Summarize this customer conversation in 2-3 sentences for a support agent taking over. Focus on what the customer wants and what's unresolved. The conversation may be in Bangla, Banglish, or English — write the summary in English regardless, since it's for internal review.\n\n${transcript}`,
        { maxTokens: SUMMARY_MAX_TOKENS }
      );
      return { summary: result.response, tokens: result.tokens };
    } catch {
      // Summary is a nice-to-have; never block the handoff on it.
      return {
        summary: `Conversation could not be auto-summarized. Last message: "${history.at(-1)?.content ?? ""}"`,
        tokens: 0,
      };
    }
  }
}
