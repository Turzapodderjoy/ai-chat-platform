import { ChatSession } from "./session";

export class SessionManager {
  private sessions = new Map<string, ChatSession>();

  get(sessionId: string): ChatSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = new ChatSession(sessionId);
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  remove(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  clear() {
    this.sessions.clear();
  }

  count() {
    return this.sessions.size;
  }
}