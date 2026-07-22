import { NextRequest, NextResponse } from "next/server";

import { AIManager } from "@ai-chat-platform/ai-manager";
import {
  ChatEngine,
  SessionManager,
} from "@ai-chat-platform/chat-engine";
import { GroqProvider } from "@ai-chat-platform/groq";
import { KnowledgeBase } from "@ai-chat-platform/knowledge-base";

const manager = new AIManager();

manager.register(new GroqProvider());

const kb = new KnowledgeBase();

kb.add({
  id: "company",
  title: "Company Information",
  content: `
AI Chat Platform

Owner: Joy

Support Email:
support@demo.com

Office Hours:
Sunday to Thursday
9 AM to 6 PM

Refund Policy:
Refunds are accepted within 7 days.
`,
});

const engine = new ChatEngine(
  manager,
  kb
);

const sessionManager = new SessionManager();

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    const sessionId =
      req.headers.get("x-session-id") ??
      crypto.randomUUID();

    const session = sessionManager.get(sessionId);

    const result = await engine.send(session, message);

    return NextResponse.json({
      success: true,
      sessionId,
      provider: result.provider,
      response: result.response,
      history: session.conversation.history(),
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
      }
    );
  }
}