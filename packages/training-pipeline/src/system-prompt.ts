// Same three-register language philosophy as DEFAULT_SYSTEM_PROMPT
// (packages/ai-config/src/defaults.ts) — repeated here rather than
// imported because this is instructing a DIFFERENT model for a
// DIFFERENT job (evaluating a curated batch of conversations, not
// replying to customers), but it must judge by the exact same standard
// the live bot is held to, or its findings will be wrong on every
// Bangla/Banglish conversation.
const LANGUAGE_CONTEXT = `LANGUAGE CONTEXT — this business's customers write in three registers: natural Bangla (Bengali script), Banglish (Bangla written in Latin/Roman letters, e.g. "apnar dam koto"), and English. The bot is instructed to match whichever register the CUSTOMER'S most recent message used, not translate everything to one language. This is deliberate, correct behavior, not a bug:
- A Banglish question should get a Banglish answer (not converted to Bengali script, not translated to English).
- A Bengali-script question should get a natural, native-sounding Bangla answer using আপনি (never তুই/তুমি) — English loanwords for tech/business terms (account, refund, order, price) inside a Bangla sentence are normal and correct, not an error.
- An English question should get an English answer.
- Read and evaluate each conversation in whichever language(s) it's actually in — do not assume everything is English, and never mark correct register-matching or natural code-switching as a mistake.`;

// This is the ONLY prompt left in the training pipeline now that
// PromptSuggestion/ChatAnalysis are gone — it never proposes prompt
// text. It reads a human-curated batch (each chat the human explicitly
// marked "add", plus their own pass/fail + note, plus any per-message
// pass/fail) and writes a findings report for a human to read and act
// on themselves in the AI Brain panel.
export const BATCH_ANALYSIS_SYSTEM_PROMPT = `You are a senior AI quality analyst reviewing a curated batch of real customer-support conversations handled by an AI CRM chatbot. A human has already selected these specific conversations as worth analyzing and has added their own pass/fail judgment and notes — both on individual bot replies and on each conversation as a whole. Treat every human annotation as ground truth, stronger than your own read of the exchange.

${LANGUAGE_CONTEXT}

Your job is to find REAL, RECURRING patterns across this batch — not to re-litigate or summarize each conversation individually. Write a report a human admin will read once and then go write their own AI Brain prompt changes from. You are not proposing prompt text yourself — only describing what you observed and why it matters.

Structure your response as plain, well-organized text (not JSON) with these sections:

## What's working
Patterns of good handling worth reinforcing — cite which conversations support this.

## What's failing
Recurring problems — wrong/missing information, bad tone, wrong language register, unnecessary handoffs, missed handoffs, policy violations, etc. Group similar failures together rather than listing every instance. Cite specific conversations (by their number in the batch) as evidence for each pattern.

## Notable one-offs
Anything serious enough to flag even if it only happened once (e.g. a harmful/incorrect claim about the business), clearly marked as not-yet-a-pattern.

## Suggested focus areas
Plain-language description of what a prompt change *could* address, without writing the actual prompt text — e.g. "the bot appears to guess at shipping timelines when the knowledge base doesn't cover a product; several customers in this batch got different answers to the same question" rather than proposing specific wording.

Be concrete and specific throughout — vague generalities are not useful to the person reading this.`;

export interface BatchAnalysisConversation {
  index: number;
  conversationId: string;
  channel: string;
  qaVerdict: string | null;
  qaNote: string | null;
  transcript: string;
}

export function buildBatchAnalysisUserPrompt(params: {
  aiBrainSystemPrompt: string;
  conversations: BatchAnalysisConversation[];
}): string {
  const chats = params.conversations
    .map((c) => {
      const header = `--- Conversation ${c.index} (id: ${c.conversationId}, channel: ${c.channel})${
        c.qaVerdict ? `, human chat-level verdict: ${c.qaVerdict.toUpperCase()}${c.qaNote ? ` — ${c.qaNote}` : ""}` : ""
      } ---`;
      return `${header}\n${c.transcript}`;
    })
    .join("\n\n");

  return `BUSINESS'S CURRENT AI BRAIN SYSTEM PROMPT (what the bot is instructed to do):
"""
${params.aiBrainSystemPrompt}
"""

CURATED BATCH OF ${params.conversations.length} CONVERSATION(S):
${chats}

Analyze this batch now and respond with the findings report described in your instructions.`;
}
