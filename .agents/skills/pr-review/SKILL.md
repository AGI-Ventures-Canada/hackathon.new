---
name: pr-review
description: Review local changes against the base branch (origin/staging by default) before commit or push. Mirrors the rules enforced by .github/workflows/claude-pr-review.yml so issues are surfaced and fixed locally instead of after a PR opens. Use as part of commit + push checks, or when the user says "review my changes", "review the diff", "/pr-review", or before opening a PR.
allowed-tools: Read Glob Grep Bash(git diff:*) Bash(git log:*) Bash(git show:*) Bash(git status:*) Bash(git rev-parse:*) Bash(git fetch:*) Bash(git merge-base:*) Bash(gh pr view:*) Bash(gh pr diff:*)
metadata:
  internal: true
---

# PR Review (Local)

Run the same review the `Claude PR Review` GitHub Action runs (`.github/workflows/claude-pr-review.yml`), but against the local working tree before a PR exists. The goal: catch the issues the bot would catch *before* push, so review iterations happen locally instead of via PR comments.

## When This Runs

- Automatically as part of the **commit + push checklist**, after `bun lint && bun run build && bun run test:all && bun cli:build` succeed and before `git push`.
- Manually when the user says "review my changes", "review the diff", "/pr-review", or asks for a second opinion before opening a PR.

If the working tree is clean and the local branch has no commits ahead of base, report "Nothing to review" and stop — do not invent changes to critique.

## Review Scope

**Only review commits on the current branch, not pre-existing code in the base branch.** The base branch is `origin/staging` unless the current branch *is* `staging`, in which case use `origin/main`.

Run these commands first:

```bash
BASE=$(git rev-parse --abbrev-ref HEAD)
if [ "$BASE" = "staging" ]; then BASE=origin/main; else BASE=origin/staging; fi
git fetch origin --quiet
git diff "$BASE"...HEAD --stat
git log "$BASE"..HEAD --oneline
git diff "$BASE"...HEAD
```

If there are uncommitted changes, also run `git diff` (working tree vs index) and `git diff --cached` (index vs HEAD) and include them in scope — the user is about to commit them.

## Effort = PR Size

Match effort to scope:

- **Small** (few lines, 1–2 files): Quick review, don't over-investigate.
- **Medium** (new component/feature): Read changed files + immediate dependencies.
- **Large** (architectural): Thorough review across affected domains.

## Project Standards

These are pulled from [CLAUDE.md](../../CLAUDE.md) and the GitHub Action. Flag any violations.

### Git & Workflow

- Never push to `main` or `staging` directly — feature branch + PR only.
- All PRs target `staging`, not `main`.
- `bun run build` must pass before commit (TypeScript errors).
- All new code must have tests (90% coverage target).

### Package Manager

- **bun only.** Flag `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` if they appear in the diff.
- Test scripts use `bun run test`, never `bun test`.

### Code Style

- **No inline comments.** Code should be self-documenting.
- No commented-out code or placeholder stubs — delete dead code.
- TypeScript strict — no `any` types.
- Use `@/` path aliases for imports.
- Use semantic CSS variables (`text-primary`, `bg-muted`, etc.), not raw Tailwind colors (`text-green-500`, `bg-blue-600`).
- Pages in `app/` must be server-side — no `"use client"` in page files.
- Hydration safety: gate browser-only state behind `useSyncExternalStore` `isClient` flag.

### Supabase

- Validate UUID route params with `isValidUuid()` from `lib/utils/uuid.ts` before queries.
- Use Service Role Key in API endpoints, not RLS policies.
- Never apply migrations directly to production — PR workflow only.

### CLI Package (`packages/cli/`)

- CLI must NOT import from main app (`lib/`, `app/`, `components/`).
- All CLI types live in `packages/cli/src/types.ts`.
- Commands follow `src/commands/<resource>/<action>.ts` exporting `run<Action>(client, args)`.
- `bin/cli.mjs` uses `#!/usr/bin/env node`, not bun.
- Verify `bun cli:build` produces `dist/cli.mjs` with no server-side imports leaking.

### Optimistic Rendering

Every user-initiated mutation (add/delete/toggle/reorder/assign) must update the UI before the network round-trip. Flag any handler that awaits `fetch` before calling `setState` or `router.refresh()`. See the "Optimistic Rendering" section in [CLAUDE.md](../../CLAUDE.md) for which hook applies.

### Forms

- URL inputs: `type="text"` + `inputMode="url"`, normalize via `normalizeUrl()`.
- Disable password manager autofill on most forms (`autoComplete="off"`, `data-1p-ignore`, etc.) — exceptions are login/signup, contact, profile.
- Cmd/Ctrl+Enter to submit; auto-focus first input.

### Mobile-First

Tailwind responsive prefixes with mobile-first defaults. Tables wrapped in `overflow-x-auto`. Sidebar uses `lg:` breakpoint, never `md:`.

### Copywriting

5th-grade reading level. No jargon ("Advancement", "Top N by score", "threshold"). See the translation table in [CLAUDE.md](../../CLAUDE.md).

## Review Focus

In priority order:

1. **Breaking changes** to existing functionality.
2. **Security** — exposed secrets, SQL injection, XSS, missing auth checks, unvalidated input crossing trust boundaries.
3. **Missing tests** — new code without accompanying tests in `__tests__/`.
4. **Logic bugs** — off-by-one, null deref, race conditions, wrong predicate.
5. **TypeScript** — `any`, unsafe casts, missing types on public surfaces.
6. **CLI isolation** — CLI package importing from `lib/`, `app/`, or `components/`.
7. **Dead code** — unused imports/vars/exports introduced in the diff, commented-out blocks.
8. **Style** — only flag if it materially hurts readability or contradicts the standards above.

### Flow-completeness checks

These map to the rules in the "Three Identity States" and "Status-Gated Side Effects" sections of [CLAUDE.md](../../CLAUDE.md). Run them when the diff matches the trigger shape.

**Identity-branch audit** — if the diff adds or modifies code that accepts a user email or ID and creates a relationship (team member, judge, sponsor, organizer): confirm all three identity states are handled with forward paths — (a) registered participant, (b) Clerk user not registered here, (c) no Clerk account. Flag any branch returning `400`/`409`/`"not registered"` instead of routing to a pending-invite flow. Treat as **Warning** (or **Critical** if it visibly blocks an organizer workflow).

**Status-gate completeness check** — if the diff adds a status check before a side effect (`if (hackathon.status === "draft")`, `if (status !== "published")`, etc.) around a `sendXEmail`, `triggerWebhook`, `scheduleReminder`, or external API call: grep the rest of the codebase for other call sites of the same side effect and report any that lack the matching guard. Treat missing guards as **Warning**. Also verify a draft→non-draft flush path exists for any newly-queued state.

Do **not** flag:

- Pre-existing code outside the diff scope.
- Personal style preferences not encoded in CLAUDE.md.
- "Nice to have" refactors when the change is otherwise correct and small.

## Response Format

```
**Review**: <one sentence summary>
**What it does**: <one sentence description of the change>

---

### What's Good
<brief positive points, if any — skip if nothing notable>

### Issues Found
- **Critical**: <must fix before push/merge>
- **Warning**: <should address>
- **Suggestion**: <nice to have>

If no issues: "No issues found."
```

Reference each finding with `path/to/file.ts:LINE` so the user can jump to it.

Keep it short. Be direct. Focus on what matters.

## Integration With Commit + Push

When invoked as part of the commit + push checklist:

1. Confirm the prior CI checks (`lint`, `build`, `test:all`, `cli:build`) have already passed in this turn — if not, ask the user to run them first.
2. Run the review.
3. If **Critical** findings exist, stop and ask the user to fix them before pushing. Do not push automatically.
4. If only **Warning** or **Suggestion** findings exist, surface them and let the user decide whether to push now or fix first.
5. If "No issues found", proceed with the push.

This skill never pushes code itself — it only reports findings. The push is the user's call.
