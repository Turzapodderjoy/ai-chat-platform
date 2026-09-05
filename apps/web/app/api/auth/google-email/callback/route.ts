import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/google-email/callback?code=xxx&state=businessId
 *
 * Google redirects here after consent. We exchange the code for tokens
 * (including gmail.send scope), fetch the user's email, store the OAuth
 * tokens in GmailSenderConfig, and return an HTML page that signals
 * success back to the opener (parent dashboard) via postMessage, then
 * closes the popup.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const businessId = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code || !businessId) {
    return htmlResponse(req, { success: false, error: error || "Missing code or business ID." });
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    return htmlResponse(req, { success: false, error: "Google integration is not configured." });
  }

  try {
    // Fetch client ID from DB
    const { prisma } = await import("@ai-chat-platform/database");
    const config = await prisma.googleSignInConfig.findUnique({
      where: { businessId },
    });

    if (!config || !config.clientId) {
      return htmlResponse(req, { success: false, error: "Google not configured for this business." });
    }

    const host = req.headers.get("host") ?? req.nextUrl.host;
    const protocol = host?.includes("localhost") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/auth/google-email/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return htmlResponse(req, { success: false, error: "Failed to exchange authorization code." });
    }

    const tokens = await tokenRes.json();

    // Fetch user email from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return htmlResponse(req, { success: false, error: "Failed to fetch user info from Google." });
    }

    const user = await userRes.json();
    const email = user.email;

    if (!email) {
      return htmlResponse(req, { success: false, error: "No email found in Google account." });
    }

    // Store OAuth tokens in GmailSenderConfig
    await prisma.gmailSenderConfig.upsert({
      where: { businessId },
      create: {
        businessId,
        gmailAddress: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
      },
      update: {
        gmailAddress: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
      },
    });

    return htmlResponse(req, { success: true, email });
  } catch (err) {
    console.error("Google email callback error:", err);
    return htmlResponse(req, {
      success: false,
      error: err instanceof Error ? err.message : "Authentication failed.",
    });
  }
}

function htmlResponse(
  req: NextRequest,
  data: { success: boolean; error?: string; email?: string }
): NextResponse {
  const html = `<!DOCTYPE html>
<html><head><title>Google Sign-In</title></head>
<body>
<script>
  try {
    window.opener.postMessage(${JSON.stringify(data)}, ${JSON.stringify("*")});
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
