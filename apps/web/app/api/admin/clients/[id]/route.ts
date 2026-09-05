import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApp();
  const client = await app.container.router.admin.getClient(id);
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(client);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!body || (typeof body.maxAgents !== "number" && typeof body.type !== "string" && !Array.isArray(body.enabledIntegrations) && body.enabledIntegrations !== null)) {
    return NextResponse.json({ error: "maxAgents, type, or enabledIntegrations is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    if (typeof body.maxAgents === "number") {
      await app.container.router.clientAuth.setMaxAgents(id, body.maxAgents);
    }
    if (typeof body.type === "string") {
      await app.container.router.admin.setClientType(id, body.type);
    }
    if (Array.isArray(body.enabledIntegrations) || body.enabledIntegrations === null) {
      const { prisma } = await import("@ai-chat-platform/database");
      await prisma.business.update({
        where: { id },
        data: { enabledIntegrations: body.enabledIntegrations ? JSON.stringify(body.enabledIntegrations) : null },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const app = await getApp();
    const result = await app.container.router.admin.deleteClient(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
