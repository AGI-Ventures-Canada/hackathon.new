# hackathon.new

[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)
[![CI](https://github.com/AGI-Ventures-Canada/hackathon.new/actions/workflows/ci.yml/badge.svg)](https://github.com/AGI-Ventures-Canada/hackathon.new/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?logo=bun)](https://bun.sh/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

**hackathon.new is the platform for running hackathons end-to-end — registration, teams, judging, prizes, and results.**

Organizers launch an event in minutes, attendees form teams and submit projects, judges score with configurable rubrics, and winners are selected with transparent math. Run it in person, virtually, or both — from the dashboard, the CLI, an AI agent, or the API.

## What's in the box

| Surface | For | Highlights |
|---------|-----|------------|
| **Dashboard** (`/hackathons/:id`) | Organizers, sponsors | Configure the event, invite judges, manage prizes, broadcast announcements |
| **Public event pages** (`/e/:slug`) | Attendees, judges, visitors | Register, form teams, submit projects, score submissions, view results |
| **CLI** (`@agi-ventures-canada/hackathon-cli`) | Power users, scripts | Manage every hackathon resource from your terminal |
| **Skills** (`npx skills add AGI-Ventures-Canada/hackathon.new`) | AI agents | Claude Code, Cursor, and others can run the event for you |
| **Public API** (`/api/*`) | Integrations | Dashboard CRUD with API keys, stable v1 surface for jobs + webhooks |
| **Webhooks** | Integrations | Subscribe to registration, team, submission, and judging events |

## Features

Major additions since 2026-02:

- **Hybrid events** — in-person, virtual, or mixed. Assign in-person teams to rooms, keep virtual teams online only.
- **Judging rounds with presets** — run multi-round tournaments (screening → semi-finals → finalists) with one-click presets including "Finalists — judges pick".
- **Prize tracks** — group prizes into tracks (Grand Prize, Sponsor Awards, Track: AI Safety) with round-scoped advancement rules.
- **Sponsor perks** — credits, API keys, coupons, and custom offers released on a schedule or manually to participants.
- **Challenges** — sponsor or theme-based prompts with resources, released on the event timeline.
- **Reminder emails** — automated nudges for registration close, submission deadlines, and judging windows.
- **Luma import** — paste a Luma event URL and we import title, description, dates, and cover image in one click.
- **Action items** — organizer to-do list that surfaces what still needs attention before the event starts.
- **Mentor queue** — attendees request help, mentors triage and claim requests in real time.
- **Announcements** — publish immediately or schedule, target specific audiences (all, teams-only, judges).
- **WebMCP** — let a browser agent read the page, fill visible work, and open reviews while people keep every final submit, publish, invite, judging, and mentor action.

## Dashboard, CLI, or API — pick your surface

All three talk to the same backend. Use whichever fits the task.

**Dashboard.** Fastest for most organizer work. Visual, click-driven, forgiving.

**CLI.** Great for scripted setup, bulk changes, and sharing repeatable event templates.

```bash
bun add --global @agi-ventures-canada/hackathon-cli
hackathon login
hackathon events list
hackathon prizes create <hackathon-id> --name "Best AI App"
```

**Skills + AI agents.** Install once in your agent; ask it to run the event.

```bash
npx skills add AGI-Ventures-Canada/hackathon.new
# In Claude Code / Cursor:
# "Create a 48-hour AI hackathon starting next Friday with 3 tracks and a $5k grand prize."
```

**API.** Dashboard endpoints accept `Authorization: Bearer sk_live_...` — anything you can do in the UI, you can do over HTTPS. The `/api/v1/*` namespace exposes stable primitives for jobs, webhooks, and activity logs. Full reference at `/api/swagger`.

## Development

```bash
bun install
bun dev
```

| URL | Description |
|-----|-------------|
| http://localhost:3000 | App |
| http://localhost:3000/docs | Documentation |
| http://localhost:3000/api/swagger | API reference |
| http://localhost:3000/api/public/health | Health check |

Run tests: `bun run test`

Before opening a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md). By taking
part, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). For help,
see [SUPPORT.md](SUPPORT.md). Report security issues privately as described in
[SECURITY.md](SECURITY.md).

### Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Elysia (API routes)
- Clerk (auth) + Supabase (database)
- AI SDK 6 + Anthropic
- Workflow DevKit (durable workflows)
- Tailwind CSS 4 + shadcn/ui

### New developer setup

Use Claude Code for interactive onboarding:

```bash
claude
# Then type: /local-dev-setup
```

Or manually:

1. Install prerequisites: Bun, Node.js 20.18.1+, Supabase CLI, Docker
2. `bun install`
3. Copy `.env.example` to `.env.local` and add Clerk keys
4. `bun dev` (auto-starts local Supabase)
5. Open http://localhost:3000

See `.claude/skills/local-dev-setup/SKILL.md` for detailed steps.

## Rules files

`CLAUDE.md` and `AGENTS.md` expose the same instructions for local development tools. In any directory that has agent guidance, one filename is a symlink to the other so different tools can read the same rules without duplicating content.

Public installable skills live in `skills/` and are distributed via [skills.sh](https://skills.sh). Repo-local helper skills live in agent-specific folders and are meant to support local development inside this repository.

## Documentation

Interactive documentation is available at `/docs` with:

- Getting started guide
- Jobs API reference
- Webhooks guide
- Code examples with package manager tabs

The full OpenAPI reference is at `/api/swagger`.

## WebMCP

hackathon.new exposes role-aware browser tools on event creation, public event, organizer, judge, and mentor pages. Tools appear only when they fit the signed-in role and the event's current state. Read the [WebMCP guide](content/docs/guides/webmcp.mdx) for the user flow and the [implementation notes](webmcp/README.md) for the full tool list, safety rules, evals, and preview checks.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
