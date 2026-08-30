import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

/** Generic Approval Engine surface (Day 1 PM) -- no module calls into
 * this yet, exists so the engine is independently testable before
 * anything is built on top of it. */
export async function GET(req: NextRequest) {
  const app = await getApp();

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const request = await app.container.router.approvals.get(id);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(request);
  }

  const businessId = req.nextUrl.searchParams.get("businessId");
  const accountId = req.nextUrl.searchParams.get("accountId");
  const isAdmin = req.nextUrl.searchParams.get("isAdmin") === "true";
  if (!businessId || !accountId) {
    return NextResponse.json({ error: "businessId and accountId are required (or id for a single request)" }, { status: 400 });
  }

  const pending = await app.container.router.approvals.pendingFor(businessId, accountId, isAdmin);
  return NextResponse.json({ pending });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.businessId !== "string" || typeof body.type !== "string" || typeof body.recordId !== "string" || typeof body.requestedBy !== "string" || !Array.isArray(body.steps)) {
    return NextResponse.json({ error: "businessId, type, recordId, requestedBy, and steps[] are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const request = await app.container.router.approvals.request(body.businessId, body.type, body.recordId, body.requestedBy, body.steps);
    return NextResponse.json(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.stepId !== "string" || (body.decision !== "approved" && body.decision !== "rejected") || typeof body.decidedBy !== "string") {
    return NextResponse.json({ error: "stepId, decision (approved/rejected), and decidedBy are required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    const request = await app.container.router.approvals.decide(body.stepId, body.decision, body.decidedBy, body.comment);
    return NextResponse.json(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
