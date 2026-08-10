import { USER_AGENT } from "./robots";

const LOC_PATTERN = /<loc>([^<]+)<\/loc>/gi;

// Same reasoning as crawler.ts's FETCH_TIMEOUT_MS — a slow/unresponsive
// site here hung the ENTIRE crawl before it ever got started, since this
// runs before the first progress write and had no bound at all.
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Quick "inspect the site first" pass for the progress bar's denominator:
 * try the sitemap (fast, usually accurate) before falling back to the
 * crawl's own page cap. Not a full crawl — no rate limiting needed since
 * it's a single request.
 */
export async function estimatePageCount(
  startUrl: string,
  maxPages: number
): Promise<number> {
  try {
    const origin = new URL(startUrl).origin;
    const res = await fetch(`${origin}/sitemap.xml`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.ok) {
      const xml = await res.text();
      const count = [...xml.matchAll(LOC_PATTERN)].length;

      if (count > 0) {
        return Math.min(count, maxPages);
      }
    }
  } catch {
    // No sitemap, or it didn't parse — fall through to the cap below.
  }

  return maxPages;
}
