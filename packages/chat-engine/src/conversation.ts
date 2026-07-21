import { ChatMessage } from "./message";

export class Conversation {
  messages: ChatMessage[] = [];

  add(message: ChatMessage) {
    this.messages.push(message);
  }

  history() {
    return this.messages;
  }

  clear() {
    this.messages = [];
  }
}