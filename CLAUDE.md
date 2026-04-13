# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

This project uses **bun** as the package manager.

**CRITICAL: NEVER use npm, yarn, or pnpm commands in this repository.**

**CRITICAL: Always use `bun run test`, never `bun test`.** `bun test` invokes Bun's built-in test runner which behaves differently from the project's configured test script.

## Commands

```bash
bun dev                  # Start dev server (auto-starts local Supabase)
bun dev:fresh            # Reset database + start dev server (clean slate)
bun run build            # Production build
bun start                # Start production server
bun lint                 # Run ESLint
bun run test             # Run unit tests (api, lib, services)
bun run test:integration # Run integration tests separately
bun run test:email       # Run email template tests separately
bun run test:all         # Run all tests (unit + integration)
bun run test --coverage  # Run with coverage report
bun db:sync              # Reset DB + regenerate types
bun db:diff name         # Capture Studio changes as migration
bun update-types         # Regenerate TypeScript types from DB
bun cli <args>           # Run CLI package (dev mode, TypeScript)
bun cli:test             # Run CLI tests
bun cli:build            # Build CLI for npm distribution
bun email:dev            # Preview email templates at http://localhost:3001
```

### Test Scenarios

Seed the local database with a hackathon at a specific lifecycle stage. Requires `bun dev` to be running.

```bash
bun run scripts/test-scenario.ts <scenario>
```

| Scenario | What it sets up |
|----------|-----------------|
| `pre-registration` | Hackathon not yet open for registration (opens tomorrow) |
| `registered-no-team` | Dev user registered, no team yet, registration open |
| `team-formed` | Dev user is captain with 2 members + 1 pending invite, hackathon active |
| `submitted` | Dev user's team has a submitted project, hackathon ends in 2 days |
| `judging` | 5 teams with submissions, 3 judges assigned, no scores yet |
| `judging-in-progress` | Same as above but ~60% of assignments scored |
| `results-ready` | All submissions scored, results calculated, 3 prizes defined (not yet assigned) |

## Architecture

Next.js 16 App Router with:
- React 19, TypeScript (strict mode), Tailwind CSS 4
- Supabase (database, auth helpers), Clerk (authentication), Stripe (payments)
- Elysia (API routes), AI SDK 6, Shadcn/ui components
- `@agi-ventures-canada/hackathon-cli` — standalone CLI package (`packages/cli/`), published to npm, no server-side imports

### Route Structure

| Route | Purpose | Auth | URL Pattern |
|-------|---------|------|-------------|
| `/e/[slug]` | Public event pages for participants, judges, and visitors | Optional | Human-readable slugs |
| `/hackathons/[id]` | Dashboard management for organizers and sponsors | Required | Database UUIDs |

- `(public)` routes allow unauthenticated access with a simple header
- `(dashboard)` routes require authentication and show the sidebar

### Path Aliases

Use `@/*` to import from the project root.

### Domain Documentation

See domain-specific CLAUDE.md files for detailed patterns:
- `lib/api/CLAUDE.md` - Elysia API patterns, route namespaces, auth
- `lib/workflows/CLAUDE.md` - Workflow DevKit, durable agents, steps
- `lib/agents/CLAUDE.md` - AI SDK 6, ToolLoopAgent, streaming, Anthropic models
- `lib/sandbox/CLAUDE.md` - Daytona sandbox lifecycle, file operations
- `lib/integrations/CLAUDE.md` - OAuth flows, token management
- `lib/email/CLAUDE.md` - Resend email sending and receiving
- `supabase/CLAUDE.md` - Database development, migrations, branching
- `scripts/CLAUDE.md` - Test scenario scripts for seeding dev database
- `packages/cli/CLAUDE.md` - CLI package architecture, adding commands, testing

### External Documentation Links

When developers include external documentation links in requests, save them to the appropriate CLAUDE.md file:

| Domain | Target File |
|--------|-------------|
| ai-sdk.dev, anthropic.com | lib/agents/CLAUDE.md |
| useworkflow.dev | lib/workflows/CLAUDE.md |
| daytona.io | lib/sandbox/CLAUDE.md |
| supabase.com | supabase/CLAUDE.md |
| resend.com | lib/email/CLAUDE.md |
| luma.com, docs.luma.com | lib/integrations/CLAUDE.md |

### CLAUDE.md / AGENTS.md Symlink Convention

Every directory with agent instructions must expose both `CLAUDE.md` and `AGENTS.md`, with one symlinked to the other (`ln -s CLAUDE.md AGENTS.md`). Never maintain them as separate files with duplicated content.

### Claude Skills

Skills in `.claude/skills/`:
- `local-dev-setup.md` - Developer onboarding and local environment setup

#### Hackathon Skills (`skills/`)

Public, installable skills at the project root, distributed via [skills.sh](https://skills.sh). These are **not** internal dev skills. Public skills must live in `skills/`; repo-local helper skills outside `skills/` must set `metadata.internal: true`.

**Install:** `npx skills add AGI-Ventures-Canada/oatmeal`

**Structure:** Each skill follows the standard skills.sh format (`skills/<skill-name>/SKILL.md` + `references/*.md`).

| Skill | When It Activates |
|-------|-------------------|
| `hackathon-cli` | User asks to create/manage hackathons via CLI or terminal |
| `hackathon-api` | User asks to make direct API calls, test endpoints, or debug API responses |
| `hackathon-organizer` | User asks how to organize, plan, or run a hackathon |
| `hackathon-attendee` | User is preparing for or competing in a hackathon |

## Next.js 16 Specifics

### proxy.ts (replaces middleware.ts)
Use `proxy.ts` at project root for request interception (redirects, rewrites, headers). Use proxy for routing/edge decisions only — auth + permissions belong in API handlers.

### Async Request APIs
All request APIs (`params`, `searchParams`, `cookies()`, `headers()`) are async and must be awaited.

### Other Key Changes
- Turbopack is default (no flag needed)
- Node.js 20.9+ required
- `next lint` removed - use ESLint directly
- Parallel routes require `default.js` files

## Development Rules

### New Features Require Plan Mode and Interview

**When the user asks to build a new feature, ALWAYS enter plan mode first and conduct an interview to clarify requirements** — what, expected behavior, edge cases, how it fits existing functionality, UI/UX preferences, v1 scope. Only proceed after the user confirms the plan. Does not apply to bug fixes, refactors, or small tweaks.

### Pages Must Be Server-Side

All page components in `app/` must be server-side rendered. Never use `"use client"` in page files. Extract client-side functionality into separate client components.

### UI Components

Base components are shadcn/ui. Add missing components with `bunx shadcn@latest add <component-name>`. Check existing components before creating new ones.

### Sidebar

The dashboard sidebar is `components/app-sidebar-simple.tsx` — a custom component, **not** the shadcn/ui sidebar primitives. Always modify `app-sidebar-simple.tsx` for sidebar changes.

### shadcn/ui Styling

**CRITICAL: Use shadcn components as-is. Do not add custom styling.** Use component variants (`variant="outline"`, `variant="destructive"`) instead of custom Tailwind classes. Use proper shadcn primitives — never wire up manual mouse/keyboard event handlers when a shadcn component already handles the interaction (e.g., use `DropdownMenu` not `onMouseEnter`/`onMouseLeave` hacks).

### Colors

**CRITICAL: Never use custom Tailwind colors (e.g., `text-green-500`, `bg-blue-600`). Always use semantic CSS variables:** `text-primary`, `bg-primary`, `text-secondary`, `bg-secondary`, `text-muted-foreground`, `bg-muted`, `text-destructive`, `bg-destructive`, `text-foreground`, `bg-background`, `border`, `ring`. This ensures consistent theming and dark mode support.

### Copywriting

- Lead with the user outcome, not the internal feature or brand name
- Prefer one short sentence over two average ones
- Keep technical caveats out of first-glance UI copy; move details into tooltips, help text, or docs
- Use job-to-be-done labels ("Manage hackathons from your AI agent" not "Install Oatmeal Skills")

### Supabase

- **Never pass unvalidated strings to UUID column queries** — use `isValidUuid()` from `lib/utils/uuid.ts`. The `HackathonDraftEditor` uses `id: "draft"` as a placeholder.
- Use Service Key in API endpoints to bypass RLS policies
- Handle auth and roles in the application layer, not RLS
- Never apply migrations directly to production - use PR workflow
- Test migrations locally with `supabase db reset` before pushing
- **After creating or modifying migration files, always ask the user if they want to run `bun db:sync`**

### Forms

**Disable password manager autofill on most forms.** Add `autoComplete="off"`, `data-1p-ignore`, `data-lpignore="true"`, `data-form-type="other"` to inputs. Add `autoComplete="off"` to `<form>`. Exceptions: login/signup, contact, and profile forms.

**URL inputs must accept bare domains and paths.** Use `type="text"` with `inputMode="url"` (not `type="url"`). Normalize with `normalizeUrl()` from `lib/utils/url.ts` on blur/submit. Disable auto-capitalization and spellcheck. When URL behavior changes, update matching API routes and CLI flows.

**Support Cmd/Ctrl+Enter to submit forms.** Check `(e.metaKey || e.ctrlKey) && e.key === "Enter"` in `onKeyDown`. Exceptions: search inputs, single-field forms, chat inputs (use Enter instead).

**Auto-focus the first input when a form appears.** Use `autoFocus` or programmatic focus via `ref`/`requestAnimationFrame`. Exceptions: mobile viewports, multi-step wizards needing instructions, destructive action dialogs.

### Easy Navigation and Exit

- **Easy exit**: Visible close/X button or cancel. `Escape` dismisses overlays/modals
- **Easy skip**: Persistent skip action labeled with destination ("Skip to event page")
- **Keyboard**: `Enter` advances (suppressed in textareas). `Cmd/Ctrl+Enter` triggers primary skip/submit
- **Kbd hints**: Show hints next to actions (e.g., `⌘+Enter`). Hide on mobile (`hidden sm:inline-flex`)
- **Progress**: Step counter (`1 / N`) and progress bar for multi-step flows
- **Straightforward copy**: Action labels tell exactly what happens. No ambiguous verbs
- **localStorage persistence**: Save draft state so refreshes/sign-in redirects don't lose work
- **Late auth gates**: Don't require sign-in to fill forms — gate only at submission

### Human-Friendly Inputs

**Never expose internal IDs, raw timestamps, or technical formats.** Use email addresses/names/searchable dropdowns instead of Clerk user IDs or UUIDs — resolve server-side. Use duration presets for countdowns (reserve `datetime-local` for scheduling future dates). Show human-readable status labels. If a form field requires looking something up in another system, do the lookup for them.

### Unknown User by Email

When a feature references a user by email and they don't exist in Clerk, send a personalized invite (who, which org, what for) using the existing team invitation infrastructure (`team_invitations` table, `sendTeamInvitationEmail`, `/invite/[token]`).

### Date/Time Defaults

**Every date/time input must have a sensible default.** Event start: 2 weeks from today at 8:30 AM. Event end: day after start at 5:00 PM. Registration: open now, close day before event. Schedule items: next slot after last item (rounded to 15 min), default 30 min duration. Announcements: 1 hour from now. Recurring schedules: 9:00 AM. Fallback "from" times: 8:30 AM, "to" times: 5:00 PM. Use `minDate`/`min` to prevent past dates on forward-looking inputs (exception: admin editors).

### Mobile-First Responsive Design

**All UI must work on mobile (375px+).** Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) with mobile-first defaults.

- **Layouts**: `p-4 md:p-6`, stack vertically by default, `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
- **Inputs**: `w-full sm:w-64` (full on mobile, fixed on desktop)
- **Tables**: Always wrap in `<div className="overflow-x-auto">`
- **Button labels**: Hide text on mobile: `<span className="hidden sm:inline">Label</span>`
- **Tab bars**: Wrap in `<div className="overflow-x-auto">`

**Touch interactions**: Every hover interaction must have a tap/click equivalent. Use Popover instead of HoverCard on mobile. Don't hide essential info behind hover-only interactions.

**Mobile navigation** (`components/mobile-header.tsx`): Full-screen overlay with drill-down navigation, independent from desktop sidebar. Large touch targets (`text-xl`, `py-5`, min 44px). Lock body scroll when open. Auto-close on navigation.

**Sidebar breakpoint**: `lg:` (1024px), matching `MOBILE_BREAKPOINT = 1024` in `hooks/use-mobile.ts`. Never use `md:` for sidebar visibility.

### Optimistic Rendering

**Default to optimistic UI updates for all user-initiated mutations.** Pattern: track "hidden"/"pending" sets in state, filter server data through them, revert on API failure.

- Remove loading spinners on items that disappear instantly
- Keep `router.refresh()` after success for eventual consistency
- Re-throw errors when called by child components that also handle errors

### Keep Seed Data in Sync

**When adding new columns/types/features, update ALL seed sources:** `scripts/test-scenarios/_helpers.ts`, `scripts/test-scenarios/*.ts`, `lib/services/admin-scenarios.ts`, `lib/api/routes/dev.ts`, `components/dev-tool/`. Don't rely on DB defaults when the default value would cause downstream logic to skip the record.

### Code Style

- Do not write comments above code
- Maintain TypeScript type safety throughout
- Delete dead code outright — no commented-out blocks or placeholder stubs
- **Reuse existing components/patterns** — check before building custom. Ask the user if unsure
- **Consider CLI impact** — if you change API contracts or workflows, verify whether `packages/cli/` needs updates

### Testing

**Target: 90% coverage. All new code must have tests.**

**Integration tests must run separately** (`bun run test:integration`) — they use `mock.module` at the service layer which conflicts with service tests. Email integration tests also run separately (`bun run test:email`).

#### Test Organization

```
__tests__/
├── api/           # API route tests
├── integration/   # Integration tests (run separately)
├── lib/           # Utility tests + shared mocks (supabase-mock.ts)
├── services/      # Service layer tests with DB mocks
└── workflows/     # Workflow tests
```

#### Mocking Pattern

Service tests use closure-based mock setters from `__tests__/lib/supabase-mock.ts`: `createChainableMock()`, `resetSupabaseMocks()`, `setMockFromImplementation()`, `setMockRpcImplementation()`. Call `resetSupabaseMocks()` in `beforeEach`.

#### Email Templates

Templates live in `emails/` as React Email components. Send logic in `lib/email/*.ts` renders via `render()` from `@react-email/components`. Tests mock `sendEmail` from `@/lib/email/resend` and assert with `.toContain()` — never exact HTML structure.

## Git Workflow

### Starting New Work

Automatically run before creating a feature branch:
1. `git status` — investigate uncommitted changes. Discard auto-generated files; commit or stash real work
2. `git fetch origin` — rebase/pull if behind
3. `git checkout -b feature/<name> origin/staging`

### Core Rules

- **Never push to main or staging directly.** All changes: feature branch → PR → merge
- **All PRs target `staging`**, never `main`
- **Staging→main merges via PR only** — Supabase only applies migrations on PR merge events. Wait 10+ minutes after merging to staging before creating the staging→main PR
- **Commit all changes** — stage everything in the working tree, don't cherry-pick files
- **Rebase before PR/push**: `git fetch origin && git rebase origin/staging`, then `git push --force-with-lease`
- **No draft PRs** — PRs should be ready for review when created
- **Resolve conflicts before opening PRs** — reviewer should never see conflicts
- **Auto-push after committing** when user says "push" and an open PR exists (`gh pr view`)
- **Check PR status before pushing** — if `MERGED`, create a new feature branch

### Force-Push Safety

**`--force-with-lease` is ONLY safe when you are the sole author.** Before force-pushing, check `git log --oneline origin/<branch> --not <branch>`. If others have pushed, `git pull --rebase origin <branch>` instead. Never resolve conflicts by discarding others' work.

### CI Checks Before Pushing

```bash
bun lint && bun run build && bun run test:all && bun cli:build
```

Fix all failures before pushing.

### Commit Message Style

Conventional Commits: `<type>(<scope>): <subject>` — imperative present tense, no capital, no period, under 50 chars. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

## Maintenance

### Proactive Code Review

**CRITICAL: Before every push, run the `code-reviewer` agent against `git diff origin/staging...HEAD`.** Fix all critical/important findings and re-run affected tests before pushing. Focus: security, missing validation, logic bugs, type safety, dead code.

### Address All PR Review Warnings

**All warnings from reviewers must be resolved before merging.** Warnings: fix or explain why inapplicable. Suggestions: apply if they improve code. Dead code/unused params/stale comments: fix immediately.

### Browser Verification

**CRITICAL: For any UI change, verify in the browser with `agent-browser` before considering done.**

Connect to the user's Chrome (`--remote-debugging-port=9222`):

```bash
agent-browser --auto-connect --session oatmeal open http://localhost:3000
agent-browser --session oatmeal wait --load networkidle
agent-browser --session oatmeal snapshot -i
agent-browser --session oatmeal screenshot /tmp/screenshot.png
agent-browser --session oatmeal console
agent-browser --session oatmeal close
```

If `--auto-connect` targets the wrong tab, list tabs with `curl -s http://127.0.0.1:9222/json/list` and connect via `--cdp "$WS_URL"`. Full command reference in `.agents/skills/agent-browser/`.

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `API_KEY_SECRET` | Hashes API keys before DB storage (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Encrypts CLI auth session tokens, exactly 64 hex chars (`openssl rand -hex 32`). Without it, `hackathon login` fails |
| `SCENARIO_ORG_ID` | Clerk org ID for admin test scenarios. Required for `/admin/scenarios` |
| `SCENARIO_DEV_USER_ID` | Clerk user ID for test scenarios. Generated by `bun run scripts/provision-test-users.ts` |
| `NEXT_PUBLIC_POSTHOG_KEY` | **Production only** (Vercel). Never set in `.env.local` |

### Local Supabase Port Assignments

Custom ports in `supabase/config.toml` to avoid conflicts with `agents-server`:

| Service | Port |
|---------|------|
| db | 54422 |
| studio | 54423 |
| inbucket | 54426 |
| pooler | 54429 |
| analytics | 54427 |

If `ports are not available`: `supabase stop` in conflicting project, restart Docker Desktop if needed.

### Keep Skills Updated

**When the stack changes, update `.claude/skills/local-dev-setup.md`** with new env vars, prerequisites, setup steps, and troubleshooting.
