import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { isAdminRequest } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

/** Model-picker inventory (gateway /api/model/options) and sign-in status. */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  const params = req.nextUrl.searchParams;
  if (params.get("signin") === "1") {
    return NextResponse.json(app.container.router.hermes.signInStatus());
  }
  try {
    const payload = await app.container.router.hermes.modelOptions({
      slug: params.get("slug") ?? undefined,
      refresh: params.get("refresh") === "1" || params.get("refresh") === "true",
    });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** Kick off the Nous device-code sign-in (one flow at a time). */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const app = await getApp();
  const body = (await req.json().catch(() => ({}))) as { action?: string; slug?: string };
  if (body.action !== "signin-start") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  try {
    return NextResponse.json(await app.container.router.hermes.signInStart(body.slug));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
