# Agent Boundaries — oatmeal

- **Repo:** AGI-Ventures-Canada/oatmeal
- **Set:** 2026-06-05 on commit 1a9f2191
- **Enforcement:** policy + compiled globs (`.sdlc/boundaries.generated.json`) written; `.claude/settings.json`
  rules + Bash-guard hook **proposed but not applied** (see `## Proposed enforcement`). Apply when ready.
- **This file is auto-loaded via `@.sdlc/BOUNDARIES.md` in CLAUDE.md — keep it current.**

## Tiers
🟢 Free — normal autonomy.  🟡 Protected — human verification before editing.  🔴 Off-limits — never edit autonomously.

Guiding rule: boundaries gate **modifying what already exists** (security / blast-radius / regression). Creating
net-new code in a free area stays 🟢.

## 🟡 Protected (human verification to edit)
| Surface (glob) | Category | Why | Trigger |
|----------------|----------|-----|---------|
| `package.json`, `bun.lock`, `packages/cli/package.json`, `packages/cli/bun.lock` | Dependencies | Supply-chain; repo is **bun-only**, lockfile is canonical | **Any** edit |
| `lib/auth/**`, `proxy.ts` | Auth/authz | Dual-auth resolver + route protection; security-critical | Editing existing auth |
| `lib/api/routes/dashboard.ts`, `lib/api/routes/v1.ts` | Auth-bearing API | Clerk/API-key auth surfaces | Editing existing |
| `supabase/migrations/**` | DB migrations (new) | Schema/data risk | **Creating** a migration (`Write`) |
| `supabase/seed.sql`, `supabase/config.toml` | DB seed/config | Affects every local reset | Any edit |
| `.github/workflows/**`, `vercel.json` | CI/CD & cron | Controls what runs / ships / is scheduled | Any edit |

Creating **new** auth code or **new** API routes is 🟢 (free) — only edits to the existing surfaces above are gated.
Prefer `bun add`/`bun remove` for deps and `bun db:diff <name>` for new migrations (the sanctioned paths).

## 🔴 Off-limits (never edited autonomously)
| Surface (glob) | Why |
|----------------|-----|
| `**/.env*`, `**/*.pem`, `**/*.key` | Secrets / credentials (`.env.local` holds Clerk/Supabase/Resend/Anthropic keys) |
| `supabase/migrations/**` (existing files, via `Edit`) | Never rewrite an already-applied migration |
| `lib/db/types.ts` | Generated from schema — regen via `bun db:sync`, never hand-edit |
| `.next/**`, `.source/**`, `app/.well-known/workflow/**`, `packages/cli/dist/**`, `node_modules/**` | Build/generated output |
| `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` | Foreign lockfiles — repo is bun-only; creating one breaks CI |
| Destructive DB ops (drop/truncate/bulk-delete, applying migrations to prod) | Irreversible; migrations apply only on merge to `main` |

## What "human verification" means
- **Interactive:** pause and ask for explicit approval before editing a 🟡 surface; refuse 🔴.
- **Autonomous (factory-orchestrator):** a diff touching a 🟡 surface is forced onto the human-review path (open
  PR + tag a human, never auto-merge); needing a 🔴 surface aborts the run.

## Exception protocol
- A plan (`.sdlc/plans/issue-N.md`) that explicitly names a 🟡 surface and was approved counts as verification for
  that change. Record ad-hoc approvals here with date + scope.

## Proposed enforcement (`.claude/settings.json` — not yet applied)
Migrations use the **Edit=deny / Write=ask** split so editing an existing migration is blocked while creating a new
one prompts. Merge additively into a committed `.claude/settings.json` (oatmeal currently has only a personal
`settings.local.json`). See the session report for the exact JSON, plus the optional `PreToolUse` Bash-guard hook
(`agent-boundaries/scripts/guard_bash_edits.py`, driven by `.sdlc/boundaries.generated.json`).

## Assumptions (unconfirmed — verify before relying on)
- `lib/api/routes/dashboard-*.ts` (event/judging/prizes/results) are treated 🟢; only `dashboard.ts`/`v1.ts` are
  gated as the auth-bearing entry points. Widen if more route files carry auth logic.
- Payments are not yet integrated; no rule set. Add a 🟡/🔴 surface when Stripe/billing lands.

## Open questions
- Should the broader `lib/api/routes/**` public contract be review-gated (breaking-change risk) beyond the two
  auth files? Currently handled by code review, not a hard boundary.
