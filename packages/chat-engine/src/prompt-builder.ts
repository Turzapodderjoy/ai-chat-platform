import { ChatMessage } from "./message";
import {
  systemTemplate,
  businessTemplate,
} from "./templates";

export class PromptBuilder {
  build(
    messages: ChatMessage[],
    context: string[]
  ) {
    const history = messages
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    const knowledge = context.join("\n");

    return `
${systemTemplate}

${businessTemplate}

Knowledge Base

${knowledge}

Conversation

${history}

Assistant:
`;
  }
}