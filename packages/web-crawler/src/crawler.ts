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

/** Everything needed to resume a BFS crawl exactly where it left off —
 * persisted to CrawlTarget.frontierJson between invocations so a large
 * site's crawl can span many short serverless calls instead of needing
 * to complete inside one (Vercel's own execution-time cap makes a
 * multi-hundred-page crawl impossible to finish in a single invocation
 * regardless of how generous maxDuration is set). JSON-serializable —
 * Maps/Sets aren't, hence the array/record shapes. */
export interface CrawlFrontier {
  queue: string[];
  visited: string[];
}

export interface CrawlBatchOptions {
  /** Hard ceiling on the crawl's total size across every batch combined —
   * same meaning as CrawlOptions.maxPages. */
  maxPagesTotal?: number;
  /** How many pages THIS invocation is allowed to fetch — bounds a single
   * call's wall-clock time so it fits inside the platform's execution
   * limit; the rest waits in the returned frontier for the next call. */
  maxPagesThisBatch: number;
  delayMs?: number;
  onPage?: (pagesDoneThisBatch: number, totalVisitedSoFar: number) => void;
}

export interface CrawlBatchResult {
  /** Pages actually fetched THIS batch — the caller indexes only these,
   * not the whole site's history, on every call. */
  pages: CrawledPage[];
  /** Remaining state to resume with on the next call. null means the
   * crawl reached the end of its link graph (or maxPagesTotal) and is
   * genuinely finished, not just paused. */
  frontier: CrawlFrontier | null;
  totalVisitedCount: number;
}

const DELAY_MS_DEFAULT = 500;
const MAX_PAGES_DEFAULT = 25;
// A hung/slow-responding page had no bound at all — the raw fetch() below
// could wait forever, stalling the whole crawl on one bad page (observed
// live: a real crawl sat at the exact same page count for 6+ minutes with
// no error, no progress, and no way to tell the difference from "just
// slow" without this).
const FETCH_TIMEOUT_MS = 15_000;
// The regexes in html-to-text.ts are all linear (no catastrophic
// backtracking), but a genuinely huge response body — a multi-MB page,
// or a non-HTML resource mislabeled as HTML — still takes real,
// synchronous, event-loop-blocking time to run replace()/matchAll()
// over, and neither AbortSignal.timeout above nor a Promise.race would
// help once that work has started (JS is single-threaded; a sync hang
// blocks the timer callback too). Reject oversized bodies before ever
// running text/link extraction on them.
const MAX_HTML_BYTES = 3_000_000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Same-origin breadth-first crawl starting at `startUrl`, respecting
 * robots.txt and rate-limiting itself between requests, resumable across
 * calls via `priorFrontier`. Does not attempt to defeat CAPTCHAs, WAFs,
 * or other bot-detection — if a site blocks this crawler, that's a
 * signal to get the client to allowlist our User-Agent, not to work
 * around it.
 */
export async function crawlSiteBatch(
  startUrl: string,
  priorFrontier: CrawlFrontier | null,
  options: CrawlBatchOptions
): Promise<CrawlBatchResult> {
  const maxPagesTotal = options.maxPagesTotal ?? MAX_PAGES_DEFAULT;
  const delayMs = options.delayMs ?? DELAY_MS_DEFAULT;

  const origin = new URL(startUrl).origin;
  const disallowed = await fetchDisallowedPaths(origin);

  const visited = new Set<string>(priorFrontier?.visited ?? []);
  const queue: string[] = priorFrontier ? [...priorFrontier.queue] : [startUrl];
  const pages: CrawledPage[] = [];

  while (
    queue.length > 0 &&
    visited.size < maxPagesTotal &&
    pages.length < options.maxPagesThisBatch
  ) {
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
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
        continue;
      }

      const contentLength = Number(res.headers.get("content-length") ?? 0);
      if (contentLength > MAX_HTML_BYTES) {
        continue;
      }

      const html = await res.text();
      if (html.length > MAX_HTML_BYTES) {
        continue;
      }

      const text = htmlToText(html);

      if (text.length > 0) {
        pages.push({ url, text });
        options.onPage?.(pages.length, visited.size);
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

  const exhausted = queue.length === 0 || visited.size >= maxPagesTotal;

  return {
    pages,
    frontier: exhausted
      ? null
      : {
          queue,
          visited: Array.from(visited),
        },
    totalVisitedCount: visited.size,
  };
}

/** Convenience wrapper for a caller that just wants the whole crawl in
 * one call with no resumption — everything fits in one batch. */
export async function crawlSite(
  startUrl: string,
  options: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const maxPages = options.maxPages ?? MAX_PAGES_DEFAULT;

  const result = await crawlSiteBatch(startUrl, null, {
    maxPagesTotal: maxPages,
    maxPagesThisBatch: maxPages,
    delayMs: options.delayMs,
    onPage: options.onPage ? (pagesDoneThisBatch) => options.onPage!(pagesDoneThisBatch) : undefined,
  });

  return result.pages;
}
