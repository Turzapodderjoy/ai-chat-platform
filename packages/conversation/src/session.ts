import { ConversationMemory } from "./memory";

export class Session {

  readonly memory =
    new ConversationMemory();

  constructor(
    public readonly id: string,
    public readonly businessId: string,
    public readonly userId: string
  ) {}
}