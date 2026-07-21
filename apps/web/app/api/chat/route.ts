import { NextRequest, NextResponse } from "next/server";
import { AIManager } from "@ai-chat-platform/ai-manager";
import { GroqProvider } from "@ai-chat-platform/groq";

const manager = new AIManager();

manager.register(new GroqProvider());

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    const result = await manager.chat(message);

    return NextResponse.json({
      success: true,
      provider: result.provider,
      response: result.response,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}