import { NextRequest, NextResponse } from "next/server";
import { getApp } from "../../../../lib/app";

const CLIENT_COOKIE = "client_session";

/**
 * GET /api/auth/google/callback?code=xxx&state=businessId
 *
 * Google redirects here after consent. We exchange the code for tokens,
 * find/create the client account, issue a session, and return an HTML
 * page that posts the session info back to the opener (popup flow) then
 * closes itself.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const businessId = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // If Google returned an error (user denied consent, etc.)
  if (error || !code || !businessId) {
    return returnToOpener(req, {
      success: false,
      error: error || "Missing authorization code or business ID.",
    });
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    return returnToOpener(req, {
      success: false,
      error: "Google Sign-In is not configured on the server.",
    });
  }

  try {
    const app = await getApp();
    const config = await app.container.router.googleSignIn.getConfig(businessId);

    if (!config || !config.enabled || !config.clientId) {
      return returnToOpener(req, {
        success: false,
        error: "Google Sign-In is not enabled for this business.",
      });
    }

    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/google/callback`;

    // Exchange code for tokens + get user info
    const googleUser = await app.container.router.googleSignIn.exchangeCode(
      code,
      config.clientId,
      clientSecret,
      redirectUri
    );

    // Find or create account + issue session
    const session = await app.container.router.googleSignIn.findOrCreateAccount(
      businessId,
      googleUser
    );

    // Return HTML that communicates back to the opener window
    const res = new NextResponse(buildSuccessPage(session.businessId), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

    res.cookies.set(CLIENT_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });

    return res;
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return returnToOpener(req, {
      success: false,
      error: err instanceof Error ? err.message : "Authentication failed.",
    });
  }
}

function returnToOpener(
  req: NextRequest,
  data: { success: boolean; error?: string; businessId?: string }
): NextResponse {
  const html = `<!DOCTYPE html>
<html><head><title>Google Sign-In</title></head>
<body>
<script>
  try {
    window.opener.postMessage(${JSON.stringify(data)}, ${JSON.stringify(req.nextUrl.origin)});
  } catch(e) {}
  window.close();
</script>
<noscript>
  <p>Authentication ${data.success ? "successful" : "failed"}. You may close this window.</p>
</noscript>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

function buildSuccessPage(businessId: string): string {
  return `<!DOCTYPE html>
<html><head><title>Google Sign-In</title></head>
<body>
<script>
  try {
    window.opener.postMessage(
      { success: true, businessId: ${JSON.stringify(businessId)} },
      ${JSON.stringify("*")}
    );
  } catch(e) {}
  window.close();
</script>
<noscript>
  <p>Authentication successful. You may close this window.</p>
</noscript>
</body></html>`;
}
