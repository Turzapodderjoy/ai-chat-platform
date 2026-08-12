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

// og:image is the de-facto standard nearly every e-commerce platform
// (Shopify, WooCommerce, custom PHP/Next storefronts alike) sets to the
// product's own main photo, specifically so link previews/crawlers pick
// the right image without needing real page understanding -- exactly
// the signal we want here too. twitter:image is the common fallback
// when a site only bothers with the Twitter card tag. First match wins;
// a page with neither yields no image rather than guessing at a random
// <img> (a logo, an icon, an unrelated banner).
const OG_IMAGE_PATTERN = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
const TWITTER_IMAGE_PATTERN = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i;

export function extractImageUrl(html: string, baseUrl: string): string | null {
  const match = OG_IMAGE_PATTERN.exec(html) ?? TWITTER_IMAGE_PATTERN.exec(html);
  if (!match) return null;

  try {
    return new URL(match[1]!, baseUrl).toString();
  } catch {
    return null;
  }
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
