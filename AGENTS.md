# gstack Auto-Trigger Rules

This file tells the agent when to automatically load gstack skills. The agent will follow these rules without being asked.

## Core Principle

**Every development task triggers the appropriate gstack skill automatically.** You don't need to ask for them.

---

## Auto-Trigger Table

| Task Type | Skills Auto-Loaded (in order) |
|-----------|-------------------------------|
| **New feature request** | `/gstack-office-hours` → `/gstack-plan-ceo-review` → `/gstack-autoplan` → implement → `/gstack-review` → `/gstack-qa` → `/gstack-ship` |
| **Bug report / regression** | `/gstack-investigate` → `/gstack-qa` → `/gstack-review` → `/gstack-ship` |
| **Security concern / audit** | `/gstack-cso` → `/gstack-review` |
| **Design task (UI/UX)** | `/gstack-design-shotgun` → `/gstack-design-html` → `/gstack-design-review` |
| **Code review needed** | `/gstack-review` |
| **Pre-merge / PR ready** | `/gstack-ship` |
| **Post-deploy verification** | `/gstack-canary` → `/gstack-benchmark` |
| **Documentation update** | `/gstack-document-release` |
| **Retrospective / learning** | `/gstack-retro` → `/gstack-learn` |
| **Browser testing needed** | `/gstack-browse` |
| **Architecture / tech design** | `/gstack-plan-eng-review` |
| **Developer experience** | `/gstack-plan-devex-review` |
| **Spec writing** | `/gstack-spec` |

---

## Skill Name Mapping

All gstack skills are prefixed with `gstack-` in OpenCode:

| Slash Command | OpenCode Skill Name |
|---------------|---------------------|
| `/office-hours` | `gstack-office-hours` |
| `/plan-ceo-review` | `gstack-plan-ceo-review` |
| `/plan-eng-review` | `gstack-plan-eng-review` |
| `/plan-design-review` | `gstack-plan-design-review` |
| `/plan-devex-review` | `gstack-plan-devex-review` |
| `/autoplan` | `gstack-autoplan` |
| `/design-consultation` | `gstack-design-consultation` |
| `/design-shotgun` | `gstack-design-shotgun` |
| `/design-html` | `gstack-design-html` |
| `/design-review` | `gstack-design-review` |
| `/review` | `gstack-review` |
| `/investigate` | `gstack-investigate` |
| `/qa` | `gstack-qa` |
| `/qa-only` | `gstack-qa-only` |
| `/ship` | `gstack-ship` |
| `/land-and-deploy` | `gstack-land-and-deploy` |
| `/canary` | `gstack-canary` |
| `/benchmark` | `gstack-benchmark` |
| `/cso` | `gstack-cso` |
| `/browse` | `gstack-browse` |
| `/document-release` | `gstack-document-release` |
| `/document-generate` | `gstack-document-generate` |
| `/retro` | `gstack-retro` |
| `/learn` | `gstack-learn` |
| `/spec` | `gstack-spec` |

---

## Implementation Details

### For New Features
1. Load `gstack-office-hours` to scope and challenge the idea
2. Load `gstack-plan-ceo-review` to find the 10-star product
3. Load `gstack-autoplan` to run full review pipeline (CEO → design → DX → eng)
4. Implement the plan
5. Load `gstack-review` for staff-level code review
6. Load `gstack-qa` to test in real browser
7. Load `gstack-ship` to run tests, push, open PR

### For Bugs
1. Load `gstack-investigate` for systematic root-cause analysis
2. Fix the root cause
3. Load `gstack-qa` to verify fix in browser + generate regression test
4. Load `gstack-ship`

### For Security
1. Load `gstack-cso` for OWASP + STRIDE audit
2. Load `gstack-review` for code-level security review

---

## Tool Usage

The gstack skills have been patched for OpenCode tool names:
- `question` instead of `AskUserQuestion`
- `websearch` instead of `WebSearch`
- `read` / `write` / `edit` / `grep` / `glob` / `bash` / `task` / `webfetch`
- MCP references to `mcp__*__AskUserQuestion` preserved

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