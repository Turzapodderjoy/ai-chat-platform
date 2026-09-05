import { NextRequest, NextResponse } from "next/server";
import { getApp } from "../../../../lib/app";

/**
 * GET /api/auth/google?businessId=xxx
 *
 * Redirects to Google's OAuth consent screen. The Client ID is fetched
 * from GoogleSignInConfig for this business. GOOGLE_CLIENT_SECRET must
 * be set in the environment.
 *
 * After consent, Google redirects to /api/auth/google/callback.
 */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    return NextResponse.json(
      { error: "Google Sign-In is not configured on the server." },
      { status: 500 }
    );
  }

  const app = await getApp();
  const config = await app.container.router.googleSignIn.getConfig(businessId);

  if (!config || !config.enabled || !config.clientId) {
    return NextResponse.json(
      { error: "Google Sign-In is not enabled for this business." },
      { status: 400 }
    );
  }

  // Build the callback URL — must match what's registered in Google Cloud Console.
  // Use the Host header (real public hostname behind tunnel) rather than
  // req.nextUrl.origin which resolves to localhost:3001 inside PM2.
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const protocol = host?.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: businessId, // Pass businessId through OAuth flow
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
