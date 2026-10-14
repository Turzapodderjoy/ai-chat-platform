# Bay Console UI contract

Every agent working on this redesign must follow this file exactly. The design language is
defined in `apps/web/app/globals.css` and `apps/web/components/dashboard-styles.ts`; the
direction is written up in `docs/superpowers/specs/2026-10-04-bay-console-ui-redesign.md`.

## Non-negotiable

1. **Presentation only.** Do not change behavior, props, state, API calls, fetch URLs, request
   bodies, event handler logic, tenant/auth checks, or data flow. If a surface looks wrong
   structurally, restyle it; do not "fix" logic.
2. **No new dependencies.**
3. **No raw colour literals.** Never write `#hex`, `rgb(`, or `rgba(` in a component. Only
   `var(--token)` values listed below. This is what keeps 67 components looking like one product.
4. **Do not touch files outside your assigned list.** Other agents are editing sibling files
   concurrently; editing them causes conflicts and lost work.
5. Keep every prop, export, and component name intact — other files import them.
6. Every interactive element keeps a visible `:focus-visible` state, a real `<label>` or
   `aria-label`, and works at 390px width.

## Colour semantics (never break this)

| Meaning | Token |
|---|---|
| Human action: primary buttons, active nav, links, focus | `--accent` (cobalt) |
| The machine layer: Hermes, agents, model routing, automation, background jobs | `--machine`, `--machine-bright`, `--machine-subtle`, `--machine-line` (amber) |
| Healthy / done / paid | `--success` |
| Needs attention / pending | `--warning` |
| Failed / overdue / destructive | `--danger` |
| Neutral state | `--ink-3`, `--ink-4` |

If a panel shows AI/agent/automation state, it is amber. If it shows something a person did,
it is cobalt. Status colours are never used decoratively.

## Tokens

Surfaces `--canvas` `--panel` `--panel-sunk`
Lines `--line` `--line-soft` `--line-strong`
Ink `--ink` `--ink-2` `--ink-3` `--ink-4`
Shape `--r-xs` `--r-sm` `--r-md` `--r-lg` `--r-pill`
Depth `--shadow-pop` (overlays only), `--edge-light`
Type `--font-sans`, `--font-mono`

Legacy aliases exist (`--surface`, `--border`, `--text`, `--accent-subtle`, `--radius-md`, …)
so untouched code keeps working. In code you edit, prefer the new names.

## Ready-made classes (use these instead of ad-hoc inline styles)

- `.panel` — hairline container. `.panel-head` — instrument-label header row (44px min).
  `.panel-body` — 16px padded body. `.panel-sunk` — inset well.
- `.instrument-label` — the section label: 11px, weight 600, tracking `0.06em`, `--ink-3`,
  sentence case. **Never uppercase.**
- `.lamp` + `.lamp-ok` `.lamp-warn` `.lamp-err` `.lamp-info` `.lamp-machine` `.lamp-idle` —
  the status signature: a 7px lamp with halo plus its label. Replaces pill badges entirely.
- `.data` / `.num` — monospace with tabular figures. Use on every metric, price, quantity,
  duration, count, timestamp and ID so columns line up.
- `.meta` — 11.5px `--ink-3` secondary text.
- `.machine-block` — amber-tinted block for anything the AI layer produced or controls.
- `.field` + `.field-label` + `.field-hint` + `.field-error` — form field anatomy.
- `.toolbar` — control row above a panel or table.
- `.table-scroll` — table well.
- `.empty-state` + `.empty-state-title` + `.empty-state-description` — dashed well. Copy is an
  invitation to act, not a description of absence.
- `.skeleton`, `.skeleton-card`, `.skeleton-text`, `.skeleton-circle` — loading.
- `.rail-item` — nav row (shell only).

Buttons inherit the element styles; add `className="primary" | "ghost" | "danger" | "machine" |
"sm"` rather than writing button styles inline.

Shared style objects live in `components/dashboard-styles.ts`: `panelStyle`, `cardStyle`,
`sunkStyle`, `machineBlockStyle`, `labelTextStyle`, `metaTextStyle`, `sectionTitleStyle`,
`dataStyle`, `dataStrongStyle`, `moneyStyle`, `grid2Style`/`grid3Style`/`grid4Style`,
`toolbarStyle`, `dividerStyle`, `badgeStyle`/`lampStyle`. Prefer importing these over
re-declaring the same object.

## Patterns

**Panel** — never a bare rounded box with a floating title:

```tsx
<section className="panel" style={{ marginBottom: 14 }}>
  <div className="panel-head">
    <span className="instrument-label">Work orders</span>
    <div style={{ display: "flex", gap: 8 }}>
      <button className="sm">Filter</button>
      <button className="primary sm">New order</button>
    </div>
  </div>
  <div className="panel-body">{/* content */}</div>
</section>
```

**Status** — lamp, not badge:

```tsx
<span className="lamp lamp-ok">Paid</span>
<span className="lamp lamp-warn">Awaiting part</span>
<span className="lamp lamp-machine">Agent drafting</span>
```

**Metric** — label quiet, value is an instrument reading:

```tsx
<div className="meta">Outstanding balance</div>
<div className="data" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>৳ 48,200</div>
```

**Machine layer** — anything Hermes/agents/automation:

```tsx
<div className="machine-block" style={{ fontSize: 12.5 }}>
  Model routed to <span className="data">poolside/laguna-xs-2.1:free</span> after 2 failed attempts.
</div>
```

**Copy** — say what happened and what to do. `Save changes`, `Add part`, `Mark ready`,
`Nothing matches “ada”`. No `Submit`. No `→` in button labels. No middle-dot meta strings
(`a · b · c`). No emoji as iconography — use the existing SVG icon components in
`components/nav-icons.tsx` or inline SVG. Errors never apologise and are never vague.

**Forbidden looks** (the generic-AI defaults we are deliberately not shipping): uniform
rounded cards with one radius and one soft shadow; all-caps eyebrow labels; zebra-striped
tables; hover-lift on every card; gradient washes as decoration; a monospace face for prose;
tinted near-black standing in for black.

## Before you finish

Run `cd /home/nerdy_taco/Work/ai-chat-platform/repo/apps/web && npx tsc --noEmit` and fix every
error your changes introduced. Then report: files changed, what each surface now looks like, and
anything you deliberately left alone.