import type { ConversationMessage } from "./types";

export class ConversationMemory {

  private readonly messages: ConversationMessage[] = [];

  add(message: ConversationMessage): void {
    this.messages.push(message);
  }

  history(): ConversationMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages.length = 0;
  }
}