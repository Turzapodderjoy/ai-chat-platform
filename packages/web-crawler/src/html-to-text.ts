const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Strips a page down to visible text. No DOM parser dependency — good
 * enough for prose-heavy marketing/FAQ pages, not a full HTML renderer. */
export function htmlToText(html: string): string {
  const withoutNonContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const withoutTags = withoutNonContent.replace(/<[^>]+>/g, " ");

  const decoded = withoutTags.replace(
    /&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g,
    (m) => ENTITIES[m] ?? m
  );

  return decoded.replace(/\s+/g, " ").trim();
}

const HREF_PATTERN = /<a\s[^>]*href=["']([^"'#]+)["']/gi;

export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];

  for (const match of html.matchAll(HREF_PATTERN)) {
    try {
      links.push(new URL(match[1]!, baseUrl).toString());
    } catch {
      // Malformed href, skip it.
    }
  }

  return links;
}
