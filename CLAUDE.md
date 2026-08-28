# AI Chat Platform

Multi-tenant AI customer-support chatbot SaaS. A "mother" dashboard for the platform team manages every client business; each client gets its own dashboard scoped to their data. The AI answers customer questions from a per-client knowledge base (uploaded docs + crawled website content), hands off to a human when it can't help, and connects to the customer's website, Facebook Messenger, Instagram, and WhatsApp.

## Stack

- Turborepo + pnpm monorepo. `apps/web` is the only app — Next.js 16 (App Router), Node ≥18.
- Postgres via Prisma (`packages/database/prisma/schema.prisma`), hosted on Neon in production.
- ~35 single-purpose packages under `packages/`, wired together through one composition root.

Root commands: `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm check-types` (all `turbo run ...` across the workspace). `apps/web` also has its own `next dev`/`next build`/`eslint --max-warnings 0`.

## Architecture

**Composition root, not DI framework.** `packages/bootstrap/src/container.ts` (`Container`) constructs every service and controller by hand and wires them into one `ApiRouter`. `packages/bootstrap/src/create-app.ts` builds the `Container` with real providers (AI keys, embedding keys, vector store). `apps/web/lib/app.ts`'s `getApp()` memoizes one `Application` instance on `globalThis` per server process. Every API route calls `getApp()` then `app.container.router.<controller>.<method>(...)` — no route talks to Prisma or a package directly.

**Packages are single-purpose and layered**: provider adapters (`groq`, `gemini`, `openrouter`, `cerebras`, `mistral`, `provider-catalog` for custom OpenAI-compatible ones) → `ai-manager` (rotation/failover/health) → `chat-service` (the actual chat pipeline: retrieval, prompt, handoff logic) → `rag` (thin wrapper) → `api` controllers → `apps/web` routes. Same layering for embeddings (`embedding-manager`, `embedding-catalog`) and channels (`channel-catalog` adapters, `channel-connections` persistence).

**Two dashboards, shared components.** `apps/web/app/dashboard/page.tsx` (mother, platform-wide) and `apps/web/app/dashboard/[businessId]/page.tsx` (per-client) render mostly the *same* components (`AiBrainPanel`, `HandoffsPanel`, `AllChatsPanel`, `TrainingArenaPanel`, etc.) — an optional `businessId` prop switches between platform-default and client-scoped behavior. Prefer extending a shared component over forking one per dashboard.

**Versioned config, never mutated.** `AiConfigVersion` (the "AI Brain" — system prompt + parameters), training suggestions, etc. follow one pattern: every save is a new immutable row, never an UPDATE. `getCurrent()` reads the latest row; history is just "every row." A business with no rows of its own inherits the platform default (`businessId = "__platform__"`) until it saves its own first change. Follow this pattern for any new versioned setting rather than inventing a new one.

**Multi-channel messages funnel through one pipeline.** A webhook-received Messenger/Instagram/WhatsApp message and a website-widget message both end up calling `ChatService.chat()` — same retrieval, same AI Brain, same handoff logic. `Conversation.channel` records which channel it came from; `Conversation.externalUserId` is where a human agent's reply gets sent back out through that channel's own Send API (see `HandoffController.reply`).

## Known gaps (don't assume these exist)

- **Auth is session-only and not data-scoped.** Login/sessions exist (`packages/client-auth`: a single fixed admin identity in `admin-session.ts`, plus per-client `ClientAccount`/`ClientSession`), and `apps/web/proxy.ts` gates `/dashboard` (admin-only), `/dashboard/{businessId}/*` (admin or a client session matching that businessId), and `/api/admin/**` (any valid session). The residual gap: a logged-in non-admin client session is **not** business-scoped at the API layer — mother-level endpoints (`/api/admin/clients`, `/api/admin/revenue/**`, etc.) accept any valid session because both dashboards share components that pass `businessId` from the frontend. Real server-side per-tenant enforcement would be a larger, deliberate change and hasn't been done. `User`/`Business`/`Membership`/`RefreshToken` are orphaned schema tables from an abandoned early auth attempt — not used by the live auth path.
- **No automatic training pipeline.** Training only happens through two explicit, human-driven paths: Training Arena sessions and dumped-chat transcripts. There is no nightly cron that scans the whole conversation database and auto-generates suggestions (this existed earlier and was deliberately removed).

## Working conventions

- **Reuse before building.** Check `packages/` and `apps/web/components/` for an existing service/panel/pattern before writing a new one — this codebase has been through several audit-and-delete passes to remove dead/duplicate code; don't reintroduce it.
- **Schema changes go to both databases.** After editing `schema.prisma`: `prisma generate`, then `prisma db push` against local Postgres (`.env`'s `DATABASE_URL`/`DIRECT_URL`) **and** against Neon (override both env vars on the command line with Neon's pooled + direct connection strings). Both must stay in sync.
- **Verify before calling it done.** `pnpm --filter web run build` must be clean. For anything UI-visible, use the browser preview tools and actually click through the feature — a clean build proves types, not behavior.
- **Commit and push after every completed change**, without waiting to be asked — this is a standing preference from the project owner, not a one-off approval. Use descriptive commit messages explaining *why*, not a changelog of file names.
- **No unrequested abstractions.** Don't add interfaces with one implementation, config for values that never change, or speculative extensibility. Match the size of the change to what was actually asked.
- **Windows environment.** Use the PowerShell tool for `robocopy` and other Windows-native operations; Bash tool for everything else. Never pipe em-dashes or curly quotes through `curl -d` in Bash on this machine — they silently corrupt to `U+FFFD`; use a small Node fetch script instead for any non-ASCII payload.

## Deployment

Vercel (Hobby plan — cron jobs only run daily, regardless of the schedule expression in `vercel.json`). The 30-minute auto-heal cadence is driven by an external scheduler (e.g. GitHub Actions) hitting `/api/cron/auto-heal` with a `CRON_SECRET` bearer token, since Vercel's own cron can't do sub-daily schedules on this plan.
