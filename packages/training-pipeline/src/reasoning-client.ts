import { retryWithBackoff } from "@ai-chat-platform/ai-manager";

// Groq's OpenAI-compatible endpoint — same shape as packages/groq, but
// this client is deliberately standalone (fetch-based, single dedicated
// key, simple retry) rather than routed through AIManager's multi-
// provider rotation: this pipeline has exactly one reasoning provider by
// design (a dedicated key so it never competes with live chat's quota),
// so the full rotation/failover machinery would be pure overhead here.
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

export interface ReasoningResult {
  /** The model's answer to the prompt — expected to be a JSON string per
   * the caller's system prompt, but returned raw; parsing is the
   * caller's job so a malformed response doesn't crash this client. */
  content: string;
  /** gpt-oss-120b returns real chain-of-thought in its own response
   * field, separate from the answer — this is what becomes the
   * <think>...</think> wrapper, not something the model has to be told
   * to format correctly inside `content`. */
  reasoning: string;
}

interface GroqChatResponse {
  choices?: { message?: { content?: string; reasoning?: string } }[];
}

export class ReasoningClient {
  constructor(private readonly apiKey: string) {}

  async ask(systemPrompt: string, userPrompt: string): Promise<ReasoningResult> {
    return retryWithBackoff(
      async () => {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Reasoning LLM request failed (${res.status}): ${body}`);
        }

        const data = (await res.json()) as GroqChatResponse;
        const message = data.choices?.[0]?.message;

        return {
          content: message?.content ?? "",
          reasoning: message?.reasoning ?? "",
        };
      },
      {
        attempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        shouldRetry: (error) =>
          error instanceof Error && /\((429|5\d\d)\)/.test(error.message),
      }
    );
  }
}
