import type { NextRequest } from "next/server";

/** req.nextUrl.origin reflects the raw Host header Next's own server
 * process saw, which a reverse proxy in front of `next start` (e.g.
 * Cloudflare Tunnel, Nginx) doesn't always forward faithfully — it shows
 * up as the app's own bind address (localhost:3001) instead of the real
 * public hostname when self-hosted behind cloudflared. Confirmed live
 * twice: baked the wrong domain into a business's embed snippet, and
 * separately into an uploaded invoice logo's stored URL (silently
 * un-loadable, since a viewer's browser can't reach the VPS's internal
 * port). X-Forwarded-Host/-Proto are the standard headers a proxy sets
 * for exactly this, and Vercel sets them correctly too, so preferring
 * them is safe there as well. */
export function getPublicBaseUrl(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin;
}
