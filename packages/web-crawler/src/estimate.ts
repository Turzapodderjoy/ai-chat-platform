import { USER_AGENT } from "./robots";

const LOC_PATTERN = /<loc>([^<]+)<\/loc>/gi;

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
