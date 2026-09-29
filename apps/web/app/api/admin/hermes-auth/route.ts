import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET(req: NextRequest) {
  const app = await getApp();
  if (new URL(req.url).searchParams.get("signin") === "1") {
    return NextResponse.json(app.container.router.hermes.signInStatus());
  }
  return NextResponse.json({ auth: await app.container.router.hermes.authStatus() });
}

export async function POST(req: NextRequest) {
  const app = await getApp();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    slug?: string;
    addAccount?: boolean;
  };
  const hermes = app.container.router.hermes;
  try {
    switch (body.action) {
      case "login":
        return NextResponse.json({
          signin: await hermes.signInStart(body.slug, { addAccount: body.addAccount === true }),
        });
      case "activate":
        return NextResponse.json({ auth: await hermes.authActivate(body.id ?? "") });
      case "remove":
        return NextResponse.json({ auth: await hermes.authRemove(body.id ?? "") });
      case "reset":
        return NextResponse.json({ auth: await hermes.authReset(body.id) });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}