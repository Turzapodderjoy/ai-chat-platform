import { createApp, type Application } from "@ai-chat-platform/bootstrap";

// A plain module-level variable isn't reliably shared across every
// route.ts in Next.js dev (Turbopack can give different routes separate
// module instances) — same reason packages/database/src/client.ts stashes
// the Prisma client on globalThis instead of a module variable. Without
// this, /api/chat and /api/admin/handoffs/messages could each build their
// own Container with their own empty ConversationService.
const globalForApp = globalThis as unknown as {
  app?: Application;
};

export function getApp(): Application {
  if (!globalForApp.app) {
    globalForApp.app = createApp();
    globalForApp.app.start();
  }

  return globalForApp.app;
}
