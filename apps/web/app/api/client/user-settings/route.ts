import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

const CLIENT_COOKIE = "client_session";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Self-service username/password for a client login, plus (owner only)
 * the same for every staff login under the same business -- the actual
 * password value only ever leaves the server through this route, never
 * through the account-listing endpoints. */
async function requireSession(req: NextRequest) {
  const token = req.cookies.get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  const app = await getApp();
  const session = await app.container.router.clientAuth.getSession(token);
  if (!session || session.isAdmin) return null;
  return { clientAuth: app.container.router.clientAuth, session };
}

export async function GET(req: NextRequest) {
  const ctx = await requireSession(req);
  if (!ctx) return json({ error: "Not signed in" }, 401);
  const { clientAuth, session } = ctx;

  const selfPassword = await clientAuth.revealPassword(session.id, session.username);
  const self = { id: session.id, username: session.username, password: selfPassword };

  let staff: { id: string; username: string; password: string | null }[] = [];
  if (session.role === "owner" && session.businessId) {
    const accounts = await clientAuth.listAccounts();
    const staffAccounts = accounts.filter(
      (a) => a.businessId === session.businessId && a.role === "staff" && a.id !== session.id
    );
    staff = await Promise.all(
      staffAccounts.map(async (a) => ({
        id: a.id,
        username: a.username,
        password: await clientAuth.revealPassword(a.id, session.username),
      }))
    );
  }

  return json({ self, staff });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireSession(req);
  if (!ctx) return json({ error: "Not signed in" }, 401);
  const { clientAuth, session } = ctx;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return json({ error: "id is required" }, 400);
  }

  // A login can always edit itself. An owner can also edit any staff
  // login in their own business -- never another business's, and never
  // another owner's.
  if (body.id !== session.id) {
    if (session.role !== "owner") {
      return json({ error: "Not allowed" }, 403);
    }
    const target = await clientAuth.getAccount(body.id);
    if (!target || target.businessId !== session.businessId) {
      return json({ error: "Not allowed" }, 403);
    }
    const targetSummary = (await clientAuth.listAccounts()).find((a) => a.id === body.id);
    if (!targetSummary || targetSummary.role !== "staff") {
      return json({ error: "Not allowed" }, 403);
    }
  }

  try {
    if (typeof body.username === "string") {
      await clientAuth.changeUsername(body.id, body.username, session.username);
    }
    if (typeof body.password === "string") {
      await clientAuth.changePassword(body.id, body.password, session.username);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}
