import { fetchDisallowedPaths, isPathAllowed, USER_AGENT } from "./robots";
import { htmlToText, extractLinks } from "./html-to-text";

export interface CrawledPage {
  url: string;
  text: string;
}

export interface CrawlOptions {
  maxPages?: number;
  delayMs?: number;
  onPage?: (pagesDone: number) => void;
}

const DELAY_MS_DEFAULT = 500;
const MAX_PAGES_DEFAULT = 25;
// A hung/slow-responding page had no bound at all — the raw fetch() below
// could wait forever, stalling the whole crawl on one bad page (observed
// live: a real crawl sat at the exact same page count for 6+ minutes with
// no error, no progress, and no way to tell the difference from "just
// slow" without this).
const FETCH_TIMEOUT_MS = 15_000;
// A category page with combinable filters/sort/pagination can generate
// near-unlimited distinct query-string URLs for what's largely the same
// underlying listing — observed live: a real crawl passed 2500 pages with
// zero sign of slowing, all off the same handful of category paths.
// Capping how many query-string VARIANTS of the same path get crawled
// bounds that blowup without needing to know which specific params are
// "real" content (a genuinely different sub-category) vs noise (a sort
// order) for any given site.
const MAX_VARIANTS_PER_PATH = 5;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Same-origin breadth-first crawl starting at `startUrl`, respecting
 * robots.txt and rate-limiting itself between requests. Does not attempt
 * to defeat CAPTCHAs, WAFs, or other bot-detection — if a site blocks
 * this crawler, that's a signal to get the client to allowlist our
 * User-Agent, not to work around it.
 */
export async function crawlSite(
  startUrl: string,
  options: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const maxPages = options.maxPages ?? MAX_PAGES_DEFAULT;
  const delayMs = options.delayMs ?? DELAY_MS_DEFAULT;

  const origin = new URL(startUrl).origin;
  const disallowed = await fetchDisallowedPaths(origin);

  const visited = new Set<string>();
  const queue: string[] = [startUrl];
  const pages: CrawledPage[] = [];
  const pathVariantCount = new Map<string, number>();

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;

    if (visited.has(url)) {
      continue;
    }
    visited.add(url);

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    if (parsed.origin !== origin || !isPathAllowed(parsed.pathname, disallowed)) {
      continue;
    }

    const variantCount = pathVariantCount.get(parsed.pathname) ?? 0;
    if (variantCount >= MAX_VARIANTS_PER_PATH) {
      continue;
    }
    pathVariantCount.set(parsed.pathname, variantCount + 1);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
        continue;
      }

      const html = await res.text();
      const text = htmlToText(html);

      if (text.length > 0) {
        pages.push({ url, text });
        options.onPage?.(pages.length);
      }

      for (const link of extractLinks(html, url)) {
        if (!visited.has(link)) {
          queue.push(link);
        }
      }
    } catch {
      // Skip pages that fail to fetch; don't let one bad page kill the crawl.
    }

    await wait(delayMs);
  }

  return pages;
}
