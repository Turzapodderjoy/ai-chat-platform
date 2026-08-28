# AI Chat Platform

Multi-tenant AI customer-support chatbot SaaS. A "mother" dashboard for the platform team manages every client business; each client gets its own dashboard scoped to their data. The AI answers customer questions from a per-client knowledge base (uploaded docs + crawled website content), hands off to a human when it can't help, and connects to the customer's website, Facebook Messenger, Instagram, and WhatsApp.

## Stack

- **Turborepo + pnpm monorepo.** `apps/web` is the only app — Next.js 16 (App Router), Node ≥20.9.
- **Postgres via Prisma** (`packages/database/prisma/schema.prisma`), with the **pgvector** extension for embedding search (`packages/database/sql/pgvector-setup.sql`).
- ~35 single-purpose packages under `packages/`, wired together through one composition root (`packages/bootstrap`).

Root commands: `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm check-types` (all `turbo run ...` across the workspace).

## Architecture (short version)

- **Composition root, not a DI framework.** `packages/bootstrap/src/container.ts` builds every service/controller by hand into one `ApiRouter`; every API route calls `getApp()` (`apps/web/lib/app.ts`) then a controller method. No route talks to Prisma or a package directly.
- **Two dashboards, shared components.** `/dashboard` (mother) and `/dashboard/[businessId]` (per-client) render the same `apps/web/components/*` panels, switched by a `businessId` prop.
- **Versioned config, never mutated.** `AiConfigVersion` (the "AI Brain") appends a new immutable row per save; latest row per business is current; businesses with no row inherit the `"__platform__"` default.
- **One chat pipeline for every channel.** Website widget, Messenger, Instagram, and WhatsApp all call `ChatService.chat()` — same retrieval, prompt, handoff logic.
- **Multi-stream AI.** Provider adapters (`groq`, `gemini`, `openrouter`, `cerebras`, `mistral`, custom OpenAI-compatible) → `ai-manager` (rotation/failover/health) → `chat-service`; embeddings and channels follow the same adapter+catalog+manager layering.

See `CLAUDE.md` for the full architecture, working conventions, and known gaps.

## Local development (self-contained, no Docker)

There is a self-contained setup in the working folder (PostgreSQL + pgvector compiled locally, pnpm bundled) — see `../README-local.md` (next to this repo) or the `scripts/` in that folder. In short:

```
./scripts/dev.sh        # dev server on http://localhost:3000 + local Postgres
./scripts/db-setup.sh   # re-apply schema + pgvector SQL after pulls
```

Without that folder, locally:

```
pnpm install
cp .env.example .env     # DATABASE_URL/DIRECT_URL for Prisma
pnpm exec prisma db push --schema=packages/database/prisma/schema.prisma
pnpm dev --filter web
```

Required core env vars: `DATABASE_URL`, `DIRECT_URL`. AI provider keys are optional (see `.env.example`) — providers without a key are simply not registered.

## Deployment

Vercel (Hobby plan) with the auto-heal cadence driven by an external scheduler (`.github/workflows/auto-heal.yml`) hitting `/api/cron/auto-heal` with a `CRON_SECRET` bearer token. Cron schedules in `apps/web/vercel.json`.