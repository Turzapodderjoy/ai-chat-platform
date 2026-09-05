import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/google-email?businessId=xxx
 *
 * Popup-based flow: redirects to Google OAuth consent screen asking
 * only for the email scope. After consent, Google redirects to
 * /api/auth/google-email/callback which posts the email back to the
 * opener window via postMessage and closes the popup.
 *
 * Requires GOOGLE_CLIENT_SECRET in env and a GoogleSignInConfig row
 * for this business with a valid clientId.
 */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    return NextResponse.json(
      { error: "Google integration is not configured on the server." },
      { status: 500 }
    );
  }

  // Fetch the client ID from GoogleSignInConfig for this business
  const { prisma } = await import("@ai-chat-platform/database");
  const config = await prisma.googleSignInConfig.findUnique({
    where: { businessId },
  });

  if (!config || !config.clientId) {
    return NextResponse.json(
      { error: "Google Sign-In is not configured for this business." },
      { status: 400 }
    );
  }

  const host = req.headers.get("host") ?? req.nextUrl.host;
  const protocol = host?.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/auth/google-email/callback`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email openid https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state: businessId,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
