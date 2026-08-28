import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { resolveClientSession } from "../../../../lib/client-session";

/** The Agent Console's inbox -- always scoped server-side to the
 * caller's own business (never a client-supplied businessId). An
 * owner always sees everything; an agent sees only their own assigned
 * chats unless ?scope=team, which is read-only on the client side (see
 * AgentConsole.tsx) -- this route doesn't distinguish reply access,
 * inbox/reply below does. */
export async function GET(req: NextRequest) {
  const session = await resolveClientSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const scope = req.nextUrl.searchParams.get("scope");
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

  const app = await getApp();

  const assignedAgentId =
    session.isAgent && scope !== "team" ? (scope === "unassigned" ? "unassigned" : session.id) : undefined;

  const [{ conversations, nextCursor }, agents] = await Promise.all([
    app.container.router.handoff.listAll({
      businessId: session.businessId,
      needsHandoffOnly: true,
      cursor,
      assignedAgentId,
    }),
    app.container.router.clientAuth.listAgents(session.businessId),
  ]);

  return NextResponse.json({
    conversations,
    nextCursor,
    agents: agents.map((a) => ({ id: a.id, username: a.username, online: a.online, disabled: a.disabled })),
  });
}
