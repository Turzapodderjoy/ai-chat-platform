import type { PromptInput, PromptOutput } from "./types";

export class PromptEngine {
  build(input: PromptInput): PromptOutput {
    const context =
      input.context.length > 0
        ? input.context.join("\n\n")
        : "No relevant context found.";

    const prompt = `
${input.systemPrompt}

------------------------
Knowledge Base
------------------------

${context}

------------------------
User
------------------------

${input.userMessage}

------------------------
Assistant
------------------------
`.trim();

    return {
      prompt,
    };
  }
}