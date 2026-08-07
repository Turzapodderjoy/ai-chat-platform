import type { PromptInput, PromptOutput } from "./types";

export class PromptEngine {
  build(input: PromptInput): PromptOutput {
    // Numbered so the model treats each retrieved chunk as a distinct
    // record/fact instead of one blurred blob — a bare "\n\n" join makes
    // it easy to lose track of where one chunk ends and the next begins,
    // especially with several short tabular chunks back to back.
    const context =
      input.context.length > 0
        ? input.context.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")
        : "No relevant context found.";

    const history =
      input.history && input.history.length > 0
        ? input.history.map((turn) => `${turn.role}: ${turn.content}`).join("\n")
        : null;

    const userPrompt = `
------------------------
Knowledge Base
------------------------

${context}
${history ? `
------------------------
Conversation so far
------------------------

${history}
` : ""}
------------------------
User
------------------------

${input.userMessage}
`.trim();

    return {
      systemPrompt: input.systemPrompt,
      userPrompt,
    };
  }
}
