import { resolveReplySettings } from "@ai-chat-platform/channel-catalog";
import { ConversationService, ConversationMessage, OrderService } from "@ai-chat-platform/conversation";
import { hermesChat, localBrainChat } from "@ai-chat-platform/hermes";
import type { ContactService } from "@ai-chat-platform/crm";
import type { RepairAppointmentService } from "@ai-chat-platform/repairs";
import { prisma } from "@ai-chat-platform/database";

import { ChatUsageLog } from "./chat-usage-log";
import type {
  ChatRequest,
  ChatResponse,
} from "./types";

// ── Hermes engine (Wave 3+) ──────────────────────────────────────────
// Every conversation on every business is answered by a Hermes profile
// (Nous Research agent). A provisioned business uses its own profile
// (own SOUL + durable per-conversation memory via X-Hermes-Session-Key);
// everything else — the platform "default" demo/portal business and any
// client that hasn't been given a profile or has toggled Hermes off —
// routes to one shared generic portal agent. There is no fallback LLM:
// the whole legacy retrieval/provider stack was deleted with it.
const DEFAULT_TENANT = "aiva-portal";

// Emitted by Hermes itself (see the system prompt's ANSWERING rules)
// when it can't help OR the customer explicitly asks for a human — the
// only reliable, language-agnostic handoff signal (an agent's
// instruction-following on a magic string is better than a heuristic,
// and a real customer never writes this literal marker).
const HANDOFF_MARKER = "[[NEEDS_HUMAN]]";

// Belt-and-suspenders for HANDOFF_MARKER: same phrasings the system
// prompt teaches the agent to use when it offers a human handoff or
// admits it has no information. A real customer question is never
// phrased this way; only the agent's own admission is.
const HANDOFF_INTENT_FALLBACK =
  /team member|কর্মীদলের সদস্য|knowledge base|তথ্য (নেই|নাই)|tothyo[^.]*(nei|nai)|don'?t have (that|this|any) (specific )?information/i;

// The booking bridge ("thin post-processor"): the agent collects order /
// repair-appointment details conversationally and, once the customer has
// confirmed the full summary, ends its reply with a single
// [[BOOKED:{...}]] line (see the system prompt's BOOKINGS section).
// Code below turns that payload into a real Order/RepairAppointment row
// and replaces the reply with a code-generated confirmation/invoice —
// exactly the legacy "don't trust the model for correctness-critical
// text" reasoning, kept as the one bridge between Hermes and the
// forms/booking flow. `\]{1,2}` tolerates a model dropping to a single
// bracket — seen live with the legacy markers.
const BOOKED_MARKER_PATTERN = /\[\[BOOKED:([^\]]*)\]{1,2}/;

const paris = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

interface BookedPayload {
  kind?: string;
  [key: string]: unknown;
}

// ── Booking fields ──────────────────────────────────────────────────
const ORDER_FIELD_KEYS = ["customerName", "phone", "deliveryAddress", "products", "paymentMethod"] as const;
type OrderFields = Record<(typeof ORDER_FIELD_KEYS)[number], string>;

const REPAIR_FIELD_KEYS = ["deviceType", "deviceModel", "issueDescription", "customerName", "phone", "email", "appointmentDate"] as const;
type RepairFields = Record<(typeof REPAIR_FIELD_KEYS)[number], string>;

/** The agent writes appointmentDate as a bare local-time string (no
 * timezone offset — it has no way to know one). `new Date(str)` would
 * silently interpret that string as the SERVER's timezone instead of
 * the business's, shifting the stored instant by however many hours
 * separate the two (confirmed live: a customer's stated "12:00 PM"
 * landed several hours off because this VPS runs UTC). Reinterprets a
 * clean "YYYY-MM-DD[THH:mm[:ss]]" string in the given IANA zone;
 * anything else falls back to a plain Date parse. */
function parseDateTimeInZone(input: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(input.trim());
  if (!match) return new Date(input);
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  const asUTC = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s);
  const tzDate = new Date(new Date(asUTC).toLocaleString("en-US", { timeZone }));
  const offset = asUTC - tzDate.getTime();
  return new Date(asUTC + offset);
}

// Sums every ৳ amount found in the products text (code-computed, not
// left to the agent's own arithmetic). The agent often appends its own
// "(Total: ৳X)" inside that text — strip every total phrasing first so
// only per-item prices are summed, otherwise the invoice double-counts.
// Returns null rather than a misleading "Total: ৳0" when no prices are
// present at all.
function computeOrderTotal(productsText: string): number | null {
  const cleaned = productsText.replace(/\(?\btotal:?\s*৳\s?[\d,]+\)?/gi, "");
  const matches = [...cleaned.matchAll(/৳\s?([\d,]+)/g)];
  if (matches.length === 0) return null;
  return matches.reduce((sum, m) => sum + Number(m[1]!.replace(/,/g, "")), 0);
}

const ORDER_CONFIRMED_MESSAGE_EN = "Your order is confirmed and will be delivered soon. Thank you!";
const ORDER_CONFIRMED_MESSAGE_BN = "আপনার অর্ডারটি নিশ্চিত করা হয়েছে এবং শীঘ্রই ডেলিভারি করা হবে। ধন্যবাদ!";
const ORDER_CONFIRMED_MESSAGE_BANGLISH = "Apnar order confirm kora hoyeche, shigroi deliver kore deya hobe. Dhonnobad!";

/** Appended to the confirmation the moment an order row actually exists.
 * Order id shortened to its last 8 chars as a human-readable invoice
 * number; full id stays in the DB. */
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

// ── Canned messages & language helpers (no LLM involved) ─────────────
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

const ALREADY_WAITING_MESSAGES_BANGLISH = [
  "Jogajog korar jonno dhonnobad! Amader team apnar message peyeche, shiggiri eikhane reply korbe — er moddhe aro kichu janar thakle nishchinte likhun.",
  "Dhoirjo dhorar jonno dhonnobad! Amader ekjon team member apnar message dekheche, shiggiri eikhane reply korben.",
  "Bujhlam — ei bishoye apni already amader team er sathe achen, tara shiggiri reply korben. Er moddhe aro kichu janate chaile nishchinte likhun.",
  "Message er jonno dhonnobad! Amader team eta niye dekhche, shiggiri eikhane reply korbe.",
];

// Used when the cloud brain is unreachable AND the local model can't be
// trusted with this customer's language (it is only wired for English —
// see localBrainPrompt). Always pairs with a handoff, because it promises
// a callback: a real person is the only thing that can answer next.
const BRAIN_DOWN_MESSAGES_EN = [
  "Sorry — our assistant system is having trouble right now, so I can't answer questions properly yet. I've passed your message to our team and someone will call you shortly. Could you share your name and phone number?",
  "Apologies, I'm having trouble reaching our system at the moment. Your message is with our team and a team member will call you back shortly. May I have your name and phone number?",
];

const BRAIN_DOWN_MESSAGES_BN = [
  "দুঃখিত — এই মুহূর্তে আমাদের সিস্টেমে সমস্যা হচ্ছে, তাই আপনার প্রশ্নের উত্তর দিতে পারছি না। আপনার বার্তাটি আমাদের টিমের কাছে পৌঁছেছে, একজন টিম মেম্বার শীঘ্রই আপনাকে ফোন করবেন। আপনার নাম ও ফোন নম্বরটা জানাবেন?",
  "দুঃখিত, এই মুহূর্তে সিস্টেমে সমস্যার কারণে ঠিকমতো উত্তর দিতে পারছি না। আপনার বার্তা টিমের কাছে আছে, একজন টিম মেম্বার শীঘ্রই কল করবেন। আপনার নাম ও ফোন নম্বর দেবেন?",
];

const BRAIN_DOWN_MESSAGES_BANGLISH = [
  "Dujkhit — eihon amader system-e somossha hocche, tai apnar prosno-ur uttor dite parchi na. Apnar barta amader team-e kase pouchheche, ekjon team member shiggiri apnake phone korben. Apnar naam o phone number ta janaben?",
  "Dujkhit, eihon system-e somosshar karone thik moto uttor dite parchi na. Apnar barta team-er kase ache, ekjon team member shiggiri call korben. Apnar naam o phone number debe na?",
];

const GREETING_BN = /^(হ্যালো|হাই|সালাম|আসসালামু\s*আলাইকুম)[।!?\s]*$/;
const GREETING_BANGLISH = /^(assalamu\s*[-']?\s*alaikum|salam|hi|hello|hey|heyy+|yo|ki\s*obostha|kemon\s*(acho|achen|acen)|kmn\s*(acho|achen))[.!?\s]*$/i;
const GREETING_EN = /^(hi+|hello|hey+|hiya|yo|good\s*(morning|afternoon|evening))[.!?\s]*$/i;

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

function greetingIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 10;
}

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

function isBangla(text: string): boolean {
  return /[ঀ-৿]/.test(text);
}

const BANGLISH_MARKER =
  /\b(ami|apni|apnar|amar|amader|ache|nei|koto|taka|korte|korbo|korben|korlam|korlen|korchi|lagbe|chai|chaan|chachhen|chachhi|bhai|thik|hoyeche|hobe|hocche|nibo|niben|nite|shob|shudhu|gulo|ta|deben|den|kemon|keno|kobe|kothay|jonno|theke|diye|giye|geche|bhalo|valo|vlo|hae|naki|dhonnobad|assalamu|jante|janan|bolun|bolen|pathan|pathaben|apnara)\b/i;

function detectLanguage(text: string): "bangla" | "banglish" | "english" | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isBangla(trimmed)) return "bangla";
  if (BANGLISH_MARKER.test(trimmed)) return "banglish";
  if (/[a-zA-Z]{2,}/.test(trimmed)) return "english";
  return null;
}

function cannedMessageLanguage(languageMode: string, userMessage: string): "english" | "bangla" | "banglish" {
  if (languageMode === "english" || languageMode === "bangla" || languageMode === "banglish") {
    return languageMode;
  }
  // detectLanguage (not isBangla) so romanized Bangla is recognized as
  // Banglish: a script check alone calls it English, and the customer then
  // gets an English line for a Bangla question.
  return detectLanguage(userMessage) ?? "english";
}

function languageLockInstruction(languageMode: string): string {
  const LANGUAGE_LABEL: Record<string, string> = {
    english: "English",
    bangla: "natural Bangla (Bengali script)",
    banglish: "Banglish (Bangla written in Latin/Roman letters)",
  };

  const label = LANGUAGE_LABEL[languageMode];
  if (!label) return "";

  return `\n\nHARD LANGUAGE LOCK — STRICT, NON-NEGOTIABLE, OVERRIDES EVERYTHING ABOVE: this business has locked all replies to ${label}. This is a hard setting, not a preference — there is no exception to it, ever. Do NOT switch language mid-conversation. Do NOT mirror the customer's language. Do NOT switch even if the customer explicitly asks you to reply in a different language.`;
}

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

function languageHintInstruction(languageMode: string, hint?: string): string {
  if (languageMode !== "auto") return "";

  const HINT_LABEL: Record<string, string> = {
    english: "English",
    bangla: "Bangla (Bengali script)",
  };

  const label = hint ? HINT_LABEL[hint] : undefined;
  if (!label) return "";

  return `\n\nThe customer selected "${label}" from this chat's start-of-conversation language picker — default to replying in ${label} unless/until their own message is clearly written in a different language, in which case follow the normal "match the customer's current message" rule instead.`;
}

// ── Hermes system prompt ─────────────────────────────────────────────
const unattendedBusinessInfo = (biz: BusinessChatInfo): string =>
  biz.name ? `You are the customer-facing chat assistant for ${biz.name}.` : "You are the customer-facing platform chat assistant.";

const NEVER_GR = JSON.stringify({
  kind: "order",
  customerName: "John Doe",
  phone: "+1 555 000 0000",
  deliveryAddress: "123 Main St, Springfield",
  products: "Screwdriver — ৳250, Drill — ৳3,200",
  paymentMethod: "Cash on delivery",
});

const REPAIR_GR = JSON.stringify({
  kind: "repair",
  deviceType: "mobile",
  deviceModel: "iPhone 12",
  issueDescription: "Screen cracked",
  customerName: "John Doe",
  phone: "+1 555 000 0000",
  email: "",
  appointmentDate: "2026-09-25 14:00",
});

function bookingsInstruction(biz: BusinessChatInfo): string {
  if (biz?.type === "repair") {
    return `\n\nBOOKING AN APPOINTMENT (repair client):
- When the customer wants to book a repair or appointment, collect these fields conversationally: deviceType, deviceModel (if known), issueDescription, customerName, phone, email (optional), appointmentDate (a date and time they pick).
- Once the customer has confirmed the full set in a clear summary YOU present back to them, end your reply with a single final line containing exactly: [[BOOKED:${REPAIR_GR}]]
- Replace every value and use English keys. Empty string for unknown optional fields. The marker must be the last line of your reply, used only after explicit confirmation, and never visible to a customer who hasn't confirmed yet.`;
  }
  return `\n\nTAKING AN ORDER:
- To take an order, collect these fields conversationally: customerName, phone, deliveryAddress, products (name each item with its ৳ price), paymentMethod.
- Show the customer a clear summary. Only AFTER they explicitly confirm it, close your reply with a final line containing exactly the marker: [[BOOKED:${NEVER_GR}]]
- Fill EVERY value in the marker with the real collected data, English keys, empty string for any missing field. The marker is the only signal that books the order — never confirm in prose alone, and never show the marker to a customer who hasn't confirmed.`;
}

function buildHermesSystemPrompt(request: ChatRequest, biz: BusinessChatInfo, languageMode: string): string {
  return [
    unattendedBusinessInfo(biz),
    "Reply conversationally and truthfully, in the customer's language. When the customer needs a real person — out-of-scope questions, refunds, warranty claims, disputes, or you genuinely cannot help — end your reply with a final line containing exactly: [[NEEDS_HUMAN]]",
    bookingsInstruction(biz),
    request.languageHint ? languageHintInstruction(languageMode, request.languageHint) : "",
    languageLockInstruction(languageMode),
    autoLanguageCheckInstruction(languageMode, request.message),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Persona for the LOCAL fallback brain, used for ENGLISH conversations
 * only (measured on the VPS: the 0.6B model is coherent in English but
 * produces gibberish in Bangla/Banglish and invents wrong "no, we don't
 * have that" answers — worse than the outage it replaces). Its one job is
 * the same as the canned messages: apologize, promise a callback, ask for
 * a name and number. Kept ~60 tokens — every prompt token costs the
 * customer a visible fraction of a second on a 4-vCPU box.
 */
function localBrainPrompt(bizName: string | null): string {
  const who = bizName ? `the customer service assistant for ${bizName}` : "a customer service assistant";
  return `You are ${who} writing ONE short message to a customer.

Rules, in priority order:
1. You must NOT answer their question, and must NOT say whether you have a product, its price, delivery, or stock. Even "yes we have it" or "no we don't" is forbidden — you genuinely do not know, and a wrong answer costs the shop a sale.
2. Do not repeat or paraphrase the question back.
3. Do exactly this in 2 short sentences: apologize briefly, say a team member will call back shortly, and ask for their name and phone number.

Example (customer asked: "do you have eggs?"):
"Apologies, I can't confirm that right now. A team member will call back shortly — could I get your name and phone number?"

Reply in English only.`;
}

interface BusinessChatInfo {
  name: string | null;
  type: string;
  hermesEnabled: boolean;
  hermesProfile: string | null;
  aiEnabled: boolean;
  languageMode: string;
  timezone: string | null;
  /** Raw JSON blob from Business.replySettings -- parsed (not read
   *  field-by-field) because only one number is needed here and the
   *  shape lives in one place, channel-catalog's reply-settings.ts. */
  replySettings: string | null;
}

// A conversation a human has been working for a while is theirs — never
// let the bot jump back in until it goes stale. The window is a setting:
// PlatformReplySettings.handoffStaleMinutes (mother dashboard) then
// Business.replySettings.handoffStaleMinutes (client dashboard), over the
// 2h default in channel-catalog's DEFAULT_REPLY_SETTINGS. One source of
// truth for the number, so the bot and the dashboard cannot disagree.

export class ChatService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly usageLog: ChatUsageLog,
    private readonly orders: OrderService,
    private readonly contacts?: ContactService,
    private readonly repairs?: RepairAppointmentService
  ) {}

  // Two messages from the same session arriving close together (a
  // WhatsApp user firing off "too expensive" then "anything cheaper?"
  // seconds apart) must run one at a time in arrival order — same
  // guarantee a human chat gives. Different sessions still parallel.
  private readonly conversationLocks = new Map<string, Promise<unknown>>();

  private runSequentially<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.conversationLocks.get(sessionId) ?? Promise.resolve();
    const run = previous.then(fn, fn);

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

  private async getDefaultLocationId(businessId: string): Promise<string | undefined> {
    const loc = await prisma.location.findFirst({
      where: { businessId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return loc?.id;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.runSequentially(request.sessionId, () => this.chatSequential(request));
  }

  private async chatSequential(request: ChatRequest): Promise<ChatResponse> {
    const businessId = request.businessId ?? "default";

    // A business's AI/language/hermes settings are read fresh on every
    // message — a dashboard toggle (AI Replies, Hermes Engine, language
    // lock) takes effect on the very next customer message, no restart.
    // The "default" (platform/portal) business has no row; every flag
    // defaults to the permissive value.
    const [biz, platformReply] = await Promise.all([
      businessId === "default"
        ? null
        : prisma.business.findUnique({
            where: { id: businessId },
            select: {
              name: true,
              type: true,
              hermesEnabled: true,
              hermesProfile: true,
              aiEnabled: true,
              languageMode: true,
              timezone: true,
              replySettings: true,
            },
          }),
      // The platform default row is what an admin edits in the mother
      // dashboard's Reply Timing tab, and it also governs the "default"
      // (portal) business, which has no row of its own.
      prisma.platformReplySettings.findUnique({ where: { id: "default" } }),
    ]);

    const languageMode = biz?.languageMode ?? "auto";

    const conversation =
      await this.conversations.getOrCreate(
        request.sessionId,
        businessId,
        "anonymous",
        false,
        request.channel ?? "website",
        request.externalUserId ?? null
      );

    // Fetched before this turn's message is recorded, so it's "everything
    // said so far" — sent to Hermes as in-turn history so a follow-up
    // like "the price" resolves against whatever was just discussed.
    const priorHistory =
      await this.conversations.history(
        request.sessionId,
        8
      );

    // A customer-sent photo is passed to Hermes as a real image_url content
    // part (the gateway accepts OpenAI vision shape). The text record stored
    // in the conversation still marks the attachment so a human reviewer — or
    // a later text-only turn — can see a photo was part of the exchange.
    let storedMessage = request.message;
    if (request.imageUrl) {
      const photoNote = "[Customer attached a photo this turn. Hermes can see it via the image_url part, so answer from the picture unless it asks you not to.]";
      storedMessage = request.message.trim() ? `${request.message}\n${photoNote}` : photoNote;
    }

    await this.conversations.addMessage(
      request.sessionId,
      "user",
      storedMessage
    );

    // A conversation a human has been working for a while is theirs —
    // don't let the bot jump back in. Past the resolved staleness window
    // (platform default, then this business's override, then the built-in
    // 2h) since the handoff was last requested/refreshed (an agent reply
    // resets the clock), treat it as abandoned and return the bot to hand
    // anyway, same as a brand-new conversation.
    const handoffStaleMs =
      resolveReplySettings(platformReply?.settings, biz?.replySettings).handoffStaleMinutes * 60_000;
    const handoffAge = conversation.handoffRequestedAt ? Date.now() - conversation.handoffRequestedAt.getTime() : null;
    const handoffIsStale = handoffAge !== null && handoffAge > handoffStaleMs;

    if (handoffIsStale) {
      await this.conversations.setHandoffStatus(request.sessionId, "bot");
      conversation.handoffStatus = "bot";
    }

    // Business-wide AI kill switch (Client Access panel's "AI Replies"):
    // checked ahead of the per-conversation handoff check so an
    // individual conversation's stale "bot" status can never bypass it.
    // Same for an already-being-handled conversation — the customer's
    // real messages accumulate for the agent instead of getting
    // interleaved with a repeated "you're waiting" notice (deliberately
    // not recorded as a new message).
    if ((biz && biz.aiEnabled === false) || conversation.handoffStatus !== "bot") {
      const lang = cannedMessageLanguage(languageMode, request.message);
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
    // instead of an agent roll of the dice — instant and free, and
    // prevents the "Amader" brand-voice bleed affecting English
    // greetings. Checked after the already-waiting handoff (a human
    // taking over still wins).
    const greeting = greetingReply(languageMode, request.message, request.sessionId);
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

    // ── Hermes engine (every business, every message) ──────────────
    // A provisioned + enabled business uses its own profile (own SOUL +
    // memory). Everything else routes to the shared portal tenant so no
    // customer is ever without an answer now that no legacy LLM exists.
    const movieTenant =
      biz?.hermesEnabled && biz?.hermesProfile ? biz.hermesProfile : DEFAULT_TENANT;

    try {
      const result = await hermesChat({
        tenant: movieTenant,
        message: request.message,
        imageUrl: request.imageUrl,
        sessionKey: `${businessId}:${request.sessionId}`,
        history: priorHistory
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        systemPrompt: buildHermesSystemPrompt(request, biz ?? { name: null, type: "regular", hermesEnabled: true, hermesProfile: null, aiEnabled: true, languageMode, timezone: null, replySettings: null }, languageMode),
      });

      const wantsHandoff =
        result.answer.includes(HANDOFF_MARKER) || HANDOFF_INTENT_FALLBACK.test(result.answer);

      // Booking bridge: a [[BOOKED:{...}]] payload (customer confirmed a
      // full order/repair) becomes a real Order / RepairAppointment row,
      // and the reply is replaced with a code-generated confirmation —
      // the agent stays out of the correctness-critical text.
      const bookedMatch = result.answer.match(BOOKED_MARKER_PATTERN);
      let finalAnswer: string | null = null;

      if (bookedMatch) {
        try {
          const parsed = JSON.parse(bookedMatch[1]!.trim()) as BookedPayload;
          if (parsed.kind === "order" && this.orders) {
            const fields: OrderFields = {
              customerName: paris(parsed.customerName),
              phone: paris(parsed.phone),
              deliveryAddress: paris(parsed.deliveryAddress),
              products: paris(parsed.products),
              paymentMethod: paris(parsed.paymentMethod),
            };
            if (fields.customerName && fields.phone && fields.deliveryAddress && fields.products && fields.paymentMethod) {
              const locationId = await this.getDefaultLocationId(businessId);
              const createdOrder = await this.orders.create({
                businessId,
                conversationId: request.sessionId,
                locationId,
                ...fields,
              });
              // Non-blocking — never delay the customer's confirmation
              // waiting on CRM bookkeeping.
              this.contacts
                ?.upsert({ businessId, name: fields.customerName, phone: fields.phone })
                .catch(() => {});
              finalAnswer = invoiceMessage(fields, createdOrder.id, cannedMessageLanguage(languageMode, request.message));
            }
          } else if (parsed.kind === "repair" && this.repairs) {
            const fields: RepairFields = {
              deviceType: paris(parsed.deviceType),
              deviceModel: paris(parsed.deviceModel),
              issueDescription: paris(parsed.issueDescription),
              customerName: paris(parsed.customerName),
              phone: paris(parsed.phone),
              email: paris(parsed.email),
              appointmentDate: paris(parsed.appointmentDate),
            };
            if (fields.deviceType && fields.issueDescription && fields.customerName && fields.phone && fields.appointmentDate) {
              const trackingToken = await this.repairs.generateTrackingToken();
              await this.repairs.book({
                businessId,
                trackingToken,
                locationId: await this.getDefaultLocationId(businessId),
                customerName: fields.customerName,
                phone: fields.phone,
                email: fields.email || undefined,
                deviceType: fields.deviceType,
                deviceModel: fields.deviceModel || undefined,
                issueDescription: fields.issueDescription,
                appointmentDate: parseDateTimeInZone(fields.appointmentDate, biz?.timezone ?? "America/New_York"),
              });
              // Tracking conversation + handoff (same as RepairController.book)
              await this.conversations.getOrCreate(trackingToken, businessId, "customer", false, "repair-tracking", null);
              await this.conversations.requestHandoff(trackingToken, "repair appointment", "New repair appointment booked via chat");
              this.contacts
                ?.upsert({ businessId, name: fields.customerName, phone: fields.phone, email: fields.email || undefined })
                .catch(() => {});
              finalAnswer = repairConfirmedMessage(fields, trackingToken);
            }
          }
        } catch (err) {
          console.error("[ChatService] failed to parse BOOKED payload:", err);
        }
      }

      const clean = result.answer
        .replaceAll(HANDOFF_MARKER, "")
        .replace(BOOKED_MARKER_PATTERN, "")
        .trim();

      const answer = finalAnswer ?? (clean || "I'm sorry, I couldn't finish that reply — can you say that again?");

      if (wantsHandoff) {
        await this.conversations.requestHandoff(
          request.sessionId,
          "Customer asked for a human (or out of scope)",
          clean.slice(0, 200)
        );
      }

      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        answer,
        "hermes",
        undefined,
        wantsHandoff ? 0 : 1
      );

      this.usageLog.record({
        chatId: request.sessionId,
        provider: "hermes",
        tokens: result.tokens,
        confidence: wantsHandoff ? 0 : 1,
        createdAt: new Date().toISOString(),
      });

      return {
        answer,
        provider: "hermes",
        tokens: result.tokens,
        confidence: wantsHandoff ? 0 : 1,
        handoff: wantsHandoff || undefined,
        messageId: savedMessage.id,
      };
    } catch (hermesErr) {
      // The cloud brain is down (the Nous free tier 404s a lot), so never
      // leave the customer with a raw error. Two fallback tiers:
      //   1. English + local VPS model up -> let the 0.6B write the
      //      "sorry, team will call you" line (measured coherent in
      //      English, ~4s, no tools/memory/vision).
      //   2. Everything else -> a canned line in the customer's own
      //      language. Deterministic: the local model is NOT used for
      //      Bangla/Banglish (gibberish) and neither tier invents prices,
      //      stock or policies.
      // Both promise a callback, so both raise a handoff for a human.
      // ponytail: deliberately not the Hermes agent — see localBrainChat's
      // note on why the 14.6K-token agent prompt can't run on this CPU.
      console.error(`[hermes] request failed for business ${businessId}:`, hermesErr);
      const lang = cannedMessageLanguage(languageMode, request.message);
      const fallbackHistory = priorHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const local =
        lang === "english"
          ? await localBrainChat({
              system: localBrainPrompt(biz?.name ?? null),
              history: fallbackHistory,
              message: request.message,
            })
          : null;

      const canned =
        lang === "bangla" ? BRAIN_DOWN_MESSAGES_BN : lang === "banglish" ? BRAIN_DOWN_MESSAGES_BANGLISH : BRAIN_DOWN_MESSAGES_EN;
      const answer = local?.answer ?? canned[greetingIndex(request.sessionId + request.message) % canned.length]!;
      const provider = local ? "local" : "canned";
      const tokens = local?.tokens ?? 0;

      // Not re-persisting the user message: it was already stored above.
      const savedMessage = await this.conversations.addMessage(
        request.sessionId,
        "assistant",
        answer,
        provider
      );
      this.conversations
        .requestHandoff(request.sessionId, "Cloud brain unavailable — fallback reply sent", request.message.slice(0, 200))
        .catch((err) => console.error("[ChatService] fallback handoff request failed:", err));
      this.usageLog.record({
        chatId: request.sessionId,
        provider,
        tokens,
        confidence: 0,
        createdAt: new Date().toISOString(),
      });

      return {
        answer,
        provider,
        tokens,
        confidence: 0,
        handoff: true,
        messageId: savedMessage.id,
      };
    }
  }
}