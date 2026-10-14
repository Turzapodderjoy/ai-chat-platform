# Skill Auto-Trigger Rules (AIVA AI Chat Platform)

Every skill installed in `.opencode/skills/` is live for this repo. The agent loads the
right ones automatically, without being asked.

## Core Principle

**Superpowers first, then domain skills, then design skills.** If a skill applies, use it —
there is no "too small" task.

---

## Tier 0 — Superpowers (always first)

The Superpowers plugin lives at `.opencode/plugins/superpowers/superpowers.js` and injects
`using-superpowers` into every session automatically. Its skills sit in
`.opencode/skills/<plain-name>/`.

| Situation | Load first |
|-----------|-----------|
| Any conversation start | `using-superpowers` (auto-injected — do not reload) |
| "Let's build X" / new feature / UI work | `brainstorming` → `writing-plans` → `executing-plans` |
| Bug, test failure, unexpected behavior | `systematic-debugging` (project version) or `test-driven-development` |
| Work that splits into independent chunks | `dispatching-parallel-agents` |
| Delegated implementation per plan step | `subagent-driven-development` |
| About to claim done / ship | `verification-before-completion` |
| Parallel work in an isolated tree | `using-git-worktrees` |
| Review pass (own or others') | `requesting-code-review` / `receiving-code-review` |
| Landing a branch | `finishing-a-development-branch` |
| Authoring a new skill | `writing-skills` (`skill-creator` also available) |
| Superpowers misbehaving | `diagnosing-superpowers` |

## Tier 1 — Domain skills (routing table)

| Task type | Load, in order |
|-----------|----------------|
| **Backend / API / DB work** | `backend` → `api-development` → `database` |
| **Frontend / React / Next.js** | `frontend` → `nextjs16` → `vercel-react-best-practices` |
| **UI redesign, styling, components** | `design` → `design-system` → `ui-styling` (see Tier 2) |
| **Performance / slowness** | `performance` |
| **Security review or auth change** | `security` |
| **Docker / deploy / infra** | `devops` → `docker` → `ci-cd` → `monitoring` |
| **Incident / outage** | `incident-response` → `systematic-debugging` |
| **Refactor / cleanup** | `refactoring` → `technical-debt` |
| **Tests / coverage** | `testing` → `tdd-workflow` |
| **Architecture decision** | `architecture-decisions` |
| **Docs / ADRs** | `documentation` |
| **Git / branch / release** | `git-workflow` → `finishing-a-development-branch` |
| **Resilience / quotas / retries** | `production-resilience` |
| **Code review** | `code-review` → `code-review-excellence` |
| **Long-context / session hygiene** | `context-engineering` |

## Tier 2 — Design skills (site furnishing)

Use these for anything visual. `design` is the router; it dispatches to the others.

| Need | Skill |
|------|-------|
| Anything visual (entry point) | `design` |
| Design tokens, CSS vars, component specs | `design-system` |
| shadcn/ui + Tailwind implementation | `ui-styling` |
| Distinctive art direction, avoid templated defaults | `frontend-design` |
| UX research data, palettes, font pairings, icon/chart picks | `ui-ux-pro-max` |
| Brand voice, identity, consistency | `brand` |
| Social / ad / hero banners | `banner-design` |
| Slide decks and HTML presentations | `slides` |

Furnishing workflow for this repo: `brainstorming` (lock intent) → `design` (route) →
`ui-ux-pro-max` or `design-system` (decide tokens/palette/type) → `ui-styling` or
`frontend-design` (implement) → browser screenshot check → `verification-before-completion`.

## Tool Usage

Skills are OpenCode-native. Use the `skill` tool to list/load, `todowrite` for checklists,
`task`/`subagent` for delegation, `bash` for commands, `read`/`write`/`edit`/`grep`/`glob`
for files, `webfetch`/`websearch` for research.

## Notes

- gstack slash commands (`/gstack-review`, `/gstack-ship`, …) are **not installed** in this
  environment. Do not attempt to load them; use the routing tables above instead.
- `systematic-debugging` in this repo is the project's evidence-first version and
  intentionally supersedes the Superpowers copy of the same name.

---

## Project Context (AIVA AI Chat Platform)

When working on this project, also consider:
- VPS: `63.250.40.159` (SSH key: `~/.ssh/vps_key`)
- App runs on pm2: `ai-chat-web` (port 3001), `evolution-api`
- DB: PostgreSQL `aichatplatform` / user `aichat` / pass `00000000`
- Deploy script: `scripts/deploy.mjs` (runs `prisma generate`, NOT `prisma migrate deploy`)
- Admin login: `goals911` / `experimentgoals119` (env fallback; Admin Users panel takes priority)
- SSH tunnel for browser: `ssh -L 33001:localhost:3001 root@63.250.40.159`

---

## Ponytail Mode

This agent operates in **ponytail full** mode:
- Stop at first rung of ladder that holds (YAGNI → reuse → stdlib → native → installed dep → one line → minimal code)
- Deletion over addition
- Fewest files possible
- Shortest working diff wins
- Mark known ceilings with `ponytail:` comments