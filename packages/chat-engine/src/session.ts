import { Conversation } from "./conversation";

export class ChatSession {
  readonly id: string;

  readonly conversation = new Conversation();

  constructor(id: string) {
    this.id = id;
  }
}