# Bay Console — Total UI Redesign

Date: 2026-10-04
Scope: every rendered surface in `apps/web` (10 routes, 67 components, ~22.8k LOC of TSX).
Mandate: total makeover. No visual carry-over from the previous "Hermes teal" console.

## 1. What exists today (audit findings)

The current UI is a dark teal console:

- `app/globals.css:38` defines the whole system as CSS variables on `.app-shell`, dark-first,
  with a light theme override at `:97`.
- Every one of the 67 components consumes those variables through inline styles. There is no
  per-component styling system, only `components/dashboard-styles.ts` (167 lines of shared
  `CSSProperties` objects).
- The look is uniform: `var(--surface)` cards, `--radius-md 8px`, one soft shadow, one
  accent (`--accent #2dd4bf`), uppercase tracked eyebrows (`.text-display`,
  `dashboard-styles.ts:40`, `DashboardShell.tsx:318`), pill badges, emoji icons in tables
  (`DashboardShell.tsx:538`), and hover-lift on every card (`StatCard.tsx:39`).
- Only 3 real `<form>` elements exist; most interaction is button-and-fetch.

Consequences of that architecture: the entire visual identity is concentrated in ~200 lines of
token and primitive code. Replacing those changes every surface at once, and the remaining work
is per-component composition rather than per-component restyling from scratch.

Generic-design tells to eliminate (per `frontend-design`): SaaS-card kit, uniform radius,
uniform soft shadow, all-caps eyebrow labels everywhere, middle-dot meta strings, arrow-prefixed
buttons, emoji as iconography, tinted near-black standing in for black.

## 2. Subject matter

AIVA is a WhatsApp-first operations console for device-repair businesses: work orders, repair
bay status, parts inventory, purchase orders, invoices, staff shifts, appointments, plus an
autonomous AI layer (Hermes agents, model routing, reply timing, ops monitoring).

The design language comes from that world, not from generic SaaS: a **calibrated service
instrument**. Machinists read instruments. Panels are labelled. Status is a lamp. Numbers are
tabular. Nothing decorative earns its place.

## 3. Direction: Bay Console

**Ink-on-paper, light-first, with an instrument-panel skeleton.**

Why light-first, against the current dark theme: this product is used all day on phones and
counter-top screens in bright repair shops, and screenshots get pasted into work orders and
WhatsApp threads. Light-first is the functional argument, and it also guarantees the makeover is
unmistakable.

### Color

Two accents with fixed meaning, never decorative:

- **Cobalt `#1F4BEA`** — human action. Primary buttons, active nav, links, focus rings,
  selection. Interactive means a person did it.
- **Amber `#B45309` / mark `#F59E0B`** — the machine layer. Hermes, agents, model routing,
  automation, background jobs. If it was the AI, it is amber.
- Status stays semantic and is never used for decoration: ok `#0F7B4F`, warn `#B45309`,
  danger `#B42318`, info `#1F4BEA`, neutral ink.

Base ramp (light):

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#F4F5F7` | page |
| `--panel` | `#FFFFFF` | raised surface |
| `--panel-sunk` | `#EDEFF2` | inset, table headers, wells |
| `--line` | `#D8DCE3` | hairline border |
| `--line-soft` | `#E7EAEF` | interior divider |
| `--line-strong` | `#B6BDC8` | emphasis border |
| `--ink` | `#10151C` | primary text |
| `--ink-2` | `#495364` | secondary |
| `--ink-3` | `#6E7889` | muted, meta |
| `--ink-4` | `#98A1B0` | faint, placeholder |

Dark is retained as a first-class alternate ("night bay"), not an afterthought:
`--canvas #0F1216`, `--panel #171B21`, `--line #262C35`, `--ink #E9ECF1`, cobalt lifts to
`#6B8CFF`, amber to `#F5A524`.

### Type

- One UI family (system grotesk stack) + one monospace for data. No third face.
- Personality comes from treatment, not novelty: UI weight 500/600, tracking `-0.011em` at body
  and `-0.028em` at display sizes.
- **All data is monospace with tabular figures**: metrics, money, IDs, timestamps, counts,
  durations. Proportional digits in a column of numbers is what makes a console feel amateur.
- Scale: 11 / 12 / 13 / 15 / 18 / 22 / 28 / 36. Body 13.5px, line-height 1.5.
- All-caps is banned as chrome. Small labels are 11px, weight 600, tracking `0.06em`, ink-3,
  sentence case (`Section label`, not `SECTION LABEL`).

### Shape, depth, motion

- Radii tighten and become a hierarchy, not one value everywhere: `--r-xs 3`, `--r-sm 5`,
  `--r-md 8`, `--r-lg 12`, `--r-pill 999`.
- Depth is hairlines, not shadows. One shadow token, reserved for things that genuinely float
  (menus, dialogs, popovers): `--shadow-pop`.
- Overlays get a 1px `--line` plus a hairline top highlight (`inset 0 1px 0 rgba(255,255,255,.6)`)
  so they read as physical panels catching light.
- Motion: 120ms for state, 180ms for panels. No entrance animations, no hover-lift on cards.
  Motion only ever answers an action.

### Structure

The signature is a **bay rail**: a fixed 68px icon rail carrying navigation, collapsed to labels
on hover/expand, paired with a 56px command bar holding context, global search, machine-status
lamp, theme, and account. This replaces the current 260px sidebar + generic header.

```
┌──────┬──────────────────────────────────────────────────────────┐
│  ⌗    │  Command bar:  Section / Page title      ⌕ search  ◐  ⬤ │
│  ▤    ├──────────────────────────────────────────────────────────┤
│  ▦    │                                                          │
│  ⌁    │   Panel ── Instrument label ────────────── action ──┐   │
│      │   ┌──────────────────────────────────────────────────┘   │
│  ⚙    │   │  hairline-separated rows, no card soup            │   │
│      │   └──────────────────────────────────────────────────────┘  │
└──────┴──────────────────────────────────────────────────────────┘
```

Panels use an **instrument label** row (11px label, optional right-aligned action) instead of a
card title floating in space. Status uses a **bay lamp**: an 8px lamp with a soft halo plus its
label, replacing every pill badge. Data tables drop zebra striping and the uniform soft shadow;
row hover is a left cobalt bar plus a faint wash, headers sit in `--panel-sunk`.

### Content

Copy follows the product, not the code: `Save changes`, `Add part`, `Mark ready` — no
`Submit`, no `→`, no middle-dot meta strings. Errors say what broke and what to do; empty
panels are invitations to act, not decorative icon + grey text.

## 4. Rollout

1. **Foundation (lead):** rewrite `globals.css` tokens and element/component layer; rewrite
   `components/dashboard-styles.ts` primitives; reshape `DashboardShell`.
2. **Public surfaces (lead):** login, landing, tracking, legal, subscription-expired, invoice
   print — these do not use `.app-shell` and need their own treatment.
3. **Team waves (parallel agents, shared contract):** AI/ops panels, commerce panels,
   people/ops panels. Each agent may only use the token vocabulary and shared primitives, may
   not introduce raw hex, and may not change behavior, props, API calls, or data flow.
4. **Verification:** `check-types`, `build`, browser screenshot pass at 1440px and 390px, a11y
   and reduced-motion checks.

## 5. Non-negotiables

- Behavior, API contracts, tenant isolation, and auth boundaries are untouched. This is a
  presentation change.
- No new runtime dependencies.
- Every surface must work in both light and dark, at 390px and 1440px, keyboard-navigable, with
  visible focus and `prefers-reduced-motion` respected.