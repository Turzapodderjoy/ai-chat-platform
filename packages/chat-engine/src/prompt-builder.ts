import { ChatMessage } from "./message";

export class PromptBuilder {
  build(messages: ChatMessage[]) {
    return messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
  }
}