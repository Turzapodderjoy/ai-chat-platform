import { NextRequest, NextResponse } from "next/server";

import { checkAdminCredentials } from "@ai-chat-platform/client-auth";

import { getApp } from "../../../../lib/app";
import { isAdminRequest } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

/** Live ops status (checks, pending approvals, recent ledger). Admin-only. */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const app = await getApp();
    const snapshot = await app.container.router.ops.status();
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * Actions:
 *   { action: "propose", kind, params, summary }            -> queue an op
 *     (queuing is free; execution still needs sudo approval)
 *   { action: "approve", id, ok, username, password, note? } -> sudo gate
 *     against the admin credentials, then execute/deny.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const app = await getApp();

  try {
    if (action === "propose") {
      const kind = typeof body.kind === "string" ? body.kind : "";
      const params = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : {};
      const summary = typeof body.summary === "string" ? body.summary : kind;
      const ev = await app.container.router.ops.propose(kind, params, summary, "admin-panel");
      return NextResponse.json({ approval: ev });
    }

    if (action === "approve") {
      // sudo gate: the admin re-authenticates for every dangerous execution
      const username = typeof body.username === "string" ? body.username : "";
      const password = typeof body.password === "string" ? body.password : "";
      const id = typeof body.id === "string" ? body.id : "";
      const ok = body.ok !== false;
      const note = typeof body.note === "string" ? body.note : undefined;
      if (!checkAdminCredentials(username, password)) {
        return NextResponse.json({ error: "Sudo denied: bad username or password." }, { status: 403 });
      }
      const ev = await app.container.router.ops.approve(id, ok, username, note);
      return NextResponse.json({ approval: ev });
    }

    return NextResponse.json({ error: `Unknown action '${action}'.` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 }
    );
  }
}