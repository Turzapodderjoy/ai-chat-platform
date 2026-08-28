import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { resolveClientSession } from "../../../../lib/client-session";

/** Business owner's self-service agent roster -- GET is open to the
 * owner AND their agents (an agent needs to see who's online, per the
 * Agent Console's team roster); POST/DELETE are owner-only (isAgent
 * sessions can't create or remove teammates). */
export async function GET(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const app = await getApp();
  const [agents, limit] = await Promise.all([
    app.container.router.clientAuth.listAgents(session.businessId),
    app.container.router.clientAuth.agentLimit(session.businessId),
  ]);

  return NextResponse.json({ agents, limit });
}

export async function POST(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.isAgent) return NextResponse.json({ error: "Only the business owner can add agents." }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const account = await app.container.router.clientAuth.createAccount(
      session.businessId,
      body.username,
      body.password,
      false,
      true
    );
    return NextResponse.json({ id: account.id, username: account.username });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.isAgent) return NextResponse.json({ error: "Only the business owner can remove agents." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const app = await getApp();
  const target = await app.container.router.clientAuth.getAccount(id);
  if (!target || target.businessId !== session.businessId || !target.isAgent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  await app.container.router.clientAuth.deleteAccount(id);
  return NextResponse.json({ ok: true });
}
