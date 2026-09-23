import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-chat-platform/database";

import { getApp } from "../../../lib/app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Simple in-memory rate limit: 30 requests per minute per IP.
// ponytail: global in-memory Map, fine for single-process; use Redis
// if multi-instance rate limiting is ever needed.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Periodic cleanup to prevent memory leak from abandoned IPs.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 120_000).unref?.();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  const body = await req.json().catch(() => null);

  const imageUrl = typeof body?.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim() : undefined;

  if (!body || typeof body.message !== "string" || (body.message.trim() === "" && !imageUrl)) {
    return NextResponse.json({ error: "message or imageUrl is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const sessionId = typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : `web-${Date.now().toString(36)}`;
  const businessId = typeof body.businessId === "string" ? body.businessId : undefined;
  const languageHint = typeof body.languageHint === "string" ? body.languageHint : undefined;

  // Check subscription status for the business (2-day grace period)
  if (businessId) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        subscriptionActive: true,
        subscriptionEndDate: true,
      },
    });

    if (business) {
      const isDisabled = !business.subscriptionActive;
      const isExpired = business.subscriptionEndDate &&
        business.subscriptionEndDate < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      if (isDisabled || isExpired) {
        return NextResponse.json(
          {
            answer: "This service is currently unavailable. Please contact the business owner to renew your subscription.",
            provider: "system",
            tokens: 0,
            confidence: 1,
            handoff: true,
          },
          { headers: CORS_HEADERS }
        );
      }
    }
  }

  try {
    const app = await getApp();
    const answer = await withTimeout(
      app.container.router.chat.post(sessionId, body.message, businessId, undefined, languageHint, imageUrl),
      45_000
    );

    if (businessId) {
      prisma.businessUsage.upsert({
        where: { businessId },
        update: { chatCount: { increment: 1 } },
        create: { businessId, chatCount: 1 },
      }).catch((err) => console.error("[Usage] Failed to track chat:", err));
    }

    return NextResponse.json(answer, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Chat request failed or timed out:", err);
    return NextResponse.json(
      {
        answer: "We're having trouble connecting right now — a team member will follow up with you shortly.",
        provider: "system",
        tokens: 0,
        confidence: 0,
        handoff: true,
      },
      { headers: CORS_HEADERS }
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)),
  ]);
}
