import type { ChannelAdapter } from "../types";

/** No OAuth, no webhook — "connecting" this channel just means displaying
 * the snippet. The client's page loads the widget script directly and
 * talks to /api/chat itself, same as the dashboard's own ChatWidget. */
export const websiteAdapter: ChannelAdapter = {
  id: "website",
  label: "Website",
  requiresPlatformApp: false,

  getEmbedSnippet(businessId: string, baseUrl: string): string {
    return `<script src="${baseUrl}/widget.js" data-business-id="${businessId}" async></script>`;
  },
};
