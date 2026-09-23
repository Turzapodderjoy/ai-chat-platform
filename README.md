# AI Chat Platform

Multi-tenant AI customer-support chatbot SaaS, branded **AIVA**. A "mother" dashboard for the platform team manages every client business; each client gets its own dashboard scoped to their data. Every customer conversation is answered by a Hermes agent (per-business SOUL/persona + persistent memory), hands off to a human when it can't help, and connects to the customer's website, Facebook Messenger, Instagram, and WhatsApp.

## Stack

- **Turborepo + pnpm monorepo.** `apps/web` is the only app — Next.js 16 (App Router), Node ≥20.9.
- **Postgres via Prisma** (`packages/database/prisma/schema.prisma`).
- ~30 single-purpose packages under `packages/`, wired together through one composition root (`packages/bootstrap`).

Root commands: `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm check-types` (all `turbo run ...` across the workspace).

## Architecture (short version)

- **Composition root, not a DI framework.** `packages/bootstrap/src/container.ts` builds every service/controller by hand into one `ApiRouter`; every API route calls `getApp()` (`apps/web/lib/app.ts`) then a controller method. No route talks to Prisma or a package directly.
- **Two dashboards, shared components.** `/dashboard` (mother) and `/dashboard/[businessId]` (per-client) render the same `apps/web/components/*` panels, switched by a `businessId` prop.
- **One chat pipeline for every channel.** Website widget, Messenger, Instagram, and WhatsApp all call `ChatService.chat()` — same agent routing, booking bridge, and handoff logic.
- **Per-business agent engine (Hermes, branded AIVA).** A chat runs against a Hermes agent profile: own SOUL/persona + persistent memory, provisioned under `data/hermes/profiles/<slug>`, multiplexed through the local gateway (`hermes gateway run`, API server on `127.0.0.1:8642`). Businesses with `hermesEnabled` use their `hermesProfile`; everything else routes to the shared `aiva-portal` tenant so no customer is left without an answer. A thin `[[BOOKED:{...}]]` bridge turns an agent-confirmed order/repair into a real `Order` / `RepairAppointment` row with a code-generated confirmation.
- **Canned safety rails.** No agent/profile reachable → fail closed to a canned handoff message, never a raw error. Human handoff is explicit (agent emits `[[NEEDS_HUMAN]]` or intent fallback), stale after 2h so the bot doesn't hijack an active human chat.

See `CLAUDE.md` for the full architecture, working conventions, and known gaps.

## Key features beyond the chatbot

- **Repairs & orders** — appointments (website form or staff **Walk-in**), one shared number per appointment (`PRAZ00001` style: appointment # = order # = invoice #), order items from Inventory or custom.
- **Invoices** — PDF/print/email, payments, one-click **Finalize** (turns an unpaid gap into a discount), "Powered by AIVA" footer.
- **Inventory** — stock lots with FIFO costing: **Refill** adds a lot with its own cost/sell price; past sales and reports keep the cost they were sold at.
- **Reports** — revenue, delivery, repairs, CRM, and an **Inventory Usage** report (what was used, on which order/invoice, by whom, cost vs price, discount).
- **Audit trail & Deleted Data** — every change records the real username; every delete keeps a full copy in an admin-only Deleted Data panel.

## Local development (self-contained, no Docker)

```
pnpm install
cp .env.example .env     # DATABASE_URL/DIRECT_URL for Prisma
pnpm exec prisma db push --schema=packages/database/prisma/schema.prisma
pnpm dev --filter web
```

Hermes agents need the local gateway running and provisioned profiles under `data/hermes/profiles/<slug>` (each with an `API_SERVER_KEY` in its `.env`, plus a `SOUL.md` persona). See `scripts/hermes/provision-agent.mjs` and the Hermes Agents panel in the mother dashboard.

Required core env vars: `DATABASE_URL`, `DIRECT_URL`. Optional: `HERMES_HOME`, `HERMES_HOST`/`HERMES_PORT`, `PERSISTENT_UPLOADS_DIR`. See `.env.example`.

## Deployment

Production runs on a VPS (`app.aiva-ai.net`) under `pm2`, not Vercel. Deploys are **manual**: `.github/workflows/deploy.yml` runs only via `workflow_dispatch` (pick the `ref`) — pushing to `main` deliberately does *not* deploy. The dispatched run POSTs to the VPS webhook (`/api/webhooks/deploy`, `DEPLOY_SECRET` bearer) which runs `scripts/deploy.mjs` to build a new release and restart `pm2`. See `CLAUDE.md`'s Deployment section for the full pipeline and known gotchas.