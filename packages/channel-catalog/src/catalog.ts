import { websiteAdapter } from "./providers/website";
import { messengerAdapter } from "./providers/messenger";
import { instagramAdapter } from "./providers/instagram";
import { whatsappAdapter } from "./providers/whatsapp";
import { evolutionWhatsappAdapter } from "./providers/evolution-whatsapp";
import type { ChannelAdapter } from "./types";

/** Every messaging channel with a real adapter — same pattern as
 * PROVIDER_CATALOG/EMBEDDING_PROVIDER_CATALOG. Adding a channel later is
 * one adapter file + one entry here. */
export const CHANNEL_CATALOG: ChannelAdapter[] = [
  websiteAdapter,
  messengerAdapter,
  instagramAdapter,
  whatsappAdapter,
  evolutionWhatsappAdapter,
];
