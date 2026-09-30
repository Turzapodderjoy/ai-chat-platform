import { prisma } from "@ai-chat-platform/database";
import { resolveReplySettings, type ReplySettings } from "@ai-chat-platform/channel-catalog";

/** Resolves one business's effective reply settings: platform default
 * from the PlatformReplySettings singleton, overlaid with this
 * business's own override from Business.replySettings, overlaid on the
 * compiled-in defaults. See channel-catalog's reply-settings.ts for the
 * shape and what each number does.
 *
 * Called on the send path rather than cached: the panel that edits these
 * is in a client dashboard, and a stale cached pace would keep applying
 * to a customer who just asked for instant replies. It's two indexed
 * primary-key reads on a path that already spends seconds typing the
 * message out.
 *
 * A lookup failure must not stop a reply from going out, so every error
 * falls back to the defaults. */
export async function resolveReplySettingsFor(businessId: string): Promise<ReplySettings> {
  try {
    const [platform, business] = await Promise.all([
      prisma.platformReplySettings.findUnique({ where: { id: "default" } }),
      prisma.business.findUnique({ where: { id: businessId }, select: { replySettings: true } }),
    ]);
    return resolveReplySettings(platform?.settings, business?.replySettings);
  } catch {
    return resolveReplySettings(null, null);
  }
}
