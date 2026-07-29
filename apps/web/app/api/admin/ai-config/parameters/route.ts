import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.maxTokens !== "number") {
    return NextResponse.json({ error: "maxTokens is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const result = await app.container.router.aiConfig.updateParameters(
      {
        maxTokens: body.maxTokens,
        topP: typeof body.topP === "number" ? body.topP : null,
        frequencyPenalty: typeof body.frequencyPenalty === "number" ? body.frequencyPenalty : null,
        presencePenalty: typeof body.presencePenalty === "number" ? body.presencePenalty : null,
        stopSequences: typeof body.stopSequences === "string" ? body.stopSequences : null,
        seed: typeof body.seed === "number" ? body.seed : null,
      },
      typeof body.note === "string" ? body.note : undefined,
      typeof body.businessId === "string" ? body.businessId : undefined
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
