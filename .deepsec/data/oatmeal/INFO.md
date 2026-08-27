# hackathon.new

## What this codebase does

hackathon.new is a multi-tenant hackathon platform built with Next.js 16, React 19,
Elysia, Clerk, Supabase, Stripe, Resend, and Vercel. Organizers and sponsors
manage events, people, judging, prizes, email, webhooks, and integrations.
Attendees register, join teams, submit projects, request mentors, and claim
prizes. The app, public API, CLI, and WebMCP tools share the same backend.

## Auth shape

- `resolvePrincipal(request)` resolves Clerk sessions or HMAC-verified API keys
  and caches the result per request.
- `requirePrincipal(principal, kinds, scopes)` gates tenant routes and scopes;
  `requireAdmin` plus `requireAdminScopes` gate platform administration.
- `checkHackathonOrganizer` and `getManageHackathon` enforce event ownership;
  route UUIDs must pass `isValidUuid` before database queries.
- `isAuthorizedCronRequest` protects every cron endpoint with `CRON_SECRET`.
- Supabase service-role access bypasses RLS, so application-layer tenant and
  role checks are mandatory before every private query or mutation.

## Threat model

The highest-impact attacks cross tenant boundaries, obtain service credentials
or OAuth tokens, forge API keys, or trigger organizer actions such as email,
judging, prize, webhook, and lifecycle changes. Public event inputs, uploads,
imports, webhook URLs, invite tokens, and CLI/WebMCP actions are the main
untrusted surfaces. Privacy failures can expose attendee names, emails, team
membership, private projects, judge assignments, sponsor secrets, or exports.

## Project-specific patterns to flag

- Flag dashboard, admin, v1, manage, workflow, and cron handlers that reach a
  service-role query before the matching principal, scope, ownership, or cron
  check.
- Flag event queries or mutations that accept a UUID-like route value without
  `isValidUuid`, `checkHackathonOrganizer`, or an equivalent validated lookup.
- Flag a status-gated email, webhook, reminder, prize, judging, or lifecycle
  side effect whose sibling entry points lack the same gate or flush path.
- Flag outbound requests that bypass `fetchAllowedUrl` or
  `fetchAllowedWebhookUrl` when a user controls the destination.
- Flag app/API changes whose WebMCP or CLI path has weaker validation,
  authorization, lifecycle behavior, or queued-versus-immediate reporting.

## Known false-positives

- `__tests__/`, `supabase/seed.sql`, test scenarios, and dev mock IDs contain
  synthetic credentials, users, emails, and tokens.
- `/api/public/*`, public event pages, documentation, health, and Swagger are
  intentionally anonymous, but must return only approved public fields.
- `lib/utils/safe-fetch-url.ts` intentionally creates a pinned Undici dispatcher
  after public-IP DNS validation to resist DNS rebinding.
- `lib/api/routes/dev.ts` uses the service role intentionally and is mounted only
  in development or with `ADMIN_ENABLED=true`; non-development requests still
  require an admin principal.
- `packages/cli` opens the system browser and runs fixed package-manager update
  commands; no user-controlled value may be interpolated into a shell string.
