// Heuristic-only ("looks like", never "is definitely") classification
// of a crawled page's URL — used to skip the LLM extraction call on
// pages that plainly aren't an individual product (a category listing,
// the homepage, a policy page), since those never belong in the Product
// Catalog and extraction attempted on ~2,500 of them was the majority
// of what exhausted Groq's rate limit during a real crawl. Bias is
// toward FALSE NEGATIVES (skip attempting on something that actually
// was a product) over false positives (attempt on something that
// wasn't) — a skipped page still gets full normal char-chunking for
// chat/CSV, it just never becomes a Product row; a wasted attempt
// costs one of a scarce 30-requests/minute budget for nothing.

const NON_PRODUCT_PATH_SEGMENTS = [
  "category",
  "categories",
  "collection",
  "collections",
  "shop",
  "cart",
  "checkout",
  "account",
  "login",
  "register",
  "about",
  "contact",
  "privacy",
  "terms",
  "policy",
  "policies",
  "faq",
  "blog",
  "news",
  "search",
  "tag",
  "tags",
  "page",
  "wishlist",
  "compare",
];

const PRODUCT_PATH_SEGMENTS = ["product", "products", "item", "items", "p"];

export function looksLikeProductPage(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  const segments = pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  if (segments.length === 0) return false; // the homepage itself

  if (segments.some((s) => NON_PRODUCT_PATH_SEGMENTS.includes(s))) return false;

  // A product URL is a specific item, not just a bare category slug —
  // needs the recognized segment AND something after it (the item's own
  // slug/id), e.g. /product/red-widget, not just /product.
  return PRODUCT_PATH_SEGMENTS.some((marker) => {
    const i = segments.indexOf(marker);
    return i !== -1 && i < segments.length - 1;
  });
}
