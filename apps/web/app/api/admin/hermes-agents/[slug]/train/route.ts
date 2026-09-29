import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";
import { isAdminRequest } from "../../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

// A training run is a long model call; give the route room above the gateway's
// own 180s cap. maxSeconds is enforced server-side too (see the trainer).
export const maxDuration = 300;

/**
 * On-demand language training for one agent. Hard-capped; see
 * hermes-language-trainer for the page/char/second budget and SSRF guards.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    language?: string;
    urls?: string[];
    maxPages?: number;
    maxChars?: number;
    maxSeconds?: number;
  };
  try {
    const result = await app.container.router.hermes.train(slug, {
      language: body.language ?? "",
      urls: Array.isArray(body.urls) ? body.urls.slice(0, 10) : [],
      maxPages: body.maxPages,
      maxChars: body.maxChars,
      maxSeconds: body.maxSeconds,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
