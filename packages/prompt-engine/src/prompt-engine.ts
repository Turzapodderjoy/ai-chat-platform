import type { PromptInput, PromptOutput } from "./types";

export class PromptEngine {
  build(input: PromptInput): PromptOutput {
    const context =
      input.context.length > 0
        ? input.context.join("\n\n")
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
