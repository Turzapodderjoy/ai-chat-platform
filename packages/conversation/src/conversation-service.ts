import { Session } from "./session";

export class ConversationService {

  private readonly sessions =
    new Map<string, Session>();

  create(
    businessId: string,
    userId: string
  ): Session {

    const session =
      new Session(
        crypto.randomUUID(),
        businessId,
        userId
      );

    this.sessions.set(
      session.id,
      session
    );

    return session;
  }

  get(
    sessionId: string
  ): Session | undefined {

    return this.sessions.get(
      sessionId
    );
  }

  delete(
    sessionId: string
  ): void {

    this.sessions.delete(
      sessionId
    );
  }
}