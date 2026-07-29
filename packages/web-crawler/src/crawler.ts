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

    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

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
