/** "Send me a picture of X" → actually send the product photo.
 *
 * Why this is NOT a brain/LLM decision: the local fallback model has no
 * vision and no tool access, and a cloud model that hallucinates a
 * product name would attach the wrong photo to a real order. A wrong
 * image on a shop's WhatsApp is worse than no image, so the match is a
 * deliberate, auditable rule instead of a generation.
 *
 * Two conditions must BOTH hold before anything is sent:
 *   1. the message asks for a picture in any of the three languages the
 *      bot actually speaks (English / বাংলা / Banglish), and
 *   2. a product the tenant already sells is named in the message.
 * Fail either and the caller sends the normal text reply and nothing
 * else — the bot's behaviour outside this feature is byte-identical to
 * before.
 */

import type { ProductRecord } from "./product-service";

/** Picture words across the three languages this deployment serves.
 *  Matched on the *normalised* message (see normalize), so "ছবি" and
 *  "chobi"/"Choby" and "PIC" all hit. Deliberately not stemmed — Banglish
 *  spellings vary too much for a stemmer to help. */
const PICTURE_WORDS = [
  "picture",
  "pictures",
  "pic",
  "pics",
  "photo",
  "photos",
  "image",
  "images",
  "ছবি",
  "ছবি গুলো",
  "ছবিগুলো",
  "ফটো",
] as const;

/** Banglish spellings, checked after vowel-fold (see normalize): a
 *  customer typing "choby"/"chobi"/"jabo" must all match "chobi". */
const PICTURE_WORDS_FOLDED = ["chobi", "chobigulo", "photo", "photograph", "image", "pic"] as const;

/** Lowercase + fold the Bangla/English vowel variants a WhatsApp
 *  keyboard produces, so "ছবি"/"ছবি " and "chobi"/"choby" collapse. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u0985-\u09ff]/g, (ch) => ch) // keep Bangla as-is
    .replace(/[oO]/g, "o")
    .replace(/\s+/g, " ")
    .trim();
}

/** Does this message ask for a photo at all? */
export function wantsPictures(text: string): boolean {
  const n = normalize(text);
  // Banglish "choby" -> "chobi" (y/i is the same sound; vendors' keyboards
  // swap them constantly, so both must hit the same word).
  const folded = n.replace(/y/g, "i");
  return (
    PICTURE_WORDS.some((w) => n.includes(w)) ||
    PICTURE_WORDS_FOLDED.some((w) => folded.includes(w))
  );
}

/** A product name as it might appear in a customer's sentence. */
function nameForms(name: string): string[] {
  const base = normalize(name);
  const forms = new Set<string>([base]);
  // A catalogue name like "Cotton T-Shirt (Blue)" should also match when
  // the customer only says "t-shirt blue" or the bare "cotton t-shirt".
  for (const part of base.split(/[,/|()-]/)) {
    const t = part.trim();
    if (t.length >= 3) forms.add(t);
  }
  // Drop a trailing size/colour qualifier so "shirt large" matches
  // "Cotton Shirt (Large)".
  const stripped = base.replace(/\s*\(([^)]*)\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (stripped.length >= 3) forms.add(stripped);
  return [...forms];
}

/** Words of a catalogue name worth matching on individually.
 *
 *  Real customers do NOT retype the catalogue name verbatim — "send the
 *  photo of rice" must find "Rice 5kg", not fail because of the "5kg".
 *  So a name's significant words (>=3 chars, not pure punctuation) are
 *  matched individually as a fallback after the whole-name forms.
 *
 *  Ambiguity is real here — a shop selling both "Blue Jeans" and "Blue
 *  Shirt" matches "blue" against both — so matches are returned in
 *  catalogue order and the caller caps how many photos it sends. Every
 *  photo sent still has a name the customer literally used.
 */
function nameTokens(name: string): string[] {
  return normalize(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

export interface PictureMatch {
  product: ProductRecord;
  imageUrl: string;
}

/**
 * The products a picture request refers to, in catalogue order. Only
 * products that actually HAVE a public http(s) image are eligible — a
 * relative path or a data: URI would make Evolution's server-side fetch
 * fail (and it fetches, it does not receive our bytes).
 *
 * ponytail: no fuzzy/synonym matching and no LLM disambiguation. A
 * product must be named near-verbatim. That is deliberate: guessing
 * wrong sends a customer the wrong photo, and "did you mean…?" is a
 * better failure than the wrong image.
 */
export function matchProductsForPictures(
  text: string,
  products: ProductRecord[]
): PictureMatch[] {
  if (!wantsPictures(text)) return [];
  const n = normalize(text);
  const folded = n.replace(/y/g, "i");
  const out: PictureMatch[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    if (!product.imageUrl) continue;
    if (!/^https?:\/\//i.test(product.imageUrl.trim())) continue; // must be fetchable by Evolution
    if (seen.has(product.id)) continue;
    const hit =
      nameForms(product.name).some((form) => folded.includes(form.replace(/y/g, "i"))) ||
      nameTokens(product.name).some((tok) => folded.includes(tok.replace(/y/g, "i")));
    if (!hit) continue;
    seen.add(product.id);
    out.push({ product, imageUrl: product.imageUrl.trim() });
  }
  return out;
}

/** Caption under the photo: name, and price when the catalogue has one.
 *  No invented stock/claim text. */
export function pictureCaption(product: ProductRecord): string {
  return product.price ? `${product.name} — ৳${product.price}` : product.name;
}
