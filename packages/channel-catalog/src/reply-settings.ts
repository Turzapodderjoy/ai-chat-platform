/** WhatsApp reply settings: one shape, one default, one parser.
 *
 * Every number the bot's WhatsApp reply timing depends on used to be a
 * hardcoded constant in evolution-shared.ts, so "why did the reply take
 * 14 seconds" was answerable only by reading source. They now live here,
 * are editable per business (Business.replySettings) with a platform-wide
 * default (PlatformReplySettings), and are re-read on every send.
 *
 * Lives in channel-catalog rather than a package of its own because that
 * package has zero dependencies -- both packages/api (which resolves and
 * passes the values) and chat-service (which needs handoffStaleMinutes)
 * depend on it without a cycle.
 *
 * Instant replies are a supported setting, not a special case: pace
 * everything (msPerWord, minDelayMs, maxDelayMs, thinking pauses) to 0
 * and no "typing…" indicator is sent and no timer is awaited, so the
 * reply goes out on the spot. That is the fastest a reply can be sent,
 * and it is also the pattern WhatsApp's anti-bot heuristics watch for on
 * an unofficial connection -- so the defaults here deliberately are NOT
 * instant. */

/** Per-business/per-platform reply behaviour. All fields are required
 * after parsing: a partial stored blob is filled in from the layer
 * below, so callers never deal with `number | undefined`. */
export interface ReplySettings {
  /** Centre of the simulated typing speed, ms per word. 0 = don't
   * simulate typing at all (combined with the min/max below, 0 = send
   * instantly). */
  msPerWord: number;
  /** Per-word random spread, 0..1. Plain `msPerWord * words` is itself a
   * bot signature -- real typing speed varies within a message. */
  wordJitter: number;
  /** Floor and ceiling on the wait before a bubble is sent. Setting both
   * to 0 is what "instant" means. */
  minDelayMs: number;
  maxDelayMs: number;
  /** How often a reply pauses mid-sentence as if the person changed
   * their mind, 0..1. */
  thinkPauseChance: number;
  thinkPauseMinMs: number;
  thinkPauseMaxMs: number;
  /** How many WhatsApp bubbles one reply is split into. 1 = one bubble. */
  maxChunks: number;
  /** How long a human handoff keeps the bot out of a conversation. Past
   * this, the bot may take over again automatically. Not WhatsApp-only
   * (every channel has handoffs) but edited from the same tab, because
   * "how long does the human get" is the same question as "how does the
   * bot reply". */
  handoffStaleMinutes: number;
}

/** Today's behaviour, unchanged: ~45 WPM with jitter, 0.9-7.5s per
 * bubble, an occasional thinking pause, 3 bubbles, 2h handoff. */
export const DEFAULT_REPLY_SETTINGS: ReplySettings = {
  msPerWord: 230,
  wordJitter: 0.35,
  minDelayMs: 900,
  maxDelayMs: 7500,
  thinkPauseChance: 0.2,
  thinkPauseMinMs: 400,
  thinkPauseMaxMs: 1300,
  maxChunks: 3,
  handoffStaleMinutes: 120,
};

/** Clamp ranges, chosen so a fat-fingered value can't wedge a reply:
 * an unbounded maxDelayMs would hold a webhook open for minutes (and
 * Evolution API would eventually time out), and an unbounded handoff
 * window would mean the bot never resumes. */
const RANGES: Record<keyof ReplySettings, [number, number]> = {
  msPerWord: [0, 5_000],
  wordJitter: [0, 1],
  minDelayMs: [0, 60_000],
  maxDelayMs: [0, 60_000],
  thinkPauseChance: [0, 1],
  thinkPauseMinMs: [0, 60_000],
  thinkPauseMaxMs: [0, 60_000],
  maxChunks: [1, 10],
  handoffStaleMinutes: [1, 10_080], // a week
};

function clampNumber(key: keyof ReplySettings, value: unknown, fallback: number): number {
  const [lo, hi] = RANGES[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
}

/** Parses one stored JSON blob into the fields it actually sets, with
 * every present value clamped and every absent/invalid one left out --
 * so the caller can layer it over a base with a plain object spread.
 * Never throws: these blobs are hand-editable in a database column. */
export function parseReplySettings(json: string | null | undefined): Partial<ReplySettings> {
  if (!json) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const source = parsed as Record<string, unknown>;
  const out: Partial<ReplySettings> = {};
  for (const key of Object.keys(RANGES) as (keyof ReplySettings)[]) {
    if (source[key] === undefined) continue;
    out[key] = clampNumber(key, source[key], DEFAULT_REPLY_SETTINGS[key]);
  }
  return out;
}

/** Layers business override over platform default over the compiled-in
 * defaults, then repairs the two ranges that are meaningless inverted
 * (a max below its min would make the clamp in typingDelayFor pick the
 * wrong end). */
export function resolveReplySettings(
  platformJson: string | null | undefined,
  businessJson: string | null | undefined
): ReplySettings {
  const merged: ReplySettings = {
    ...DEFAULT_REPLY_SETTINGS,
    ...parseReplySettings(platformJson),
    ...parseReplySettings(businessJson),
  };

  if (merged.minDelayMs > merged.maxDelayMs) {
    [merged.minDelayMs, merged.maxDelayMs] = [merged.maxDelayMs, merged.minDelayMs];
  }
  if (merged.thinkPauseMinMs > merged.thinkPauseMaxMs) {
    [merged.thinkPauseMinMs, merged.thinkPauseMaxMs] = [merged.thinkPauseMaxMs, merged.thinkPauseMinMs];
  }

  return merged;
}
