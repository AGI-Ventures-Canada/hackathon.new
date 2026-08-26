# Project SOP — oatmeal

- **Repo:** AGI-Ventures-Canada/oatmeal  · **Default branch:** `main` (work targets `staging`; PR `staging` → `main`)
- **Onboarded:** 2026-06-05 on commit 1a9f2191
- **This file is auto-loaded via `@.sdlc/SOP.md` in CLAUDE.md — keep it current.**
- Note: the repo has an extensive root `CLAUDE.md` (~32 KB); this SOP is the quick operating summary. CLAUDE.md
  remains the deep reference.

## What this project is
Oatmeal is an end-to-end **hackathon platform** for running in-person, virtual, or hybrid events from one control
center: registration & team formation, multi-round judging with rubrics and prize tracks, sponsor perks/challenges,
results, and automated post-event email. Three surfaces share one backend: an **organizer dashboard**, **public
event pages** for participants, and an **HTTP API + CLI** for integrations/automation.

## Tech stack (what & why)
| Layer | Choice | Role / why it's here |
|-------|--------|----------------------|
| Runtime / pkg mgr | **Bun 1.3.6+** | Runtime, test runner, package manager. *CLAUDE.md: "NEVER use npm, yarn, or pnpm"* — `bun.lock` is canonical. |
| Framework | **Next.js 16** (App Router) + **React 19** | Full-stack web; server components by default. Middleware is `proxy.ts` (Next 16 rename). |
| Language | **TypeScript 5** (strict) | Path alias `@/*`; no `any`. |
| API | **Elysia 1.4** | All `/api/*` mounted at `app/api/[[...slugs]]/route.ts`; routes in `lib/api/routes/`. |
| Data | **Supabase** (Postgres) | `lib/db/client.ts` (anon + service-role); types auto-generated to `lib/db/types.ts`. RLS deny-all; authz in app layer. |
| Auth | **Clerk 6** | Org-scoped tenants + API-key scopes; dual-auth resolver in `lib/auth/principal.ts`. |
| Email | **Resend** + React Email | Templates in `emails/`; preview via `bun email:dev`. |
| Async | **Workflow DevKit** | Durable workflows in `lib/workflows/` (invites, judging, reminders, exports). |
| AI | **AI SDK + Anthropic** | Tool-use agents in `lib/agents/`; Daytona sandbox in `lib/sandbox/`. |
| UI | **shadcn/ui** (Radix + **Tailwind 4**), lucide | Add via `bunx shadcn@latest add`; semantic color vars only, no custom restyling. |
| Docs | **Fumadocs** (MDX) | From `content/`. |
| Test | **Bun test** + Happy DOM | Custom runners (see gate); 90% coverage threshold (`bunfig.toml`). |
| Lint | **ESLint 9** | `eslint.config.mjs` (next core-web-vitals + TS). |

## The gate — build / run / test commands
Commands are verbatim from `package.json` "scripts" (cross-checked against `.github/workflows/ci.yml`).
- **Install:** `bun install`  (CI: `bun install --frozen-lockfile`)
- **Build:** `bun run build`  (`next build`)
- **Run / dev:** `bun dev`  (a `predev` hook runs `./scripts/setup-local-db.sh`; `bun dev:fresh` resets the DB first)
- **Test (unit):** `bun run test`  ⚠️ **never `bun test`** — that bypasses `scripts/run-unit-tests.ts`
- **Test (integration):** `bun run test:integration`   · **email:** `bun run test:email`   · **everything:** `bun run test:all`
- **Coverage:** `bun run test --coverage` (threshold 90% line/fn/stmt)
- **Lint:** `bun lint`  (`eslint`)   · **Format:** no dedicated script — ESLint is the style gate (`eslint --fix` to autofix)
- **Typecheck:** `bunx tsc --noEmit`  (CI step; not a package script)
- **CLI:** `bun cli <args>` · `bun cli:test` · `bun cli:build`   · **Email preview:** `bun email:dev`
- **DB:** `bun db:sync` (reset + regen types) · `bun db:diff <name>` (new migration) · `bun update-types`
- **Pre-push (local CI mirror):** `bun lint && bun run build && bun run test:all && bun cli:build`
- **Package manager (canonical):** **bun** — enforced by CLAUDE.md + `bun.lock` (note: no `packageManager`/`engines`
  field in `package.json`; the rule lives in docs/CI, not the manifest).

## Architecture map
- **Entry points:** web routes under `app/` (route groups `(public)`, `(dashboard)`, `(auth)`, `(admin)`); API at
  `app/api/[[...slugs]]/route.ts` → Elysia (`lib/api/`); standalone CLI at `packages/cli/`.
- **Major modules:** `lib/api/routes/` (endpoints by domain), `lib/services/` (domain logic + DB access, 30+),
  `lib/auth/` (principal/dual-auth), `lib/workflows/`, `lib/agents/`, `lib/email/`, `lib/db/`; `components/`
  (`ui/` shadcn + domain), `hooks/` (optimistic mutation/list), `emails/`, `supabase/` (migrations + seed).
- **Config / env / secrets:** `.env.local` (gitignored — Clerk/Supabase/Resend/Anthropic keys, `API_KEY_SECRET`,
  `ENCRYPTION_KEY`, `CRON_SECRET`); `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `bunfig.toml`,
  `components.json`, `supabase/config.toml`, `vercel.json` (cron), `proxy.ts` (route protection).
- **Do-not-edit (generated/vendored):** `.next/`, `node_modules/`, `lib/db/types.ts` (regen via `bun db:sync`),
  `.source/` (Fumadocs), `app/.well-known/workflow/` (Workflow DevKit), `packages/cli/dist/`.

## Conventions
- **Style:** no inline comments (self-documenting); delete dead code; reuse existing components; strict TS, no
  `any`; import via `@/*`, never deep relative paths; `import type` for types.
- **Frontend:** pages are server components (no `"use client"` in `page.tsx` — extract to `_client.tsx`); guard
  browser-only state for hydration safety; **semantic Tailwind colors only**; optimistic mutations
  (`useOptimisticMutation`/`useOptimisticList`); 5th-grade-reading-level copy ("Projects" not "Submissions").
- **API/data:** validate UUIDs with `isValidUuid()` before queries; Zod validators in `lib/api/validators.ts`;
  errors thrown and handled by `handleRouteError`; gate status-dependent side effects (emails/webhooks/reminders)
  at **every** entry point (routes, services, workflows, CLI, cron).
- **Git:** Conventional Commits (`fix(clerk): …`); branches `feature/…|fix/…|chore/…|docs/…` off `staging`.
- **CLI isolation:** `packages/cli/` must **not** import app code (`lib/`, `app/`, `components/`) — standalone HTTP client.

## Testing & CI
- **Frameworks & layout:** Bun test via custom runners; tests in `__tests__/` mirroring `api/ services/ workflows/
  integration/ lib/ components/`. Supabase mocks in `__tests__/lib/supabase-mock.ts`; `resetSupabaseMocks()` in
  `beforeEach`. Integration tests run in a **separate process** (mock.module conflicts with unit mocks).
- **CI (`.github/workflows/ci.yml`) — defines "green":** lint (`bun lint`), tests (`bun run test:all`), build,
  `bunx tsc --noEmit`, CLI build. Skipped on draft PRs.
- **Review / quality tooling present:** `.github/workflows/claude-pr-review.yml` (Claude reviews PR-branch commits
  for breaking changes, missing tests, security, `any`, CLI isolation); `publish-cli.yml` auto-publishes the CLI
  to npm on `main`.

## Gotchas & constraints
- `bun run test` ≠ `bun test`; integration/email tests run separately from unit.
- Supabase migrations apply on merge to `main` (not directly to prod); test locally first; CLAUDE.md advises a
  delay before promoting `staging` → `main`.
- Local dev needs `ENCRYPTION_KEY` (`bun gen:secret` → `openssl rand -hex 32`) or CLI login fails; local Supabase
  uses custom ports 54420–54429.
- `NEXT_PUBLIC_*` env values are baked into the client bundle — never put secrets there.
- No `.env.example` in repo (CLAUDE.md references one — minor doc drift).

## How software-factory operates here
- **Gate the pipeline enforces:** `bun lint` → `bun run test:all` → `bun run build` (+ `bunx tsc --noEmit`).
- **Default base branch:** `main`   · **Integration branch:** `staging` (open PRs against `staging`).
- **Fix-branch naming:** `fix/<slug>` (matches repo convention; pipeline default `fix/issue-<N>-<slug>` is compatible).
- **Reviewer for issue-review:** the repo's `claude-pr-review` GitHub Action runs on PRs; `autoreview` can run a
  local pre-PR pass against `origin/staging`.

## Assumptions (unconfirmed — verify before relying on)
- Deployment target is **Vercel** (inferred from `vercel.json` + cron + `NEXT_PUBLIC_APP_URL`); no deploy script in repo.
- Rate limiting (`RateLimitError` exists) is enforced **externally** (edge/proxy), not in `lib/api/` — unconfirmed.
- `app/api/search/` is a planned/partial surface — current behavior undocumented.

## Open questions
- Supabase branching/preview strategy for PRs (not visible in CI).
- Webhook delivery retry strategy (cron-driven vs manual).
- Daytona sandbox: which flows trigger it; self-hosted vs SaaS.
