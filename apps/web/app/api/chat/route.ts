import { NextRequest, NextResponse } from "next/server";
import { AIManager } from "@ai-chat-platform/ai-manager";
import { GroqProvider } from "@ai-chat-platform/groq";

/**
 * Only Groq is wired in right now. To add another provider later:
 *   1. Copy packages/ai-manager/src/providers/_template.ts to <name>.ts
 *      and implement it (see that file's comments).
 *   2. Export that provider from its own package or from ai-manager if
 *      you want a consolidated package surface.
 *   3. Import it here and register it, same as GroqProvider below.
 *   4. Add its name to failoverOrder, in whatever position you want
 *      it tried relative to the others.
 * AIManager itself never needs to change — that's the point of the
 * AIProvider interface boundary.
 */
const manager = new AIManager({ failoverOrder: ["groq"] });

manager.registerProvider(new GroqProvider(), [
  { id: "groq-key-1", value: process.env.GROQ_API_KEY ?? "" },
  // Add more keys here for automatic rotation once one gets rate-limited:
  // { id: "groq-key-2", value: process.env.GROQ_API_KEY_2 ?? "" },
]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.message !== "string" || body.message.trim() === "") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const response = await manager.generate({
      userId: typeof body.userId === "string" ? body.userId : "anonymous",
      sessionId: typeof body.sessionId === "string" ? body.sessionId : "dev-session",
      message: body.message,
    });
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      {
        error: "All AI providers are currently unavailable.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
