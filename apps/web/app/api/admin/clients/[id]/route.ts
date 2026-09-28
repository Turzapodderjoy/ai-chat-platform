import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApp } from "../../../../../lib/app";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Route is at apps/web/app/api/admin/clients/[id]/route.ts -> repo root is 7 levels up
const REPO_ROOT = path.resolve(__dirname, "../../../../../../..");
const HERMES_HOME = process.env.HERMES_HOME || path.join(REPO_ROOT, "data", "hermes");
const PROFILES_DIR = path.join(HERMES_HOME, "profiles");
const RESERVED_SLUGS = new Set(["default", "aiva-portal"]);

async function validateHermesProfile(slug: string | null): Promise<void> {
  if (slug === null || slug === "") return;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new Error("Invalid agent slug format.");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`'${slug}' is reserved.`);
  }
  const envPath = path.join(PROFILES_DIR, slug, ".env");
  const raw = await fs.readFile(envPath, "utf8").catch(() => "");
  if (!raw || !raw.includes("API_SERVER_KEY")) {
    throw new Error(`Agent '${slug}' does not exist or is not provisioned.`);
  }
}

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

  if (
    !body ||
    (typeof body.maxAgents !== "number" &&
      typeof body.type !== "string" &&
      typeof body.aiEnabled !== "boolean" &&
      typeof body.hermesEnabled !== "boolean" &&
      !Array.isArray(body.enabledIntegrations) &&
      body.enabledIntegrations !== null &&
      typeof body.logoUrl !== "string" &&
      body.logoUrl !== null &&
      typeof body.timezone !== "string" &&
      typeof body.hermesProfile !== "string" &&
      body.hermesProfile !== null)
  ) {
    return NextResponse.json({ error: "maxAgents, type, aiEnabled, hermesEnabled, enabledIntegrations, logoUrl, timezone, or hermesProfile is required" }, { status: 400 });
  }

  try {
    const app = await getApp();
    if (typeof body.maxAgents === "number") {
      await app.container.router.clientAuth.setMaxAgents(id, body.maxAgents);
    }
    if (typeof body.type === "string") {
      await app.container.router.admin.setClientType(id, body.type);
    }
    if (typeof body.aiEnabled === "boolean") {
      await app.container.router.admin.setClientAiEnabled(id, body.aiEnabled);
    }
    if (Array.isArray(body.enabledIntegrations) || body.enabledIntegrations === null) {
      const { prisma } = await import("@ai-chat-platform/database");
      await prisma.business.update({
        where: { id },
        data: { enabledIntegrations: body.enabledIntegrations ? JSON.stringify(body.enabledIntegrations) : null },
      });
    }
    if (typeof body.logoUrl === "string" || body.logoUrl === null) {
      const { prisma } = await import("@ai-chat-platform/database");
      await prisma.business.update({ where: { id }, data: { logoUrl: body.logoUrl } });
    }
    if (typeof body.hermesProfile === "string" || body.hermesProfile === null) {
      await validateHermesProfile(body.hermesProfile);
      const { prisma } = await import("@ai-chat-platform/database");
      const update: Record<string, unknown> = { hermesProfile: body.hermesProfile };
      if (body.hermesProfile !== null) {
        update.hermesEnabled = true;
      }
      await prisma.business.update({ where: { id }, data: update });
    } else if (typeof body.hermesEnabled === "boolean") {
      const { prisma } = await import("@ai-chat-platform/database");
      await prisma.business.update({ where: { id }, data: { hermesEnabled: body.hermesEnabled } });
    }
    if (typeof body.timezone === "string") {
      const { prisma } = await import("@ai-chat-platform/database");
      await prisma.business.update({ where: { id }, data: { timezone: body.timezone } });
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
