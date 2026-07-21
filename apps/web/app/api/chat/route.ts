import { NextRequest, NextResponse } from "next/server";

import { AIManager } from "@ai-chat-platform/ai-manager";
import {
  ChatEngine,
  SessionManager,
} from "@ai-chat-platform/chat-engine";
import { GroqProvider } from "@ai-chat-platform/groq";


const manager = new AIManager();

manager.register(new GroqProvider());

const engine = new ChatEngine(manager);

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