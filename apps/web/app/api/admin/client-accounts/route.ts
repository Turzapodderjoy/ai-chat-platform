import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";
import { resolveAdminActor } from "../../../../lib/admin-actor";

export async function GET(req: NextRequest) {
  const app = await getApp();

  const revealId = req.nextUrl.searchParams.get("revealId");
  if (revealId) {
    const changedBy = await resolveAdminActor(req);
    const password = await app.container.router.clientAuth.revealPassword(revealId, changedBy);
    return NextResponse.json({ password });
  }

  const accounts = await app.container.router.clientAuth.listAccounts();
  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const isAdmin = Boolean(body?.isAdmin);

  if (!body || typeof body.username !== "string" || typeof body.password !== "string" || (!isAdmin && typeof body.businessId !== "string")) {
    return NextResponse.json({ error: "username and password are required (businessId too, unless isAdmin)" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const role = body.role === "owner" || body.role === "staff" ? body.role : null;
    const account = await app.container.router.clientAuth.createAccount(
      isAdmin ? null : body.businessId,
      body.username,
      body.password,
      isAdmin,
      Boolean(body.isAgent),
      role
    );
    // Never echo passwordHash back to the client, even hashed — the
    // caller already has the plaintext password it just submitted.
    return NextResponse.json({ id: account.id, username: account.username, businessId: account.businessId, isAdmin: account.isAdmin });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();

    if (typeof body.disabled === "boolean") {
      const changedBy = await resolveAdminActor(req);
      await app.container.router.clientAuth.setDisabled(body.id, body.disabled, changedBy);
    }

    if (body.allowedPanels !== undefined) {
      const panels =
        body.allowedPanels === null
          ? null
          : Array.isArray(body.allowedPanels)
            ? body.allowedPanels.filter((p: unknown): p is string => typeof p === "string")
            : null;
      const changedBy = await resolveAdminActor(req);
      const allPanelIds: string[] = Array.isArray(body.allPanelIds)
        ? body.allPanelIds.filter((p: unknown): p is string => typeof p === "string")
        : (panels ?? []);
      await app.container.router.clientAuth.setAllowedPanels(body.id, panels, changedBy, allPanelIds);
    }

    if (typeof body.password === "string") {
      const changedBy = await resolveAdminActor(req);
      await app.container.router.clientAuth.changePassword(body.id, body.password, changedBy);
    }

    if (typeof body.username === "string") {
      const changedBy = await resolveAdminActor(req);
      await app.container.router.clientAuth.changeUsername(body.id, body.username, changedBy);
    }

    if (body.teamId !== undefined) {
      await app.container.router.clientAuth.assignAccountToTeam(body.id, typeof body.teamId === "string" ? body.teamId : null);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    await app.container.router.clientAuth.deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
