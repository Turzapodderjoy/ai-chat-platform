import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";
import {
  DEFAULT_REPLY_SETTINGS,
  parseReplySettings,
  resolveReplySettings,
} from "@ai-chat-platform/channel-catalog";

import { resolveClientSession } from "../../../lib/client-session";
import { isAdminRequest } from "../../../lib/admin-auth";

/** Read/write the WhatsApp reply settings for one business, plus the
 * platform-wide default businesses inherit.
 *
 * Deliberately NOT under /api/admin/*: the middleware lets any
 * authenticated session through that prefix and none of the routes behind
 * it re-check ownership, so a client session could PATCH any businessId
 * it put in the body. Nor under /api/client/*, which is scoped by
 * definition to the caller's own business and can't express the
 * platform default. So the checks are explicit here: the business comes
 * from resolveClientSession (never from the body) unless the caller is
 * an admin, and writing the platform default is admin-only.
 *
 * The JSON blobs themselves are validated by channel-catalog's
 * parseReplySettings on the way in (clamped, unknown keys dropped) and
 * never trusted on the way out -- effective is always a full object. */

const PLATFORM_ID = "default";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");

  // No businessId: the caller is an admin who only wants to see or edit
  // the platform default (the mother dashboard's Reply Timing tab). The
  // override is empty and `effective` is the platform's own resolution.
  if (!businessId) {
    if (!(await isAdminRequest(req))) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }
    const platformOnly = await prisma.platformReplySettings.findUnique({ where: { id: PLATFORM_ID } });
    return NextResponse.json({
      defaults: DEFAULT_REPLY_SETTINGS,
      platform: parseReplySettings(platformOnly?.settings),
      override: {},
      effective: resolveReplySettings(platformOnly?.settings, null),
      canEditPlatform: true,
    });
  }

  const auth = await authorizeBusiness(req, businessId);
  if (!auth.ok) return auth.response;

  const [platform, business] = await Promise.all([
    prisma.platformReplySettings.findUnique({ where: { id: PLATFORM_ID } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { replySettings: true } }),
  ]);

  return NextResponse.json({
    defaults: DEFAULT_REPLY_SETTINGS,
    platform: parseReplySettings(platform?.settings),
    override: parseReplySettings(business?.replySettings),
    effective: resolveReplySettings(platform?.settings, business?.replySettings),
    canEditPlatform: auth.isAdmin,
  });
}

export async function PUT(req: NextRequest) {
  // Deliberately a loose record rather than a union of two shapes: the
  // two request forms (platform default vs one business) are told apart
  // by which key is present, and TS can't narrow a union of all-optional
  // object types on that. One shape + explicit per-field checks is both
  // shorter and easier to read.
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Platform default: admin-only, and takes no businessId at all.
  if ("platform" in body) {
    if (!(await isAdminRequest(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // platform: null clears it, so every business falls back to the
    // compiled-in defaults.
    const settings =
      body.platform === null ? null : JSON.stringify(parseReplySettings(JSON.stringify(body.platform)));
    await prisma.platformReplySettings.upsert({
      where: { id: PLATFORM_ID },
      create: { id: PLATFORM_ID, settings },
      update: { settings },
    });
    return NextResponse.json({ ok: true, platform: parseReplySettings(settings) });
  }

  const businessId = typeof body.businessId === "string" ? body.businessId : null;
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const auth = await authorizeBusiness(req, businessId);
  if (!auth.ok) return auth.response;

  // settings absent or null clears this business's override so it
  // inherits the platform default again.
  const settings =
    body.settings === null || body.settings === undefined
      ? null
      : JSON.stringify(parseReplySettings(JSON.stringify(body.settings)));

  await prisma.business.update({ where: { id: businessId }, data: { replySettings: settings } });

  const platform = await prisma.platformReplySettings.findUnique({ where: { id: PLATFORM_ID } });
  return NextResponse.json({
    ok: true,
    override: parseReplySettings(settings),
    effective: resolveReplySettings(platform?.settings, settings),
  });
}

/** The caller's right to touch this business: their own client session
 * (any role, owner or agent -- the panel is an owner-facing tab but an
 * agent seeing it is no worse than an agent seeing the chat), or an
 * admin session for any business. Checks the *requested* businessId
 * against the session's own binding, so a client can't ask for someone
 * else's settings. */
async function authorizeBusiness(
  req: NextRequest,
  businessId: string
): Promise<{ ok: true; isAdmin: boolean } | { ok: false; response: NextResponse }> {
  const session = await resolveClientSession(req);
  if (session) {
    if (session.businessId !== businessId) {
      return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true, isAdmin: false };
  }

  if (await isAdminRequest(req)) {
    return { ok: true, isAdmin: true };
  }
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}
