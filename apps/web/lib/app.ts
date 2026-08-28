import { createApp, type Application } from "@ai-chat-platform/bootstrap";

// A plain module-level variable isn't reliably shared across every
// route.ts in Next.js dev (Turbopack can give different routes separate
// module instances) — same reason packages/database/src/client.ts stashes
// the Prisma client on globalThis instead of a module variable. Without
// this, /api/chat and /api/admin/handoffs/messages could each build their
// own Container with their own empty ConversationService.
const globalForApp = globalThis as unknown as {
  appPromise?: Promise<Application>;
};

export function getApp(): Promise<Application> {
  if (!globalForApp.appPromise) {
    // createApp() does an up-front DB read (persisted provider keys/state).
    // If the database is briefly unreachable, that promise rejects — and if
    // we cached the rejection, every later request would 500 until the
    // process restarted for no reason other than a transient outage. Clear
    // the cache on failure so the next call builds a fresh instance instead.
    const attempt = createApp().then((app) => {
      app.start();
      return app;
    });
    globalForApp.appPromise = attempt.catch((err) => {
      globalForApp.appPromise = undefined;
      throw err;
    });
  }

  return globalForApp.appPromise;
}
