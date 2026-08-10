const USER_AGENT = "AIChatPlatformBot/1.0";

// A slow/unresponsive site here hung the crawl before it ever started —
// same reasoning as crawler.ts's own FETCH_TIMEOUT_MS.
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Minimal robots.txt parser — collects Disallow rules that apply to our
 * User-agent (falling back to "*"). No allowlist-precedence handling,
 * no sitemap parsing. Good enough to respect the common case; a site
 * with unusual robots.txt directives may need a smarter parser later.
 */
export async function fetchDisallowedPaths(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return [];
    }

    const text = await res.text();
    const lines = text.split("\n").map((l) => l.trim());

    let currentGroupMatches = false;
    const disallowed: string[] = [];

    for (const line of lines) {
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey?.trim().toLowerCase();
      const value = rest.join(":").trim();

      if (key === "user-agent") {
        currentGroupMatches = value === "*" || value.toLowerCase() === USER_AGENT.toLowerCase();
      } else if (key === "disallow" && currentGroupMatches && value) {
        disallowed.push(value);
      }
    }

    return disallowed;
  } catch {
    // If robots.txt can't be fetched, don't block the crawl on it.
    return [];
  }
}

export function isPathAllowed(path: string, disallowed: string[]): boolean {
  return !disallowed.some((rule) => path.startsWith(rule));
}

export { USER_AGENT };
