// pm2 process definitions for running the whole platform on a persistent
// host (this laptop today, a VPS later — nothing here is laptop-specific
// except the cloudflared config path, which is swapped for a real crontab
// + systemd-managed cloudflared/nginx on the VPS instead of pm2 managing
// it). `next start` picks up apps/web/.env.local automatically since cwd
// is set there — no separate env-loading step needed.
module.exports = {
  apps: [
    {
      name: "ai-chat-web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      // Unofficial WhatsApp gateway (Evolution API), testing-only per-client
      // channel alongside the official Meta WhatsApp Cloud API integration.
      // Replaces the earlier OpenWA integration (same role: Baileys-based,
      // no browser, QR-linked per business). Lives outside this repo
      // (C:/Users/Admin/evolution-api-src, cloned from
      // github.com/EvolutionAPI/evolution-api) since it's a separate
      // service this app talks to over HTTP, not a package in the pnpm
      // workspace. Bare Node process, not Docker -- deliberately the
      // lower-resource-usage option, matching this file's existing style
      // for every other non-workspace service (cloudflared, and formerly
      // openwa). Local dev runs with CACHE_LOCAL_ENABLED=true (no Redis
      // installed on this machine); the VPS deployment should install
      // real Redis via apt and flip .env back to CACHE_REDIS_ENABLED=true.
      name: "evolution-api",
      cwd: "C:/Users/Admin/evolution-api-src",
      script: "dist/main.js",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: "cloudflared-tunnel",
      script: "C:/Program Files (x86)/cloudflared/cloudflared.exe",
      args: "tunnel run ai-chat-platform",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
  ],
};
