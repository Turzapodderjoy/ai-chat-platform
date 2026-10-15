# AIVA Platform Changelog (Local Updates)

> Comprehensive log of all local changes not yet deployed to VPS (as of this update). Covers performance, stability, navigation, UI/UX, repair-gen platform, and infrastructure improvements.

## Timeline

- Latest: Repair shops land on a single‑surface **Repair console** — live work queue, inventory glance, and billing on one screen with no tab switching; repair‑client Home no longer flashes the regular snapshot while the client's type loads.
- Also: Deploy pipeline hardened — the per‑worktree submodule clone that was timing out (and orphaning a `git clone` on every retry) now runs in seconds.
- Recently: Fixed hidden sidebar tabs — the Clients / Client Access / Admin Users / Subscription group (and Overview, and the tenant Integrations/Notifications/Settings entries) had collapsed to nothing with no way to reopen.
- Recently: Profiles tab (home for master profiles + undecided roadmap), focus-mode nav rail (Inbox and repair work bench take the full screen), populated master-profile metadata.
- Recent: SWR caching, lazy-mounting, sidebar restoration, inbox UX, master profile selector, stability fixes.
- Prior: Hermes agent integration, provider error handling, fallback chains, replies defaults, repair vertical refinements.

---

## Repair Console (repair shops' Home)

### `apps/web/components/RepairConsolePanel.tsx` (NEW — the master repair console)
- One surface, no tab switching: a **stat strip** (In intake / In repair / Finishing / Needs billing / Low stock), a **searchable 5‑column work queue** (Booked → Received → In repair → Ready → Completed), a **right rail** (inventory glance that expands in place to the full `InventoryPanel`, a Needs‑billing list, and Jump‑to links), and a **detail drawer** (facts grid, status/priority/technician selects, issue notes, `OrderItemsEditor` for parts/services, and in‑place invoice **generate + print**).
- Self‑contained `"use client"` component that reuses existing exported sub‑components and APIs — `OrderItemsEditor`, `WalkInDialog`, `RefillDialog`, `InventoryPanel`, `StatCard` — leaving `RepairsPanel.tsx` untouched. Polls every 5s **while Home is on screen** (stops when you leave the tab). "Needs billing" = completed repairs that have line items but no invoice yet (`repairAppointmentId` match).
- Responsive: stat grid and the board/rail grid collapse to a single column at ≤900px (measured 390px: single column, no horizontal overflow, drawer full‑width).
- Audit pass: the low‑stock rail now uses the exact server predicate (`countLowStock`) so the stat and the list can't disagree; future‑dated appointments read "in 2h" instead of a negative "ago"; Enter on a card's quick‑action no longer also opens the drawer; the drawer is a labelled `role="dialog"` and moves focus to its close button.

### `apps/web/app/dashboard/[businessId]/client-dashboard-client.tsx`
- Home now renders `RepairConsolePanel` when the client's type is `repair`; every other business type keeps the existing `ClientHomePanel` snapshot.
- Added a `clientLoaded` guard so a repair shop's Home no longer briefly painted the regular snapshot before the type resolved — it shows a lightweight placeholder until the client fetch lands.

### Demo tenant
- Created the **Repair Demo** client (`repair` type) and seeded it: 8 parts (4 low‑stock), 6 contacts, repairs across every stage, one issued invoice, and one completed‑but‑unbilled repair.

---

## Deploy Pipeline Fix

### `scripts/deploy.mjs`
- Root cause: in a **linked worktree**, `git submodule update --init` clones `vendor/hermes-agent` (~1.3 GB) fresh into its own per‑worktree store (`.git/worktrees/<sha>/modules/`) instead of reusing the shared `.git/modules/` copy. That download brushed the script's 5‑minute subprocess timeout; when it tipped over, the killed `execSync` **orphaned a `git clone` that kept running for hours**, and every retry stacked another — so successive deploys all failed at the same step.
- Fix: pass `--reference <shared module dir>` to the release‑worktree submodule update when that dir exists, turning the fresh download into a local object copy (seconds instead of minutes); the no‑reference fallback path now gets a 20‑minute timeout. Verified live: `current` advanced to the new release and no clone processes remained.

---

## Fix: missing sidebar tabs

- **`apps/web/components/DashboardShell.tsx`**: Nav groups defaulted to collapsed when they had no `label` (`collapsedGroups[gi] ?? group.label === undefined`). An unlabeled group renders no collapse toggle, so its items were unreachable forever. Groups now default to **expanded** (`?? false`). This restored the platform admin's **Clients / Client Access / Admin Users / Subscription** group and **Overview**, and the tenant sidebar's **Integrations / Notifications / Settings** entries that the workspace rebuild had hidden.

---

## Profiles & Focus Mode

### Profiles tab (new)
- **`apps/web/components/ProfilesPanel.tsx`**: Central home for master profiles — a card per available profile (Standard, Repair Gen) showing description, features, focus tabs and a **Set active** action, plus a "Not decided yet" section listing planned shapes (Salon, Clinic, Restaurant, E-commerce, Agency).
- **`apps/web/app/dashboard/dashboard-client.tsx`**: Added a **Profiles** entry to the admin nav and mounted `ProfilesPanel`; platform dashboard now derives `hideRail` from the active master profile's `focusTabs`.
- **`apps/web/lib/master-profile.ts`**: Master profiles now carry `status`, `landingTab`, `focusTabs` and `features`; added `PLANNED_PROFILES` for undecided shapes.

### Focus-mode nav rail
- **`apps/web/components/DashboardShell.tsx`**: Implemented the previously inert `hideRail` prop. When a focus tab is active the desktop rail auto-hides and a floating handle (top-left) reveals it on demand; the sidebar's own toggle re-hides it. Mobile keeps the drawer so navigation is always one tap away.
- **`apps/web/app/dashboard/[businessId]/client-dashboard-client.tsx`**: `focusTabs` = Inbox for every business, plus **Repairs** for repair shops — so a phone-repair shop's work bench owns the screen exactly like a support team's Inbox does. Repair work bench also renders full-height.

---

## Performance & Stability

### Caching & Request Optimization
- **Added `apps/web/lib/swr-cache.ts`**: Lightweight SWR-style cache helper (45s TTL, stale-while-revalidate, optional `?fresh=1` bypass). Provides safe empty fallbacks and prevents blocking on cache misses.
- **`apps/web/app/api/admin/ops/route.ts`**: Integrated SWR cache; returns warm-up-safe snapshots on cache miss instead of long-blocking live probes. Removes/mitigates 30–50s tail latency.
- **`apps/web/app/api/admin/system-map/route.ts`**: Same SWR integration with admin/client auth preserved; cached responses, fresh override supported.

### Rendering & Polling
- **Lazy mounting (dashboard)**: `dashboard-client.tsx` and tenant `client-dashboard-client.tsx` now track mounted tab set; inactive panels unmounted to stop background polling (IT Guy/ops-heavy panels). Preserves first-activation state and widget toggles.
- **Tenant map guard**: `RemovableSection` uses `mounted.has(id)` guard inside tenant dashboard to prevent hidden-panel polling while keeping toggles intact.

### Infrastructure/Dev
- Dev heap increased to 8GB (`NODE_OPTIONS="--max-old-space-size=8192"`), `.next` cleared after transient hot-reload issues (adapterFn). Routes use `dynamic="force-dynamic"` where appropriate.
- Build/typecheck: `tsc --noEmit` 0, `next build` 0 across verified states.
- Observed dashboard cold load reduced from ~20s to ~100–300ms with cached responses; ops/system-map <20–60ms after warmup.

---

## Navigation & Shell

### DashboardShell (`apps/web/components/DashboardShell.tsx`)
- Rebuilt premium sidebar with groups/collapsible sections, global search (`Ctrl/Cmd+K`), theme toggle, profile/menu (with back/logout), mobile drawer, and `topbarExtra` support.
- Replaced sitemap-card experiment with stable sidebar navigation surface.
- Integrated **MasterProfileSelector** in topbar (desktop) and mobile header area.
- Responsive behavior preserved; accessibility (focus, aria labels) maintained.

### Master Profile System (NEW)
- **`apps/web/lib/master-profile.ts`**: Defines master profiles (`regular`, `repair-gen`), persists to `localStorage` (`aiva:master-profile`), cross-tab sync via `storage` events, SSR-safe defaults.
- **`apps/web/components/MasterProfileSelector.tsx`**: Accessible dropdown selector showing all profiles with descriptions; keyboard navigable (Escape/outside click), checks active, persists selection.
- Global layout profile switcher exposed in shell (topbar/mobile) — allows viewing/switching all profiles (including undecided ones).

### Tenant Navigation
- **`apps/web/app/dashboard/[businessId]/client-dashboard-client.tsx`**: `TAB_IDS` now unions `NAV_GROUPS` and `REPAIR_NAV_GROUPS` (flatMap) so repair tabs (e.g., `repairs`) restore correctly from `?tab=...`.
- Repair nav groups used when `clientType === "repair"`; badges (repairs) preserved; deep links fixed.

---

## Inbox/Chat UX

### AllChatsPanel (`apps/web/components/AllChatsPanel.tsx`)
- Back button visibility: shown only when `listCollapsed` (conditional). Prevents blocking UI when conversation list is open.
- Label changed to "Back", aria/title clarified to "Back to dashboard" context.
- Minor UX polish while preserving behavior.

### Chat Pages (`apps/web/app/chat/page.tsx`, styles)
- Styling/structural updates aligned with platform tokens (Nothing OS aesthetic). No functional regressions.

---

## Repair-Gen Platform (ERP/CRM)

### Repairs Panel (`apps/web/components/RepairsPanel.tsx`) — 1467 lines
- Core repair workflow intact (booked → received → in_repair → ready → completed → cancelled). Status lamps (bay-lamp semantics) preserved; labels normalized.
- Industrial-grade repair vertical structure maintained: intake → repair → parts → invoice → pickup flows present. Ongoing deep refinement (audit loop) for buttons/forms/a11y (1440/390, light/dark).

### Client/Business Types
- Clients panel supports `regular`/`repair` business types. Master profile selector adds global `repair-gen` layout profile (repair-focused ERP/CRM experience target).
- Per-tenant `businessType === "repair"` controls repair nav; master profile is orthogonal global switcher.

### API Routes (Repairs/Invoices)
- `apps/web/app/api/admin/repairs/[id]/invoice/route.ts`: Invoice generation flow preserved; no vendor changes.

---

## Admin/Platform UI

### Client Access (`apps/web/components/ClientAccessPanel.tsx`)
- Micro cleanup: "Generate password" → "Generate" (two locations) for brevity/consistency.

### Dashboard (Platform Admin)
- `apps/web/app/dashboard/dashboard-client.tsx`: Lazy-mount behavior, mounted set, tab rendering unchanged functionally; integrates cleanly with shell/nav.
- System Map/IT Guy panels unmounted when inactive (polling reduction).

---

## Styling & Tokens
- `apps/web/app/globals.css`, `apps/web/app/page.module.css`, `apps/web/components/dashboard-styles.ts`: Token updates aligned with Nothing OS design constraints (AA contrast, minimal chrome, no AI-slop). Preserve existing tokens where specified.

---

## Docs & Agent Instructions
- `AGENTS.md`: Updated agent/skill routing notes (Superpowers policy) as part of local maintenance.
- `UI_FORM_AUDIT.md` (added/maintained): Form accessibility inventory reference for ongoing audit loop.

---

## Build/Type Safety
- All modified files typecheck clean (`tsc --noEmit` 0).
- Production build succeeds (`next build` 0) with no new errors/warnings of concern.
- No vendor code changes; preserve application behavior/APIs per constraints.

---

## Deployment Notes
- Push includes: master profile system, SWR cache helper, shell integration, lazy-mount fixes, inbox UX, API route perf patches, styling/docs, and all other staged modifications (93 files total staged).
- Newest push adds the Repair console, the repair‑client Home wiring, the console audit fixes, the deploy submodule fix, and this changelog entry; deployed to the VPS.
- Changes are backward compatible; localStorage key `aiva:master-profile` is new (safe default).
- No DB schema changes in this push (schema unchanged vs prior).
