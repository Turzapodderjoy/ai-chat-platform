import { AIManager } from "@ai-chat-platform/ai-manager";
import { PromptEngine } from "@ai-chat-platform/prompt-engine";
import { Retriever, RetrievedChunk } from "@ai-chat-platform/retriever";
import { ConversationService, ConversationMessage, OrderService } from "@ai-chat-platform/conversation";
import { EmbeddingManager } from "@ai-chat-platform/embedding-manager";
import { AiConfigService } from "@ai-chat-platform/ai-config";
import type { VectorStoreManager } from "@ai-chat-platform/vector-store";
import type { MasterCsvService } from "@ai-chat-platform/knowledge-refresh";
import type { ContactService } from "@ai-chat-platform/crm";
import type { VisionService } from "@ai-chat-platform/vision";
import type { RepairAppointmentService } from "@ai-chat-platform/repairs";

import { ChatUsageLog } from "./chat-usage-log";
import { ResponseCache } from "./response-cache";
import type {
  ChatRequest,
  ChatResponse,
  ChatSource,
} from "./types";

// Admin-only provenance for an answer — which page/document it actually
// came from, so a wrong or missing answer can be traced back to exactly
// what the AI read (or didn't). Deduped by source label (a page can
// contribute several chunks; only its best score matters here), capped
// so a heavily-expanded retrieval (see VectorStoreRetriever's sibling-
// chunk pull-in) doesn't turn this into a huge list.
const MAX_SOURCES_SHOWN = 6;

function buildSources(retrieved: RetrievedChunk[]): ChatSource[] {
  const bestByLabel = new Map<string, { score: number; embeddingProvider?: string }>();

  for (const chunk of retrieved) {
    const label =
      (chunk.metadata?.url as string | undefined) ??
      (chunk.metadata?.filename as string | undefined) ??
      "unknown source";
    const existing = bestByLabel.get(label);
    if (!existing || chunk.score > existing.score) {
      bestByLabel.set(label, {
        score: chunk.score,
        embeddingProvider: chunk.metadata?.embeddingProvider as string | undefined,
      });
    }
  }

  return Array.from(bestByLabel.entries())
    .map(([label, { score, embeddingProvider }]) => ({ label, score, embeddingProvider }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SOURCES_SHOWN);
}

// Emitted by the LLM itself (see the system prompt's ANSWERING FROM THE
// KNOWLEDGE BASE section) when it can't help from the knowledge base OR
// the customer explicitly asks for a human — the ONLY reliable, language-
// agnostic way to know that, since retrieval confidence measures how well
// the knowledge base matches the QUESTION, not whether the AI actually
// managed to answer it or whether the customer just typed "talk to a
// human". Before this, handoff was decided entirely from confidence
// BEFORE the LLM ever ran, so the AI could say "let me connect you with a
// team member" in its own reply and nothing would actually happen — no
// handoff record, invisible to the Handoffs queue, customer stuck talking
// to the bot forever.
const HANDOFF_MARKER = "[[NEEDS_HUMAN]]";

// ponytail: a flat 2-hour timeout for every business/channel — no
// per-business override yet. Upgrade path if that's ever needed: move
// this into AiConfig alongside handoffFloor.
const HANDOFF_STALE_MS = 2 * 60 * 60 * 1000;

// Belt-and-suspenders for HANDOFF_MARKER: the system prompt tells the AI
// to always append the marker when it offers a human handoff, but
// instruction-following on a magic string isn't 100% reliable —
// especially in Bangla/Banglish generation, observed in real training
// analysis reports in two different ways: (1) the AI says "connecting
// you with a team member" but drops the marker, and (2) the AI admits
// "I don't have this information" without offering a handoff OR the
// marker at all, even though the system prompt requires both whenever it
// admits it can't answer. "team member"/"টিম মেম্বার" are reserved by this
// system's own canned messages for case (1); the "don't have
// information" phrasings below are the system prompt's own canonical
// admission language for case (2) — matching them is a safe,
// low-false-positive fallback since a real customer question is never
// phrased this way, only the AI's own admission is.
const HANDOFF_INTENT_FALLBACK =
  /team member|টিম মেম্বার|knowledge base|তথ্য (নেই|নাই)|tothyo[^.]*(nei|nai)|don'?t have (that|this|any) (specific )?information/i;

// Same marker-based signal as HANDOFF_MARKER — the system prompt
// instructs the AI to append this, with a JSON payload, once it has
// conversationally collected all 5 order fields and confirmed them back
// to the customer. Parsed out of the reply and turned into a real Order
// row; the customer never sees the marker or the JSON. The `[^\]]*` body
// deliberately doesn't try to validate JSON shape here — a malformed
// payload just fails the JSON.parse below and the marker is stripped
// with no order created, rather than crashing the whole reply.
// `\]{1,2}` not `\]\]` — confirmed live the model sometimes emits only a
// single closing bracket ("...}]" instead of "...}]]"), and a strict
// double-bracket match then fails to strip OR parse the marker at all,
// leaking raw [[ORDER_TAKEN:{...}]] syntax straight into what the
// customer sees. Tolerating 1-2 closing brackets fixes both problems
// with the same change. Kept as a rare fast-path (customer gives every
// detail and confirms in one single message) — the normal path below
// (ORDER_FIELDS) is what actually carries the flow now.
const ORDER_MARKER_PATTERN = /\[\[ORDER_TAKEN:([^\]]*)\]{1,2}/;

// Emitted on EVERY reply while an order is actively being collected, with
// the AI's current best understanding of all 5 fields (not just ones
// mentioned this turn) — its own JUDGMENT of the whole conversation so
// far. Deliberately NOT trusted as the sole source of truth: a real
// production conversation showed the AI can flat-out forget a field it
// itself asked for and received two turns earlier, looping "name/phone"
// -> "address/payment" -> "name/phone" forever without ever producing a
// complete set. Code below MERGES each turn's non-empty fields into
// Conversation.pendingOrder (never overwriting a previously-known field
// with something empty), so the collected state can only ever grow, not
// regress, regardless of what the AI itself currently believes. The
// confirmation message shown to the customer once all 5 are present is
// also generated by code, not the AI — removes the AI from the
// correctness-critical path entirely once fields are known.
const ORDER_FIELDS_PATTERN = /\[\[ORDER_FIELDS:([^\]]*)\]{1,2}/;

const ORDER_FIELD_KEYS = ["customerName", "phone", "deliveryAddress", "products", "paymentMethod"] as const;
type OrderFields = Record<(typeof ORDER_FIELD_KEYS)[number], string>;

function extractOrderFields(parsed: Record<string, unknown>): Partial<OrderFields> {
  const field = (key: string) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "");
  const out: Partial<OrderFields> = {};
  const customerName = field("customerName") || field("name");
  const deliveryAddress = field("deliveryAddress") || field("address");
  const paymentMethod = field("paymentMethod") || field("payment");
  if (customerName) out.customerName = customerName;
  if (field("phone")) out.phone = field("phone");
  if (deliveryAddress) out.deliveryAddress = deliveryAddress;
  if (field("products")) out.products = field("products");
  if (paymentMethod) out.paymentMethod = paymentMethod;
  return out;
}

/** Only new, non-empty values ever overwrite — a field the AI omits or
 * sends blank this turn keeps whatever was already known, so one bad
 * turn can never erase progress made on an earlier one. */
function mergeOrderFields(
  existing: Record<string, string> | null,
  incoming: Partial<OrderFields>
): Record<string, string> {
  const merged = { ...(existing ?? {}) };
  for (const key of ORDER_FIELD_KEYS) {
    const value = incoming[key];
    if (value) merged[key] = value;
  }
  return merged;
}

function isOrderComplete(fields: Record<string, string> | null): fields is OrderFields {
  return !!fields && ORDER_FIELD_KEYS.every((k) => !!fields[k]);
}

// ── Repair appointment booking markers ──────────────────────────────
// Same dual-marker protocol as orders, but for collecting repair
// appointment details via the AI chat.

const REPAIR_MARKER_PATTERN = /\[\[REPAIR_BOOKED:([^\]]*)\]{1,2}/;
const REPAIR_FIELDS_PATTERN = /\[\[REPAIR_FIELDS:([^\]]*)\]{1,2}/;

const REPAIR_FIELD_KEYS = ["deviceType", "deviceModel", "issueDescription", "customerName", "phone", "email", "appointmentDate"] as const;
type RepairFields = Record<(typeof REPAIR_FIELD_KEYS)[number], string>;

function extractRepairFields(parsed: Record<string, unknown>): Partial<RepairFields> {
  const field = (key: string) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "");
  const out: Partial<RepairFields> = {};
  if (field("deviceType")) out.deviceType = field("deviceType");
  if (field("deviceModel")) out.deviceModel = field("deviceModel");
  if (field("issueDescription") || field("issue")) out.issueDescription = field("issueDescription") || field("issue");
  if (field("customerName") || field("name")) out.customerName = field("customerName") || field("name");
  if (field("phone")) out.phone = field("phone");
  if (field("email")) out.email = field("email");
  if (field("appointmentDate") || field("date")) out.appointmentDate = field("appointmentDate") || field("date");
  return out;
}

function mergeRepairFields(
  existing: Record<string, string> | null,
  incoming: Partial<RepairFields>
): Record<string, string> {
  const merged = { ...(existing ?? {}) };
  for (const key of REPAIR_FIELD_KEYS) {
    const value = incoming[key];
    if (value) merged[key] = value;
  }
  return merged;
}

function isRepairComplete(fields: Record<string, string> | null): fields is RepairFields {
  return !!fields && ["deviceType", "issueDescription", "customerName", "phone", "appointmentDate"].every((k) => !!fields[k]);
}

function repairSummaryMessage(fields: RepairFields): string {
  const device = fields.deviceModel ? `${fields.deviceType} (${fields.deviceModel})` : fields.deviceType;
  return [
    "Please confirm your repair appointment:",
    "",
    `- Device: ${device}`,
    `- Issue: ${fields.issueDescription}`,
    `- Name: ${fields.customerName}`,
    `- Phone: ${fields.phone}`,
    fields.email ? `- Email: ${fields.email}` : null,
    `- Date: ${fields.appointmentDate}`,
    "",
    'Reply "confirm" if everything is correct.',
  ]
    .filter(Boolean)
    .join("\n");
}

const REPAIR_CONFIRMED_MESSAGE = "Your repair appointment is booked! A confirmation email has been sent. You can track your repair status anytime using your tracking code.";

function repairConfirmedMessage(fields: RepairFields, trackingToken: string): string {
  const device = fields.deviceModel ? `${fields.deviceType} (${fields.deviceModel})` : fields.deviceType;
  return [
    REPAIR_CONFIRMED_MESSAGE,
    "",
    `**Tracking Code: ${trackingToken}**`,
    `- Device: ${device}`,
    `- Issue: ${fields.issueDescription}`,
    `- Appointment: ${fields.appointmentDate}`,
  ].join("\n");
}

// Sums every ৳ amount found in the products text (code-computed, not
// left to the AI's own arithmetic — same "don't trust the model for
// correctness-critical state" reasoning as the rest of this order
// flow). Requires the system prompt to actually put a price on each
// item in the products field (see TAKING AN ORDER's own rule for
// this) — returns null rather than a misleading "Total: ৳0" when no
// prices are present in the text at all.
function computeOrderTotal(productsText: string): number | null {
  const matches = [...productsText.matchAll(/৳\s?([\d,]+)/g)];
  if (matches.length === 0) return null;
  return matches.reduce((sum, m) => sum + Number(m[1]!.replace(/,/g, "")), 0);
}

function orderSummaryMessage(fields: OrderFields, lang: "bangla" | "banglish" | "english"): string {
  const total = computeOrderTotal(fields.products);

  // Real markdown bullets, not \n-separated lines — a single "\n" is a
  // soft line break in CommonMark (collapses into the same paragraph,
  // no visible break at all), which is exactly what was happening: the
  // whole summary rendered as one run-on line in the dashboard's
  // transcript view. A list item always starts its own line regardless.
  if (lang === "bangla") {
    const totalLine = total !== null ? `\n- সর্বমোট: ৳${total.toLocaleString("en-US")}` : "";
    return `আপনার অর্ডার নিশ্চিত করতে বিস্তারিত দেখুন:\n\n- নাম: ${fields.customerName}\n- ফোন: ${fields.phone}\n- ঠিকানা: ${fields.deliveryAddress}\n- পণ্য: ${fields.products}${totalLine}\n- পেমেন্ট: ${fields.paymentMethod}\n\nসব তথ্য ঠিক থাকলে "confirm" লিখুন।`;
  }
  if (lang === "banglish") {
    const totalLine = total !== null ? `\n- Mot: ৳${total.toLocaleString("en-US")}` : "";
    return `Order confirm korar age details dekhe nin:\n\n- Naam: ${fields.customerName}\n- Phone: ${fields.phone}\n- Address: ${fields.deliveryAddress}\n- Product: ${fields.products}${totalLine}\n- Payment: ${fields.paymentMethod}\n\nShob thik thakle "confirm" likhun.`;
  }
  const totalLine = total !== null ? `\n- Total: ৳${total.toLocaleString("en-US")}` : "";
  return `Please confirm your order details:\n\n- Name: ${fields.customerName}\n- Phone: ${fields.phone}\n- Address: ${fields.deliveryAddress}\n- Product: ${fields.products}${totalLine}\n- Payment: ${fields.paymentMethod}\n\nReply "confirm" if everything is correct.`;
}

// Deliberately narrow and multilingual-anchored, not a general sentiment
// classifier — only fires the deterministic finalize-order shortcut for
// an unambiguous, short confirmation. Anything longer or more specific
// (a correction, a question) falls through to the normal AI path so the
// customer can still amend a detail before confirming. Token-based, not
// one big regex — a real customer wrote "Hae, confirm" (two affirmative
// words with a comma), which a single anchored alternation rejects
// outright; splitting on whitespace/punctuation and requiring every
// token to be a known affirmative word covers that without turning into
// a general sentiment classifier.
const AFFIRMATIVE_WORDS = new Set([
  "yes", "yep", "yeah", "yup", "ok", "okay", "correct", "confirm", "confirmed",
  "right", "thik", "ache", "হ্যাঁ", "ঠিক", "আছে", "hae", "ji", "jee",
]);

function isAffirmative(message: string): boolean {
  const tokens = message
    .trim()
    .toLowerCase()
    .split(/[\s,!.]+/)
    .filter(Boolean);

  return tokens.length > 0 && tokens.length <= 4 && tokens.every((t) => AFFIRMATIVE_WORDS.has(t));
}

// The handoff summary is a short internal note for a human agent, not a
// customer-facing answer — a smaller cap is appropriate and keeps this
// background call cheap regardless of which provider handles it.
const SUMMARY_MAX_TOKENS = 300;

const HANDOFF_MESSAGE_EN =
  "I don't have any information about that in our knowledge base. Let me connect you with a team member who can help — they'll pick up right where this conversation left off.";

const HANDOFF_MESSAGE_BN =
  "এই বিষয়ে আমাদের নলেজ বেসে কোনো তথ্য নেই। আমি আপনাকে একজন টিম মেম্বারের সাথে সংযুক্ত করছি — তিনি এই কথোপকথন যেখানে শেষ হয়েছে সেখান থেকেই শুরু করবেন।";

// 4 variants, not 1 fixed line — a customer sending several messages
// while waiting (very common; see discount-question example that
// prompted this) was getting the exact same sentence back verbatim
// every time, which reads as broken/robotic rather than "a person has
// this." Picked deterministically per message (same greetingIndex
// trick as the greeting replies above) so it varies without an AI call.
const ALREADY_WAITING_MESSAGES_EN = [
  "Thanks for reaching out! Our team already has your message and will reply here shortly — feel free to share any more details in the meantime.",
  "Appreciate your patience! A team member has your message and will get back to you here soon.",
  "Got it — you're already with our team on this, they'll reply here shortly. Feel free to add anything else in the meantime.",
  "Thanks for the message! Our team's already looking into this and will reply here shortly.",
];

const ALREADY_WAITING_MESSAGES_BN = [
  "যোগাযোগ করার জন্য ধন্যবাদ! আমাদের টিম আপনার বার্তা পেয়েছে এবং শীঘ্রই এখানে উত্তর দেবে — এর মধ্যে আরও কিছু জানানোর থাকলে নির্দ্বিধায় লিখুন।",
  "ধৈর্য ধরার জন্য ধন্যবাদ! আমাদের একজন টিম মেম্বার আপনার বার্তা দেখেছেন, শীঘ্রই এখানে উত্তর দেবেন।",
  "বুঝেছি — এই বিষয়ে আপনি ইতিমধ্যে আমাদের টিমের সাথে আছেন, তারা শীঘ্রই উত্তর দেবেন। এর মধ্যে আরও কিছু জানাতে চাইলে নির্দ্বিধায় লিখুন।",
  "বার্তার জন্য ধন্যবাদ! আমাদের টিম এই বিষয়ে দেখছে, শীঘ্রই এখানে উত্তর দেবে।",
];

const ORDER_CONFIRMED_MESSAGE_EN = "Your order is confirmed and will be delivered soon. Thank you!";
const ORDER_CONFIRMED_MESSAGE_BN = "আপনার অর্ডারটি নিশ্চিত করা হয়েছে এবং শীঘ্রই ডেলিভারি করা হবে। ধন্যবাদ!";
const ORDER_CONFIRMED_MESSAGE_BANGLISH = "Apnar order confirm kora hoyeche, shigroi deliver kore deya hobe. Dhonnobad!";

/** Appended to the confirmation reply the moment an order row actually
 * exists — same "code generates the correctness-critical text, not the
 * AI" reasoning as orderSummaryMessage. Order id shortened to its last 8
 * chars as a human-readable invoice number; full id stays in the DB. */
function invoiceMessage(fields: OrderFields, orderId: string, lang: "bangla" | "banglish" | "english"): string {
  const total = computeOrderTotal(fields.products);
  const invoiceNo = orderId.slice(-8).toUpperCase();

  if (lang === "bangla") {
    const totalLine = total !== null ? `\n- সর্বমোট: ৳${total.toLocaleString("en-US")}` : "";
    return `${ORDER_CONFIRMED_MESSAGE_BN}\n\n**ইনভয়েস #${invoiceNo}**\n- নাম: ${fields.customerName}\n- ফোন: ${fields.phone}\n- ঠিকানা: ${fields.deliveryAddress}\n- পণ্য: ${fields.products}${totalLine}\n- পেমেন্ট: ${fields.paymentMethod}`;
  }
  if (lang === "banglish") {
    const totalLine = total !== null ? `\n- Mot: ৳${total.toLocaleString("en-US")}` : "";
    return `${ORDER_CONFIRMED_MESSAGE_BANGLISH}\n\n**Invoice #${invoiceNo}**\n- Naam: ${fields.customerName}\n- Phone: ${fields.phone}\n- Address: ${fields.deliveryAddress}\n- Product: ${fields.products}${totalLine}\n- Payment: ${fields.paymentMethod}`;
  }
  const totalLine = total !== null ? `\n- Total: ৳${total.toLocaleString("en-US")}` : "";
  return `${ORDER_CONFIRMED_MESSAGE_EN}\n\n**Invoice #${invoiceNo}**\n- Name: ${fields.customerName}\n- Phone: ${fields.phone}\n- Address: ${fields.deliveryAddress}\n- Product: ${fields.products}${totalLine}\n- Payment: ${fields.paymentMethod}`;
}

const HANDOFF_MESSAGE_BANGLISH =
  "Dukkhito, amader knowledge base e ei bishoye kono tothyo nei. Ami apnake ekjon team member-er sathe connect kore dicchi — uni ei conversation ja jekhane sesh hoyeche sekhan theke shuru korben.";

const ALREADY_WAITING_MESSAGES_BANGLISH = [
  "Jogajog korar jonno dhonnobad! Amader team apnar message peyeche, shiggiri eikhane reply korbe — er moddhe aro kichu janar thakle nishchinte likhun.",
  "Dhoirjo dhorar jonno dhonnobad! Amader ekjon team member apnar message dekheche, shiggiri eikhane reply korben.",
  "Bujhlam — ei bishoye apni already amader team er sathe achen, tara shiggiri reply korben. Er moddhe aro kichu janate chaile nishchinte likhun.",
  "Message er jonno dhonnobad! Amader team eta niye dekhche, shiggiri eikhane reply korbe.",
];

// A plain greeting has no real content to reason about, yet letting the
// LLM generate a reply for it is where nonsense like "How can Amader
// help you today?" comes from — the "always say Amader, never Apnar"
// business-identity rule (meant for Bangla/Banglish sentences) bleeding
// into an English sentence where "Amader" isn't even a word. A greeting
// is 100% predictable, so it gets a fixed, always-correct reply instead
// of a roll of the dice — also skips retrieval/LLM entirely, so it's
// instant and free. Must match the ENTIRE trimmed message, not just
// contain a greeting word, so "hi, what's the price of X" still goes
// through the real pipeline.
const GREETING_BN = /^(হ্যালো|হাই|সালাম|আসসালামু\s*আলাইকুম)[।!?\s]*$/;
const GREETING_BANGLISH = /^(assalamu\s*[-']?\s*alaikum|salam|hi|hello|hey|heyy+|yo|ki\s*obostha|kemon\s*(acho|achen|acen)|kmn\s*(acho|achen))[.!?\s]*$/i;
const GREETING_EN = /^(hi+|hello|hey+|hiya|yo|good\s*(morning|afternoon|evening))[.!?\s]*$/i;

// 10 variants per register instead of one fixed line — a customer who
// says "hi" gets a different greeting than the last one, and a repeat
// customer doesn't see the exact same canned sentence every visit.
// Picked deterministically (see greetingIndex below), not randomly —
// same reasoning as the rest of this file: a "roll of the dice" isn't
// needed here, a stable hash already gives natural-feeling variety.
const GREETING_MESSAGES_EN = [
  "Hi! How can I help you today?",
  "Hello! What can I do for you?",
  "Hey there! How can I help?",
  "Hi, welcome! What are you looking for today?",
  "Hello! Ask me anything about our products.",
  "Hi there! How can I assist you today?",
  "Hey! What can I help you find today?",
  "Hello, thanks for reaching out! How can I help?",
  "Hi! What brings you here today?",
  "Hey there, how can I be of help?",
];

const GREETING_MESSAGES_BN = [
  "হ্যালো! আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  "আসসালামু আলাইকুম! আপনাকে কী বিষয়ে সাহায্য করতে পারি?",
  "হাই! বলুন, কী জানতে চান?",
  "স্বাগতম! আজ আপনার জন্য কী করতে পারি?",
  "হ্যালো! কোনো পণ্য নিয়ে জিজ্ঞাসা থাকলে বলুন।",
  "হাই! কীভাবে সাহায্য করতে পারি বলুন তো।",
  "আসসালামু আলাইকুম! কী খুঁজছেন আজ?",
  "হ্যালো! আপনার প্রশ্নটা বলুন, দেখি কী করা যায়।",
  "হাই! কী জানতে চাচ্ছেন?",
  "হ্যালো! আজ কীভাবে সহায়তা করতে পারি?",
];

const GREETING_MESSAGES_BANGLISH = [
  "Hi! Ami apnake ki bhabe shahajjo korte pari?",
  "Assalamu alaikum! Ki bishoye shahajjo lagbe?",
  "Hi! Bolun, ki jante chan?",
  "Welcome! Aj apnar jonno ki korte pari?",
  "Hello! Kono product niye jiggasha thakle bolun.",
  "Hi! Kivabe help korte pari bolun to.",
  "Assalamu alaikum! Aj ki khujchen?",
  "Hello! Apnar proshno ta bolun, dekhi ki kora jay.",
  "Hi! Ki jante chachhen?",
  "Hello! Aj kivabe shahajjo korte pari?",
];

/** Deterministic 0-9 pick from the session + message, not a random
 * roll — same session saying "hi" twice in a row still varies (the
 * message text differs each call), while staying reproducible rather
 * than genuinely random. */
function greetingIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 10;
}

/** Returns the canned greeting reply if this message is nothing but a
 * greeting, else null. Bangla-script and the common Banglish greeting
 * words (salam, assalamualaikum, kemon achen) resolve their own
 * language directly; a bare "hi"/"hello" defers to the business's
 * language setting/heuristic via cannedMessageLanguage, same as every
 * other canned message in this file. */
function greetingReply(languageMode: string, userMessage: string, sessionId: string): string | null {
  const trimmed = userMessage.trim();
  const idx = greetingIndex(sessionId + trimmed);

  if (GREETING_BN.test(trimmed)) {
    return GREETING_MESSAGES_BN[idx]!;
  }

  if (GREETING_BANGLISH.test(trimmed) && !GREETING_EN.test(trimmed)) {
    return GREETING_MESSAGES_BANGLISH[idx]!;
  }

  if (GREETING_EN.test(trimmed)) {
    const lang = cannedMessageLanguage(languageMode, userMessage);
    return lang === "bangla" ? GREETING_MESSAGES_BN[idx]! : lang === "banglish" ? GREETING_MESSAGES_BANGLISH[idx]! : GREETING_MESSAGES_EN[idx]!;
  }

  return null;
}

// ponytail: Bangla-script detection only (Unicode block ঀ-৿) —
// cheap and exact, no AI call needed for these canned messages. Banglish
// (romanized Bengali) isn't reliably detectable by regex, so it falls
// back to the English canned message; real Banglish handling is the
// system prompt's job, for actual LLM-generated answers.
function isBangla(text: string): boolean {
  return /[ঀ-৿]/.test(text);
}

// Common romanized-Bangla function words/verb forms — none of these are
// also common English words, so a match is a reliable signal without
// needing a real language-detection library. Not exhaustive; a message
// with none of these just falls through to "english" below, same as the
// canned-message path already does for anything it can't classify.
const BANGLISH_MARKER =
  /\b(ami|apni|apnar|amar|amader|ache|nei|koto|taka|korte|korbo|korben|korlam|korlen|korchi|lagbe|chai|chaan|chachhen|chachhi|bhai|thik|hoyeche|hobe|hocche|nibo|niben|nite|shob|shudhu|gulo|ta|deben|den|kemon|keno|kobe|kothay|jonno|theke|diye|giye|geche|bhalo|valo|vlo|hae|naki|dhonnobad|assalamu|jante|janan|bolun|bolen|pathan|pathaben|apnara)\b/i;

/** Deterministic per-turn detection of the CUSTOMER's message language —
 * unlike languageLockInstruction (an admin-set hard override) or
 * languageHintInstruction (a soft one-time widget preference), this runs
 * every turn against request.message itself, so "auto" mode stops being
 * a bare "match the customer" hint the model can drift on and becomes an
 * actual per-message check. Only applies in "auto" mode — a locked
 * language already wins outright via languageLockInstruction. Returns ""
 * when the message has no detectable language (empty, numbers/emoji
 * only) rather than forcing a guess. */
function autoLanguageCheckInstruction(languageMode: string, userMessage: string): string {
  if (languageMode !== "auto") return "";

  const detected = detectLanguage(userMessage);
  if (!detected) return "";

  const LABEL: Record<string, string> = {
    bangla: "natural Bangla (Bengali script)",
    banglish: "Banglish (Bangla written in Latin/Roman letters)",
    english: "English",
  };

  return `\n\nLANGUAGE CHECK (runs every turn): the customer's most recent message is written in ${LABEL[detected]}. Reply in ${LABEL[detected]} for this turn, matching their script/register exactly — regardless of what language earlier turns in this conversation used.`;
}

/** Same three-way classification as autoLanguageCheckInstruction, reused
 * on the CUSTOMER's message (to decide what's expected) and on the AI's
 * own reply (to verify it actually complied) — the check this whole
 * mechanism is named for. Exported logic kept as one function so both
 * sides of the comparison can never drift out of sync with each other. */
function detectLanguage(text: string): "bangla" | "banglish" | "english" | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isBangla(trimmed)) return "bangla";
  if (BANGLISH_MARKER.test(trimmed)) return "banglish";
  if (/[a-zA-Z]{2,}/.test(trimmed)) return "english";
  return null;
}

/** Which register to use for the canned (non-LLM) messages below — when
 * the business has locked a language, canned messages respect the lock
 * too instead of mirroring the customer like "auto" mode does. */
function cannedMessageLanguage(languageMode: string, userMessage: string): "english" | "bangla" | "banglish" {
  if (languageMode === "english" || languageMode === "bangla" || languageMode === "banglish") {
    return languageMode;
  }
  return isBangla(userMessage) ? "bangla" : "english";
}

/** Prepended-none, appended-last so it reads as the most recent/most
 * specific instruction — a strong override the model can't miss,
 * regardless of how the rest of the (fully admin-editable) system
 * prompt is worded. Returns "" for "auto", meaning no override at all:
 * the base prompt's own "match the customer's register" instructions
 * apply exactly as they always have. */
function languageLockInstruction(languageMode: string): string {
  const LANGUAGE_LABEL: Record<string, string> = {
    english: "English",
    bangla: "natural Bangla (Bengali script)",
    banglish: "Banglish (Bangla written in Latin/Roman letters)",
  };

  const label = LANGUAGE_LABEL[languageMode];
  if (!label) return "";

  return `\n\nHARD LANGUAGE LOCK — STRICT, NON-NEGOTIABLE, OVERRIDES EVERYTHING ABOVE (including any "match the customer's language" instruction elsewhere in this prompt): this business has locked ALL replies to ${label}. This is a hard setting, not a preference — there is no exception to it, ever.
- Understand the customer's message in whatever language or register they actually wrote it in — that part is unrestricted.
- Your reply, however, is ALWAYS in ${label} — every single message, with zero exceptions.
- Do NOT switch language mid-conversation. Do NOT mirror the customer's language. Do NOT switch even if the customer explicitly asks you to reply in a different language, insists, or writes only in that other language for the rest of the conversation.
- If any earlier instruction in this prompt says to match/mirror the customer's language, that instruction is overridden by this lock and no longer applies.`;
}

/** The widget's start-of-chat language picker (see widget.js) — a soft
 * starting preference, not a lock: only applied when the business hasn't
 * hard-locked the language (languageLockInstruction above already wins if
 * so), and explicitly subordinate to the base prompt's existing "match
 * whatever language the customer's CURRENT message is written in" rule —
 * the moment they type in a different language, that rule takes over,
 * exactly as it already does for a customer who never picked at all. */
function languageHintInstruction(languageMode: string, hint?: string): string {
  if (languageMode !== "auto" && languageMode) return "";

  const HINT_LABEL: Record<string, string> = {
    english: "English",
    bangla: "Bangla (Bengali script)",
  };

  const label = hint ? HINT_LABEL[hint] : undefined;
  if (!label) return "";

  return `\n\nThe customer selected "${label}" from this chat's start-of-conversation language picker — default to replying in ${label} unless/until their own message is clearly written in a different language, in which case follow this prompt's normal "match the customer's current message" rule instead, exactly as if they hadn't picked anything.`;
}

// Folds recent turns into the string embedded for retrieval — a bare
// "price?" carries almost no signal alone, but "is X authentic? ...
// price?" retrieves the right chunks. Last 4 messages (2 full turns),
// not just 2 (1 turn) — confirmed live: a real 3-question narrowing
// flow ("air compressor?" -> "cheapest one?" -> "anything cheaper than
// THAT?") lost the "air compressor" category anchor by the third
// question with only a 2-message window, and the answer came back with
// an unrelated cheap product (a drill machine) instead. Still
// deliberately bounded, not the whole history, so retrieval stays
// focused on the current subject rather than diluted by genuinely old,
// unrelated turns.
function buildRetrievalQuery(history: ConversationMessage[], currentMessage: string): string {
  const recent = history.slice(-4).map((m) => m.content).join(" ");
  return recent ? `${recent} ${currentMessage}`.trim() : currentMessage;
}

/** Unions two retrieval passes by chunk id, keeping the higher score when
 * both found the same chunk. See the call site's comment for why a second,
 * history-free pass exists at all. */
function mergeRetrievedChunks(
  a: RetrievedChunk[] | null,
  b: RetrievedChunk[] | null
): RetrievedChunk[] {
  if (!b || b.length === 0) return a ?? [];
  if (!a || a.length === 0) return b;

  const byId = new Map<string, RetrievedChunk>();
  for (const chunk of [...a, ...b]) {
    const existing = byId.get(chunk.id);
    if (!existing || chunk.score > existing.score) {
      byId.set(chunk.id, chunk);
    }
  }

  return Array.from(byId.values()).sort((x, y) => y.score - x.score);
}

export class ChatService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly retriever: Retriever,
    private readonly prompts: PromptEngine,
    private readonly ai: AIManager,
    private readonly embeddings: EmbeddingManager,
    private readonly responseCache: ResponseCache,
    private readonly usageLog: ChatUsageLog,
    private readonly aiConfig: AiConfigService,
    private readonly vectorStore: VectorStoreManager,
    private readonly masterCsv: MasterCsvService,
    private readonly orders: OrderService,
    private readonly contacts?: ContactService,
    private readonly vision?: VisionService,
    private readonly repairs?: RepairAppointmentService
  ) {}

  // Two messages from the same customer arriving close together (a
  // WhatsApp user firing off "too expensive" then "anything cheaper?" a
  // few seconds apart, before the first reply has landed) used to run as
  // two fully concurrent chat() calls. Each one reads conversation
  // history at its own start, so the second call's retrieval/prompt often
  // couldn't see the first call's message yet — and both replies land
  // independently, sometimes racing each other or contradicting one
  // another (one saying "no info", the other answering correctly moments
  // later, confirmed live on a real WhatsApp conversation). Chaining every
  // call for the same sessionId through this queue makes them run one at
  // a time in arrival order — same guarantee a customer typing separate
  // messages in a live human chat already gets. Different sessions still
  // run fully in parallel; this only serializes within one conversation.
  private readonly conversationLocks = new Map<string, Promise<unknown>>();

  private runSequentially<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.conversationLocks.get(sessionId) ?? Promise.resolve();
    const run = previous.then(fn, fn);

    // Swallow so an earlier failure doesn't poison the chain for later
    // messages, and don't hold the map entry open once nothing is
    // waiting on it — a long-lived process would otherwise accumulate one
    // entry per session id forever.
    const tracked = run.then(
      () => {},
      () => {}
    );
    this.conversationLocks.set(sessionId, tracked);
    tracked.finally(() => {
      if (this.conversationLocks.get(sessionId) === tracked) {
        this.conversationLocks.delete(sessionId);
      }
    });

    return run;
  }

  // 200K chars (~50K tokens) — conservative, safely under the smallest
  // context window among every currently-rotated provider (Groq/Mistral/
  // Cerebras are ~128K tokens), leaving headroom for system prompt,
  // history, and output. A business whose whole indexed knowledge base
  // fits under this budget skips retrieval entirely (see chat()) — the
  // same reason uploading a small doc straight into Gemini/ChatGPT "just
  // works": nothing needs to be found because nothing was left out.
  private static readonly FULL_CONTEXT_CHAR_BUDGET = 200_000;

  /** Null if the business's knowledge base is too large for full-context
   * mode (falls back to normal chunk retrieval) — otherwise every unique
   * chunk of text they have, shaped as RetrievedChunk[] so it's a drop-in
   * replacement for retriever.retrieve()'s return value. */
  private async getFullContextIfSmallEnough(
    businessId: string
  ): Promise<RetrievedChunk[] | null> {
    const texts = await this.vectorStore.listUniqueChunkTexts(businessId);
    const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

    if (texts.length === 0 || totalChars > ChatService.FULL_CONTEXT_CHAR_BUDGET) {
      return null;
    }

    return texts.map((text, i) => ({ id: `full-context-${i}`, text, score: 1 }));
  }

  /** The scheduled knowledge-refresh job's consolidated CSV — every
   * product/price/spec across every crawled page and uploaded document
   * for this business, in one place. Owner's own words: the AI should
   * scan this when answering, not just whatever a handful of top-K
   * chunks happened to surface. Always tried first and merged ALONGSIDE
   * (never instead of) normal retrieval/full-context below — the master
   * CSV only updates on its schedule, so live retrieval still covers
   * anything newer, and prose content the CSV doesn't include at all.
   * Null if none exists yet or it's grown past a sane single-prompt
   * budget (same reasoning/size as FULL_CONTEXT_CHAR_BUDGET). */
  private async getMasterCsvChunkIfAvailable(businessId: string): Promise<RetrievedChunk | null> {
    const csv = await this.masterCsv.get(businessId);
    if (!csv || !csv.content || csv.content.length > ChatService.FULL_CONTEXT_CHAR_BUDGET) {
      return null;
    }

    return { id: "master-csv", text: csv.content, score: 1 };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.runSequentially(request.sessionId, () => this.chatSequential(request));
  }

  private async chatSequential(
    request: ChatRequest
  ): Promise<ChatResponse> {

    const businessId = request.businessId ?? "default";

    // Read live, every request — this is the whole point of moving it
    // out of hardcoded constants: a dashboard edit takes effect on the
    // very next message, no redeploy or restart.
    const config = await this.aiConfig.getCurrent(businessId);

    const conversation =
      await this.conversations.getOrCreate(
        request.sessionId,
        businessId,
        request.isTraining ? "trainer" : "anonymous",
        request.isTraining ?? false,
        request.channel ?? "website",
        request.externalUserId ?? null
      );

    // Fetched before this turn's message is recorded, so it's "everything
    // said so far" — exactly what the prompt needs to resolve a follow-up
    // like "the price" against whatever product was just discussed.
    const priorHistory =
      await this.conversations.history(
        request.sessionId,
        config.historyTurns
      );

    // A customer-sent photo is resolved to text ONCE, right here, before
    // anything downstream touches request.message — see VisionService's
    // own comment for why this deliberately reuses the existing text
    // retrieval pipeline instead of a separate image-similarity index.
    // effectiveMessage (customer's own words, if any, plus a bracketed
    // [photo] note) is what gets stored to the transcript, retrieved on,
    // and shown to the model; isAffirmative/order-marker/language checks
    // below keep reading the raw request.message on purpose, so a
    // bracketed suffix can never accidentally satisfy those pattern
    // checks (e.g. a "yes" order-confirmation match).
    let effectiveMessage = request.message;
    // When visionMode is "mimo", forward the raw image URL to the AI
    // provider so MiMo can see the actual pixels. The VisionService
    // text description still runs for search/retrieval indexing.
    let forwardImageUrl: string | undefined;
    if (request.imageUrl && this.vision) {
      const imageContext = await this.vision.describeImage(request.imageUrl);
      if (imageContext) {
        const imageNote = `[Customer sent a photo. What it shows: ${imageContext.description}.${imageContext.readText ? ` Text visible in the photo: "${imageContext.readText}".` : ""}]`;
        effectiveMessage = request.message.trim() ? `${request.message}\n${imageNote}` : imageNote;
      } else {
        effectiveMessage = request.message.trim()
          ? request.message
          : "[Customer sent a photo, but it couldn't be read this turn.]";
      }
      // Forward raw image when vision mode is "mimo"
      if (config.visionMode === "mimo") {
        forwardImageUrl = request.imageUrl;
      }
    }

    await this.conversations.addMessage(
      request.sessionId,
      "user",
      effectiveMessage
    );

    // A pending order (all 5 fields collected, waiting on the customer's
    // confirmation — see ORDER_PENDING_PATTERN's comment) finalizes right
    // here in code the moment the customer sends a plain "yes"/"thik
    // ache", skipping the AI/retrieval pipeline entirely for this turn.
    // Anything else (a correction, a question) falls through to the
    // normal path below, leaving pendingOrder untouched in case a later
    // message does confirm it.
    if (isOrderComplete(conversation.pendingOrder) && isAffirmative(request.message)) {
      const pending = conversation.pendingOrder;
      const createdOrder = await this.orders.create({
        businessId,
        conversationId: request.sessionId,
        customerName: pending.customerName,
        phone: pending.phone,
        deliveryAddress: pending.deliveryAddress,
        products: pending.products,
        paymentMethod: pending.paymentMethod,
      });
      await this.conversations.setPendingOrder(request.sessionId, null);
      // Non-blocking — never delay the customer's confirmation waiting
      // on CRM bookkeeping.
      this.contacts
        ?.upsert({ businessId, name: pending.customerName, phone: pending.phone })
        .catch(() => {});

      const orderLang = cannedMessageLanguage(config.languageMode, request.message);
      const orderMessage = invoiceMessage(pending, createdOrder.id, orderLang);

      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        orderMessage,
        "order"
      );

      return {
        answer: orderMessage,
        provider: "order",
        tokens: 0,
        confidence: 1,
        messageId: savedMessage.id,
      };
    }

    // Same deterministic finalize pattern as orders — a pending repair
    // (all required fields collected) finalizes the moment the customer
    // sends a plain "yes"/"confirm", bypassing the AI entirely.
    if (this.repairs && isRepairComplete(conversation.pendingRepair) && isAffirmative(request.message)) {
      const pending = conversation.pendingRepair;
      const trackingToken = await this.repairs.generateTrackingToken();
      await this.repairs.book({
        businessId,
        trackingToken,
        customerName: pending.customerName,
        phone: pending.phone,
        email: pending.email || undefined,
        deviceType: pending.deviceType,
        deviceModel: pending.deviceModel || undefined,
        issueDescription: pending.issueDescription,
        appointmentDate: new Date(pending.appointmentDate),
      });
      await this.conversations.setPendingRepair(request.sessionId, null);

      // Create tracking conversation + handoff (same as RepairController.book)
      await this.conversations.getOrCreate(trackingToken, businessId, "customer", false, "repair-tracking", null);
      await this.conversations.requestHandoff(trackingToken, "repair appointment", "New repair appointment booked via chat");

      // Non-blocking CRM upsert
      this.contacts
        ?.upsert({ businessId, name: pending.customerName, phone: pending.phone, email: pending.email || undefined })
        .catch(() => {});

      const reply = repairConfirmedMessage(pending, trackingToken);
      const savedMessage = await this.conversations.addMessage(request.sessionId, "assistant", reply, "repair");

      return {
        answer: reply,
        provider: "repair",
        tokens: 0,
        confidence: 1,
        messageId: savedMessage.id,
      };
    }

    // Confirmed live: a customer handed off hours ago (or a stale test
    // conversation from before this fix) got the same "you're waiting"
    // reply forever, even with no agent ever actually engaging — nothing
    // ever gave the bot back control. Past HANDOFF_STALE_MS since the
    // handoff was last requested/refreshed (see handoffRequestedAt's own
    // comment — an agent reply resets this clock, so an actively-worked
    // handoff never auto-expires), treat it as abandoned and let this
    // message go through the normal AI pipeline below, same as a
    // brand-new conversation.
    const handoffAge = conversation.handoffRequestedAt ? Date.now() - conversation.handoffRequestedAt.getTime() : null;
    const handoffIsStale = handoffAge !== null && handoffAge > HANDOFF_STALE_MS;

    if (handoffIsStale) {
      await this.conversations.setHandoffStatus(request.sessionId, "bot");
      conversation.handoffStatus = "bot";
    }

    // Already being handled by a human — don't let the bot jump back in.
    // (Doesn't record this as a message: the customer's real messages
    // while waiting should just accumulate for the agent to read, not
    // get interleaved with a repeated "you're waiting" notice.) Skipped
    // entirely for a Training Arena session — the whole point there is
    // to keep talking to the AI after it hands off, to correct exactly
    // that behavior, not to simulate the real "you're waiting" UX.
    if (!conversation.isTraining && conversation.handoffStatus !== "bot") {
      const lang = cannedMessageLanguage(config.languageMode, request.message);
      const idx = greetingIndex(request.sessionId + request.message);
      const variants =
        lang === "bangla" ? ALREADY_WAITING_MESSAGES_BN : lang === "banglish" ? ALREADY_WAITING_MESSAGES_BANGLISH : ALREADY_WAITING_MESSAGES_EN;
      return {
        answer: variants[idx % variants.length]!,
        provider: "human",
        tokens: 0,
        confidence: 0,
        handoff: true,
      };
    }

    // A plain "hi"/"salam" gets a fixed, always-grammatical reply
    // instead of an LLM roll of the dice — see greetingReply's own
    // comment for why. Checked after the already-waiting handoff (a
    // human taking over still wins) but before retrieval/LLM, so it's
    // instant and costs nothing.
    const greeting = greetingReply(config.languageMode, request.message, request.sessionId);
    if (greeting) {
      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        greeting,
        "canned"
      );

      this.usageLog.record({
        chatId: request.sessionId,
        provider: "canned",
        tokens: 0,
        confidence: 1,
        createdAt: new Date().toISOString(),
      });

      return {
        answer: greeting,
        provider: "canned",
        tokens: 0,
        confidence: 1,
        messageId: savedMessage.id,
      };
    }

    // A bare follow-up ("price?" right after "is the X authentic?") has
    // almost no retrievable signal on its own — embedding just that turn
    // finds weak/wrong chunks, confidence falls under the handoff floor,
    // and the conversation gets handed off before the history-aware
    // prompt below ever gets a chance to resolve "price of what". Folding
    // the most recent turn into the RETRIEVAL query (not the final answer
    // prompt, which already gets full history correctly) fixes this —
    // it's the same "follow-ups need context" reasoning the cache skip
    // just below already applies, just applied one step earlier.
    const retrievalQuery = buildRetrievalQuery(priorHistory, effectiveMessage);

    const queryEmbeddingResult =
      await this.embeddings.embed(retrievalQuery);
    const queryEmbedding = queryEmbeddingResult.embedding;
    const queryEmbeddingProvider = queryEmbeddingResult.provider;

    // The semantic cache only makes sense for a standalone, context-free
    // question (classic FAQ). A short follow-up like "price" is only
    // meaningful alongside the conversation before it, so skip the cache
    // once there IS prior history — otherwise it could confidently return
    // a cached answer for a completely different product.
    const cached =
      priorHistory.length === 0
        ? this.responseCache.find(queryEmbedding, businessId, queryEmbeddingProvider)
        : null;

    if (cached) {
      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        cached.answer,
        `${cached.provider} (cached)`
      );

      this.usageLog.record({
        chatId: request.sessionId,
        provider: `${cached.provider} (cached)`,
        tokens: 0,
        confidence: cached.confidence,
        createdAt: new Date().toISOString(),
      });

      return {
        answer: cached.answer,
        provider: cached.provider,
        tokens: 0,
        confidence: cached.confidence,
        cached: true,
        messageId: savedMessage.id,
      };
    }

    // Deliberately NOT passing queryEmbedding/queryEmbeddingProvider here
    // (unlike the cache lookup above, which legitimately wants one fixed
    // vector to key on) — retrieval needs to search every embedding
    // provider's space and merge by score, not just whichever single
    // provider rotation picked for the cache key. See
    // VectorStoreRetriever.retrieve()'s own comment for why.
    const fullContext = await this.getFullContextIfSmallEnough(businessId);

    // full-context mode already hands the model every chunk this
    // business has (tabular included) — the master CSV would be pure
    // duplication there. It matters for the businesses that DON'T
    // qualify for full-context (too large): those still only get top-K
    // retrieval by default, so prepending the master CSV is what
    // actually gives the model the whole table at once for them.
    //
    // The master CSV lookup (one indexed DB read) and retrieval (multi-
    // provider embedding + vector search) are independent — run them in
    // parallel, not sequentially, so adding the CSV lookup doesn't add
    // its own latency on top of retrieval's. Confirmed live: awaiting
    // them one after another pushed an already-borderline-slow business
    // past this route's 12s hard timeout on every call.
    const __tRetrieveStart = Date.now();
    // When there's prior history, retrievalQuery is the last few turns
    // glued to the current message (see buildRetrievalQuery) — that helps
    // a genuine follow-up ("price?" after "the X") but actively HURTS a
    // clean topic switch: real case found live, "20mm stand drill machine
    // dam koto?" then "cheapest welding machine konta?" — the combined
    // query is dominated by drill-machine text, so the vector search
    // returns drill chunks for a plain, unambiguous welding-machine
    // question, and the model correctly says it has no info because the
    // right chunks were never even in its context. Retrieving on the raw
    // current message too and merging catches exactly this: a topic
    // switch surfaces on its own query, a real follow-up still benefits
    // from the history-augmented one, and unrelated-topic noise from the
    // combined query gets outscored by the plain query's cleaner match
    // for the same document instead of silently winning by being the
    // only one asked. Skipped entirely when there's no history since the
    // two queries would be identical.
    const [masterCsvChunk, retrievedFromSearch, retrievedFromCurrentOnly] = fullContext
      ? [null, null, null]
      : await Promise.all([
          this.getMasterCsvChunkIfAvailable(businessId),
          this.retriever.retrieve(retrievalQuery, { businessId }),
          priorHistory.length > 0
            ? this.retriever.retrieve(effectiveMessage, { businessId })
            : Promise.resolve(null),
        ]);
    console.log(`[perf] retrieve took ${Date.now() - __tRetrieveStart}ms`);

    const mergedSearchResults = mergeRetrievedChunks(retrievedFromSearch, retrievedFromCurrentOnly);

    const retrievedRaw =
      fullContext ??
      [...(masterCsvChunk ? [masterCsvChunk] : []), ...mergedSearchResults];

    // Groq's per-account token-per-minute budget (12,000 on the 70B
    // model at last check, HALF that on the 8B one) counts one large
    // request's own tokens against it, not just cumulative usage -- a
    // single call over budget always 413s, no amount of waiting fixes
    // it. Sibling-chunk expansion capped per-document (see
    // vector-store-retriever.ts) but nothing capped the TOTAL across
    // every matched document -- a multi-clause question matching
    // several products could still stack up 80k+ chars (~20k tokens)
    // and blow the limit outright. fullContext/master-CSV already have
    // their own explicit budget (FULL_CONTEXT_CHAR_BUDGET) for the same
    // reason; this applies it to the normal top-K + sibling-expansion
    // path too. Keeps the highest-scored chunks, drops the rest --
    // exactly what "top-K" already means, just enforced by size as well
    // as count.
    // Raised alongside the retriever's wider top-K (see
    // vector-store-retriever.ts) -- still leaves headroom under Groq
    // 70B's 12,000 TPM cap after the ~1,460-token system prompt, history,
    // and the maxTokens generation reserve (up to 1,536) are counted in.
    const RETRIEVAL_CONTEXT_CHAR_BUDGET = 32_000;

    // A topic switch's own best matches can legitimately score LOWER in
    // raw cosine similarity than an old topic's near-exact match pulled
    // in by the history-augmented query — a plain global sort-by-score
    // then fills the whole budget with yesterday's subject and the
    // current, perfectly answerable question never makes it into context
    // at all. Real case found live: "20mm stand drill machine dam koto?"
    // then "cheapest welding machine konta?" — the drill product's exact
    // name match scored ~0.90, welding's own best match only ~0.75, so a
    // plain sort crowded out every welding chunk and the AI said it had
    // no information on welding machines it clearly has in stock.
    // Reserving half the budget for the CURRENT message's own retrieval
    // pass, filled first regardless of how it compares to the other
    // pass's scores, guarantees today's question is always answerable;
    // the remaining half still favors whichever chunks (from either pass)
    // score highest, preserving the follow-up-resolution benefit history-
    // augmentation exists for.
    let runningChars = 0;
    const includedIds = new Set<string>();
    const retrieved: RetrievedChunk[] = [];

    if (fullContext) {
      retrieved.push(...retrievedRaw);
    } else {
      const RESERVED_FOR_CURRENT_MESSAGE = RETRIEVAL_CONTEXT_CHAR_BUDGET / 2;
      const currentMessageChunks = [...(retrievedFromCurrentOnly ?? [])].sort(
        (a, b) => b.score - a.score
      );

      for (const chunk of currentMessageChunks) {
        if (runningChars >= RESERVED_FOR_CURRENT_MESSAGE) break;
        includedIds.add(chunk.id);
        retrieved.push(chunk);
        runningChars += chunk.text.length;
      }

      const rest = [...retrievedRaw].sort((a, b) => b.score - a.score);
      for (const chunk of rest) {
        if (runningChars >= RETRIEVAL_CONTEXT_CHAR_BUDGET) break;
        if (includedIds.has(chunk.id)) continue;
        includedIds.add(chunk.id);
        retrieved.push(chunk);
        runningChars += chunk.text.length;
      }
    }
    console.log(
      `[perf] retrieved ${retrieved.length}/${retrievedRaw.length} chunks, ${retrieved.reduce((s, c) => s + c.text.length, 0)} chars`
    );

    // Top retrieval score doubles as a rough "grounding confidence" for
    // this answer — how well the knowledge base actually backs it. Shown
    // in the dashboard; no longer gates whether the AI gets to attempt
    // an answer (see the retrieved.length check below for why).
    const confidence = retrieved[0]?.score ?? 0;
    const sources = buildSources(retrieved);

    // Only skip the LLM entirely when there is LITERALLY nothing indexed
    // for this business (a genuinely empty knowledge base) — this used to
    // check `confidence < config.handoffFloor` instead, which also fired
    // for perfectly normal messages with low semantic similarity to any
    // chunk (a plain "hello" scores ~0 against a product catalog with no
    // greeting content) and handed off BEFORE the AI ever got a chance to
    // greet naturally, exactly as its own system prompt already tells it
    // to. The AI's own [[NEEDS_HUMAN]] marker (below) is now the accurate
    // decision-maker for "can't help"/"customer asked for a human" — this
    // check's only remaining job is to avoid wasting an LLM call on a
    // business with zero indexed content at all. Training Arena sessions
    // never take this shortcut regardless of retrieval results — the
    // platform-wide Training Arena has NO knowledge base by design (it's
    // for testing general behavior, not product content), so this check
    // would otherwise fire on every single message there and the AI
    // would never actually be reached — defeating the entire feature.
    if (!request.isTraining && retrieved.length === 0) {
      const fullHistory = [
        ...priorHistory,
        { id: "pending", role: "user" as const, content: effectiveMessage, provider: null, sources: null, confidence: null, createdAt: new Date() },
      ];
      const { summary, tokens: summaryTokens } = await this.buildHandoffSummary(fullHistory);
      await this.conversations.requestHandoff(
        request.sessionId,
        "empty_knowledge_base",
        summary
      );

      const handoffLang = cannedMessageLanguage(config.languageMode, request.message);
      const handoffMessage =
        handoffLang === "bangla"
          ? HANDOFF_MESSAGE_BN
          : handoffLang === "banglish"
            ? HANDOFF_MESSAGE_BANGLISH
            : HANDOFF_MESSAGE_EN;

      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        handoffMessage,
        "handoff",
        sources,
        confidence
      );

      this.usageLog.record({
        chatId: request.sessionId,
        provider: "handoff",
        tokens: summaryTokens,
        confidence,
        createdAt: new Date().toISOString(),
      });

      return {
        answer: handoffMessage,
        provider: "handoff",
        tokens: summaryTokens,
        confidence,
        handoff: true,
        messageId: savedMessage.id,
        sources,
      };
    }

    const prompt =
      this.prompts.build({
        systemPrompt:
          config.systemPrompt +
          languageLockInstruction(config.languageMode) +
          autoLanguageCheckInstruction(config.languageMode, request.message) +
          languageHintInstruction(config.languageMode, request.languageHint),
        context:
          retrieved.map(chunk => chunk.text),
        history:
          priorHistory.map(m => ({ role: m.role, content: m.content })),
        userMessage:
          effectiveMessage,
      });

    console.log(
      `[perf] prompt chars: system=${prompt.systemPrompt.length} user=${prompt.userPrompt.length}`
    );
    const __tAiStart = Date.now();
    const aiCallOptions = {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP ?? undefined,
      frequencyPenalty: config.frequencyPenalty ?? undefined,
      presencePenalty: config.presencePenalty ?? undefined,
      stop: config.stopSequences
        ? config.stopSequences.split(",").map(s => s.trim()).filter(Boolean)
        : undefined,
      seed: config.seed ?? undefined,
    };
    let aiResponse =
      await this.ai.chat(
        prompt.userPrompt,
        { ...aiCallOptions, systemPrompt: prompt.systemPrompt, imageUrl: forwardImageUrl }
      );
    console.log(`[perf] ai.chat took ${Date.now() - __tAiStart}ms, provider=${aiResponse.provider}`);

    // Confirmed live: providers vary in how reliably they include the
    // ORDER_FIELDS/ORDER_TAKEN marker, especially mid-flow (a reply that
    // reads perfectly normal to the customer, but silently drops the one
    // field-progress marker the whole order-taking system depends on —
    // that turn's info never gets merged into pendingOrder at all). Only
    // retryable/detectable once an order is ALREADY in progress
    // (pendingOrder non-null) — before that, a marker-less reply is
    // completely normal (most messages aren't about ordering). One retry
    // with an explicit reminder, not a silent drop — real order accuracy
    // is worth one extra call.
    if (
      conversation.pendingOrder &&
      !ORDER_FIELDS_PATTERN.test(aiResponse.response) &&
      !ORDER_MARKER_PATTERN.test(aiResponse.response)
    ) {
      console.log(`[perf] retrying: missing ORDER_FIELDS marker mid-order`);
      const retrySystemPrompt =
        prompt.systemPrompt +
        `\n\nREMINDER: an order is already in progress in this conversation and your last reply forgot the required [[ORDER_FIELDS:{...}]] marker. End THIS reply with that marker on its own line, using your current best understanding of all 5 fields (customerName, phone, deliveryAddress, products, paymentMethod — "" for any still unknown), as valid JSON in English, exactly as instructed under TAKING AN ORDER.`;
      aiResponse = await this.ai.chat(prompt.userPrompt, { ...aiCallOptions, systemPrompt: retrySystemPrompt });
      console.log(`[perf] retry ai.chat done, provider=${aiResponse.provider}, marker present=${ORDER_FIELDS_PATTERN.test(aiResponse.response) || ORDER_MARKER_PATTERN.test(aiResponse.response)}`);
    }

    // Same retry pattern for repair field collection — if a repair is
    // in progress and the AI dropped the marker, retry once with a
    // reminder.
    if (
      this.repairs &&
      conversation.pendingRepair &&
      !REPAIR_FIELDS_PATTERN.test(aiResponse.response) &&
      !REPAIR_MARKER_PATTERN.test(aiResponse.response) &&
      !ORDER_FIELDS_PATTERN.test(aiResponse.response) &&
      !ORDER_MARKER_PATTERN.test(aiResponse.response)
    ) {
      console.log(`[perf] retrying: missing REPAIR_FIELDS marker mid-repair`);
      const retrySystemPrompt =
        prompt.systemPrompt +
        `\n\nREMINDER: a repair appointment is already being collected in this conversation and your last reply forgot the required [[REPAIR_FIELDS:{...}]] marker. End THIS reply with that marker on its own line, using your current best understanding of all fields (deviceType, deviceModel, issueDescription, customerName, phone, email, appointmentDate — "" for any still unknown), as valid JSON in English, exactly as instructed under BOOKING A REPAIR.`;
      aiResponse = await this.ai.chat(prompt.userPrompt, { ...aiCallOptions, systemPrompt: retrySystemPrompt });
      console.log(`[perf] retry ai.chat done for repair, provider=${aiResponse.provider}, marker present=${REPAIR_FIELDS_PATTERN.test(aiResponse.response) || REPAIR_MARKER_PATTERN.test(aiResponse.response)}`);
    }

    // Deterministic language enforcement, not just a prompt hint — the
    // system prompt's own "match the customer's language" wording has a
    // confirmed history of drifting (see AI Brain change log). Compute
    // what language THIS reply is required to be in (the admin's lock if
    // one is set, else whatever the customer's own current message is
    // detected as), then actually check the AI's reply against it and
    // retry — with an explicit correction — until it complies or a
    // bounded attempt count is exhausted. Owner-mandated hard
    // requirement (confirmed live: a single retry could still miss,
    // e.g. a reply that opens with "Amader" — a Bangla brand-voice habit
    // — trips detectLanguage into "banglish" even for an otherwise-
    // English reply); MAX_LANGUAGE_RETRIES bounds it so a
    // stubbornly-noncompliant provider can't loop forever.
    const expectedReplyLanguage: "bangla" | "banglish" | "english" | null =
      config.languageMode === "english" || config.languageMode === "bangla" || config.languageMode === "banglish"
        ? config.languageMode
        : detectLanguage(request.message);

    if (expectedReplyLanguage) {
      const LANGUAGE_RETRY_LABEL: Record<string, string> = {
        bangla: "natural Bangla (Bengali script)",
        banglish: "Banglish (Bangla written in Latin/Roman letters)",
        english: "English",
      };
      const MAX_LANGUAGE_RETRIES = 2;

      let strippedForCheck = "";
      let markersSuffix = "";

      for (let attempt = 0; attempt < MAX_LANGUAGE_RETRIES; attempt++) {
        const hasHandoff = aiResponse.response.includes(HANDOFF_MARKER);
        const orderFieldsMatch = aiResponse.response.match(ORDER_FIELDS_PATTERN)?.[0] ?? "";
        const orderMarkerMatch = aiResponse.response.match(ORDER_MARKER_PATTERN)?.[0] ?? "";
        strippedForCheck = aiResponse.response
          .replaceAll(HANDOFF_MARKER, "")
          .replace(ORDER_MARKER_PATTERN, "")
          .replace(ORDER_FIELDS_PATTERN, "")
          .trim();
        markersSuffix = [hasHandoff ? HANDOFF_MARKER : "", orderFieldsMatch, orderMarkerMatch].filter(Boolean).join("\n");

        const actualReplyLanguage = detectLanguage(strippedForCheck);

        if (!actualReplyLanguage || actualReplyLanguage === expectedReplyLanguage) {
          strippedForCheck = "";
          break;
        }

        console.log(`[perf] retrying (${attempt + 1}/${MAX_LANGUAGE_RETRIES}): reply language mismatch (expected ${expectedReplyLanguage}, got ${actualReplyLanguage})`);
        const retrySystemPrompt =
          prompt.systemPrompt +
          `\n\nREMINDER: your last reply was NOT in the required language. Rewrite your ENTIRE reply in ${LANGUAGE_RETRY_LABEL[expectedReplyLanguage]} only, keeping the same meaning and any required markers — do not mix languages. Do not open with a Bangla word like "Amader" if the required language is English.`;
        aiResponse = await this.ai.chat(prompt.userPrompt, { ...aiCallOptions, systemPrompt: retrySystemPrompt });
        console.log(`[perf] language retry ${attempt + 1} done, provider=${aiResponse.provider}`);
      }

      // Confirmed live: a provider can ignore "reply in English" twice in
      // a row when its base system prompt carries a strong Bangla brand
      // voice (e.g. habitually opening with "Amader") — "regenerate the
      // whole answer, but in a different language this time" competes
      // against that voice and loses. A pure translation instruction
      // doesn't: there's no persona/voice to fight, just "convert this
      // text," which models follow far more reliably. Last-resort only,
      // after the regenerate loop above is exhausted, so it costs one
      // extra call solely on the stubborn-drift path, not every turn.
      if (strippedForCheck) {
        console.log(`[perf] regenerate retries exhausted, falling back to direct translation into ${expectedReplyLanguage}`);
        const translation = await this.ai.chat(
          `Translate the following text into ${LANGUAGE_RETRY_LABEL[expectedReplyLanguage]}. Preserve every number, price, and product name exactly. Output ONLY the translated text, with no preamble, quotes, or commentary.\n\n${strippedForCheck}`,
          { ...aiCallOptions, systemPrompt: "You are a precise translator. Output only the translated text." }
        );
        aiResponse = { ...aiResponse, response: markersSuffix ? `${translation.response.trim()}\n${markersSuffix}` : translation.response.trim() };
        console.log(`[perf] translation fallback done, provider=${translation.provider}`);
      }
    }

    // Confirmed live: the AI can emit BOTH the handoff marker AND real
    // order-field progress in the exact same reply — a genuine model
    // confusion artifact from teaching it multiple marker types for one
    // conversation flow, not a real "I can't help, connect a human"
    // decision (the reply was a perfectly normal order-confirmation
    // question). If the AI made real order progress this turn, a
    // simultaneous handoff signal is untrustworthy noise and gets
    // suppressed rather than yanking the customer out of an order flow
    // they're actively completing successfully.
    const hasOrderProgressThisTurn =
      ORDER_FIELDS_PATTERN.test(aiResponse.response) || ORDER_MARKER_PATTERN.test(aiResponse.response);

    const hasRepairProgressThisTurn =
      REPAIR_FIELDS_PATTERN.test(aiResponse.response) || REPAIR_MARKER_PATTERN.test(aiResponse.response);

    // The AI itself decided (see HANDOFF_MARKER's comment) — strip the
    // marker before the customer ever sees it either way.
    const wantsHandoff =
      !hasOrderProgressThisTurn &&
      !hasRepairProgressThisTurn &&
      (aiResponse.response.includes(HANDOFF_MARKER) ||
        HANDOFF_INTENT_FALLBACK.test(aiResponse.response));

    // Same marker mechanism, for a completed order instead of a handoff —
    // see ORDER_MARKER_PATTERN's own comment. Stripped before the handoff
    // stage below so an order confirmation (which never also needs a
    // human) doesn't get double-processed.
    const orderMatch = aiResponse.response.match(ORDER_MARKER_PATTERN);
    let sameTurnOrder: { id: string; fields: OrderFields } | null = null;
    if (orderMatch) {
      try {
        const parsed = JSON.parse(orderMatch[1]!) as Record<string, unknown>;
        const field = (key: string) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "");
        const customerName = field("customerName") || field("name");
        const phone = field("phone");
        const deliveryAddress = field("deliveryAddress") || field("address");
        const products = field("products");
        const paymentMethod = field("paymentMethod") || field("payment");

        if (customerName && phone && deliveryAddress && products && paymentMethod) {
          const fields = { customerName, phone, deliveryAddress, products, paymentMethod };
          const createdOrder = await this.orders.create({
            businessId,
            conversationId: request.sessionId,
            ...fields,
          });
          sameTurnOrder = { id: createdOrder.id, fields };
          this.contacts?.upsert({ businessId, name: customerName, phone }).catch(() => {});
          // Clears whatever ORDER_PENDING this same-message finalize may
          // have superseded — otherwise a stale pendingOrder from an
          // earlier turn could get finalized a second time by an
          // unrelated later "yes".
          await this.conversations.setPendingOrder(request.sessionId, null);
        }
      } catch (err) {
        console.error("[ChatService] failed to parse ORDER_TAKEN payload:", err);
      }
    }

    // The AI's own best-effort snapshot of every order field it currently
    // understands — merged into (never replacing) whatever was already
    // known, see mergeOrderFields' own comment for why this beats trusting
    // the AI's turn-to-turn memory directly.
    const orderFieldsMatch = aiResponse.response.match(ORDER_FIELDS_PATTERN);
    const wasOrderCompleteBefore = isOrderComplete(conversation.pendingOrder);
    let mergedOrderFields: Record<string, string> | null = conversation.pendingOrder;
    if (orderFieldsMatch) {
      try {
        const parsed = JSON.parse(orderFieldsMatch[1]!) as Record<string, unknown>;
        mergedOrderFields = mergeOrderFields(conversation.pendingOrder, extractOrderFields(parsed));
        await this.conversations.setPendingOrder(request.sessionId, mergedOrderFields);
      } catch (err) {
        console.error("[ChatService] failed to parse ORDER_FIELDS payload:", err);
      }
    }

    // Same pattern for repair fields — merge incoming non-empty fields
    // into the running pendingRepair state.
    const repairFieldsMatch = aiResponse.response.match(REPAIR_FIELDS_PATTERN);
    const wasRepairCompleteBefore = isRepairComplete(conversation.pendingRepair);
    let mergedRepairFields: Record<string, string> | null = conversation.pendingRepair;
    if (repairFieldsMatch) {
      try {
        const parsed = JSON.parse(repairFieldsMatch[1]!) as Record<string, unknown>;
        mergedRepairFields = mergeRepairFields(conversation.pendingRepair, extractRepairFields(parsed));
        await this.conversations.setPendingRepair(request.sessionId, mergedRepairFields);
      } catch (err) {
        console.error("[ChatService] failed to parse REPAIR_FIELDS payload:", err);
      }
    }

    const strippedAnswer = aiResponse.response
      .replaceAll(HANDOFF_MARKER, "")
      .replace(ORDER_MARKER_PATTERN, "")
      .replace(ORDER_FIELDS_PATTERN, "")
      .replace(REPAIR_MARKER_PATTERN, "")
      .replace(REPAIR_FIELDS_PATTERN, "")
      .trim();

    const orderLang = cannedMessageLanguage(config.languageMode, request.message);

    // Once code (not the AI) determines all 5 fields are known, code also
    // generates the confirmation-request text itself — the AI is removed
    // from the correctness-critical "did I actually present the right
    // details" step entirely, not just the "did I remember them" step.
    // Only overrides the FIRST time completeness is reached this turn —
    // if it was already complete before this message (the customer asked
    // something else instead of confirming), let the AI answer that
    // normally rather than re-showing the same summary over and over.
    let cleanedAnswer = strippedAnswer;
    if (isOrderComplete(mergedOrderFields) && !wasOrderCompleteBefore) {
      cleanedAnswer = orderSummaryMessage(mergedOrderFields, orderLang);
    } else if (isRepairComplete(mergedRepairFields) && !wasRepairCompleteBefore) {
      cleanedAnswer = repairSummaryMessage(mergedRepairFields as RepairFields);
    } else if (!cleanedAnswer && orderMatch) {
      // Confirmed live: when an order finalizes via the AI's own same-
      // message ORDER_TAKEN path, its whole reply can end up being JUST
      // the marker (nothing else) -- stripping it then leaves the
      // customer staring at a blank bubble even though the order really
      // was created.
      cleanedAnswer =
        orderLang === "bangla" ? ORDER_CONFIRMED_MESSAGE_BN : orderLang === "banglish" ? ORDER_CONFIRMED_MESSAGE_BANGLISH : ORDER_CONFIRMED_MESSAGE_EN;
    }

    // Auto-invoice: whenever this turn actually created an order (same-
    // message ORDER_TAKEN path), append the itemized invoice regardless
    // of whatever the AI itself said — the AI's own reply is usually a
    // normal sentence like "your order is confirmed", not blank, so
    // relying on the empty-reply branch above alone would silently skip
    // the invoice most of the time.
    if (sameTurnOrder) {
      const invoice = invoiceMessage(sameTurnOrder.fields, sameTurnOrder.id, orderLang);
      cleanedAnswer = cleanedAnswer ? `${cleanedAnswer}\n\n${invoice}` : invoice;
    }

    let summaryTokens = 0;

    if (wantsHandoff) {
      const fullHistory = [
        ...priorHistory,
        { id: "pending", role: "user" as const, content: effectiveMessage, provider: null, sources: null, confidence: null, createdAt: new Date() },
      ];
      const built = await this.buildHandoffSummary(fullHistory);
      summaryTokens = built.tokens;
      await this.conversations.requestHandoff(
        request.sessionId,
        "ai_requested",
        built.summary
      );
    }

    const savedMessage = await this.conversations.addMessage(
      request.sessionId,
      "assistant",
      cleanedAnswer,
      wantsHandoff ? `${aiResponse.provider} (handoff)` : aiResponse.provider,
      sources,
      confidence
    );

    this.usageLog.record({
      chatId: request.sessionId,
      provider: wantsHandoff ? "handoff" : aiResponse.provider,
      // Includes the handoff summary's own LLM call cost when applicable
      // — previously silently dropped from the per-chat total (though it
      // was still counted in the aggregate provider totals), which made
      // the two token displays inconsistent for any handed-off chat.
      tokens: aiResponse.tokens + summaryTokens,
      confidence,
      createdAt: new Date().toISOString(),
    });

    // Same reasoning as the lookup above — only cache answers to
    // standalone first questions, not context-dependent follow-ups. Also
    // never cache a handoff — it's a decline, not a reusable answer, and
    // caching it would keep returning "let me connect you" for a
    // question a fixed knowledge base gap might answer correctly later.
    if (priorHistory.length === 0 && !wantsHandoff) {
      this.responseCache.store(
        queryEmbedding,
        businessId,
        effectiveMessage,
        cleanedAnswer,
        aiResponse.provider,
        confidence,
        queryEmbeddingProvider
      );
    }

    return {
      answer: cleanedAnswer,
      provider: aiResponse.provider,
      tokens: aiResponse.tokens,
      confidence,
      handoff: wantsHandoff || undefined,
      messageId: savedMessage.id,
      sources,
    };
  }

  private async buildHandoffSummary(
    history: ConversationMessage[]
  ): Promise<{ summary: string; tokens: number }> {
    const transcript = history
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    try {
      const result = await this.ai.chat(
        `Summarize this customer conversation in 2-3 sentences for a support agent taking over. Focus on what the customer wants and what's unresolved. The conversation may be in Bangla, Banglish, or English — write the summary in English regardless, since it's for internal review.\n\n${transcript}`,
        { maxTokens: SUMMARY_MAX_TOKENS }
      );
      return { summary: result.response, tokens: result.tokens };
    } catch {
      // Summary is a nice-to-have; never block the handoff on it.
      return {
        summary: `Conversation could not be auto-summarized. Last message: "${history.at(-1)?.content ?? ""}"`,
        tokens: 0,
      };
    }
  }
}
