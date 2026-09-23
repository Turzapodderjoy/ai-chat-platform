import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit (invoice PDF generation) pulls in fontkit, whose compiled
  // output imports a helper name that doesn't exist in the @swc/helpers
  // version Turbopack bundles with -- confirmed live, "Export
  // applyDecoratedDescriptor doesn't exist". Marking it external skips
  // bundling it entirely; it's loaded via plain Node require at
  // runtime instead, same as any other native/CJS-heavy package.
  serverExternalPackages: ["pdfkit", "fontkit"],
  transpilePackages: [
    "@ai-chat-platform/database",
    "@ai-chat-platform/bootstrap",
    "@ai-chat-platform/api",
    "@ai-chat-platform/chat-service",
    "@ai-chat-platform/conversation",
    "@ai-chat-platform/tenant",
    "@ai-chat-platform/channel-catalog",
    "@ai-chat-platform/channel-connections",
    "@ai-chat-platform/hermes",
    "@ai-chat-platform/billing",
    "@ai-chat-platform/client-auth",
    "@ai-chat-platform/widget-config",
    "@ai-chat-platform/dashboard-theme",
  ],
};

export default nextConfig;