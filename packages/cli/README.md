# @agi-ventures-canada/hackathon-cli

Run hackathons from your terminal. This is the command-line companion to [hackathon.new](https://hackathon.new) — create events, manage teams, configure judging, pick winners, send announcements, and more.

## Install

```bash
npm install -g @agi-ventures-canada/hackathon-cli
# or run once without installing
npx @agi-ventures-canada/hackathon-cli --help
```

Requires Node.js 20.9+.

## Quick start

```bash
hackathon login
# Opens your browser, signs you in, creates an API key, saves it locally.

hackathon events list
hackathon events create           # interactive prompts
hackathon events create --test-stage judging --yes  # private event with fake test data
hackathon events tasks list <event-slug> --state pending
hackathon prizes create <hackathon-id> --name "Best AI App"
hackathon announcements create <hackathon-id> --title "Kickoff in 1 hour" --body "See you soon"
```

The API key is stored at `~/.hackathon/config.json` — log in once, use it from anywhere.

### Which workspace does the CLI use?

The CLI uses the workspace that is active in your browser when you run `hackathon login`.
If your personal workspace is active, new events are created there. To create events for an organization, switch to that organization in hackathon.new, then run `hackathon login` again.

Check the saved workspace before creating anything:

```bash
hackathon whoami
```

### Pointing at a different environment

```bash
hackathon login --base-url https://staging.hackathon.new
hackathon login --base-url http://localhost:3000
hackathon login                              # default: production (hackathon.new)
```

The base URL is saved with the key, so commands work against whatever environment you logged in to.

## Commands

Run `hackathon --help` for the full list. Highlights:

| Group | What it does |
|-------|--------------|
| `events` (alias: `hackathons`) | Create and manage events, including the organizer task board. Import from Luma with `--from-url`. |
| `judging` | Set up prizes, scorecards, dates, invitations, balanced reviews, and optional rounds |
| `tracks` | Prize tracks, round buckets, advancement rules |
| `prizes` | Create and assign prizes |
| `perks` | Sponsor credits, API keys, coupons — create, update, release |
| `sponsors` | Add sponsors, update tiers, reorder, remove |
| `teams` | List teams, create, update members, assign rooms |
| `announcements` | Publish immediately or schedule for later |
| `challenges` | Create sponsor or theme-based prompts |
| `schedule` | Event-scoped schedule items (kickoff, workshops, demos) |
| `results` | Calculate winners once judging closes |
| `webhooks` | Subscribe to event, team, and submission updates |
| `jobs` | Run, inspect, and cancel async jobs |
| `schedules` | Org-level cron jobs (different from event schedule) |
| `browse` | Discover public hackathons |

Most commands take a hackathon ID as the first positional arg:

```bash
hackathon prizes list <hackathon-id>
hackathon teams list <hackathon-id>
hackathon announcements publish <hackathon-id> <announcement-id>
```

Add `--json` to any command for machine-readable output.

### Judging

```bash
hackathon judging setup inspect <event>
hackathon judging setup configure <event> --starter
hackathon judging invitations batch <event> --emails "judge@example.com"
hackathon judging invitations batch <event> --emails "judge@example.com" --send
hackathon judging assignments preview <event> --reviews-per-project 3 --json
hackathon judging assignments apply <event> --reviews-per-project 3 --expected-version <version> --request-key <request-key>
hackathon judging scorecards list <event>
hackathon judging judges scope <event> <judge> --prizes <prize-id,...> --rooms all
hackathon judging rounds list <event>
```

The starter creates a Best overall prize with four equal 0–10 categories. Set a separate judging window with `setup configure --opens-at <time-with-offset> --closes-at <time-with-offset> --timezone <zone>`. Preview invitations and project assignments before applying them. Reuse a request key when retrying the same change. Queued invitations have not been sent.

For advanced methods, use `scorecards update <event> <prize> --file scorecard.json`; preserve existing category IDs. Submitted reviews lock their scoring rules. Legacy `auto-assign --per-judge` retains its per-prize cap. Retired `judging levels` aliases explain the supported scorecard path without calling a missing API.

### Organizer tasks

List every task page, then use the shown task ref to update one task:

```bash
hackathon events tasks list <event-slug> --state pending --offset 0 --limit 20
hackathon events tasks add <event-slug> --label "Order lunch" --task-ref custom-order-lunch
hackathon events tasks complete <event-slug> custom-order-lunch
hackathon events tasks reopen <event-slug> custom-order-lunch
hackathon events tasks dismiss <event-slug> verify-automated-times
hackathon events tasks remove <event-slug> custom-order-lunch
```

Keep and reuse the same `custom-` task ref when you retry an add. This keeps retries from making extra tasks. Add `--expected-updated-at <ISO time>` to a change when you need to stop stale updates. Every task command supports `--json`.

## AI agents

Prefer driving the CLI through Claude Code, Cursor, or another AI agent? Install our public skills:

```bash
npx skills add AGI-Ventures-Canada/hackathon.new
```

That gives your agent two relevant skills: `hackathon-cli` (this package) and `hackathon-api` (direct HTTP calls).

## Links

- Platform: https://hackathon.new
- Docs: https://hackathon.new/docs
- Source: https://github.com/AGI-Ventures-Canada/hackathon.new (CLI lives in `packages/cli/`)
- Skills: https://github.com/AGI-Ventures-Canada/hackathon.new/tree/main/skills
- Issues: https://github.com/AGI-Ventures-Canada/hackathon.new/issues

## License

MIT
