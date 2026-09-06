---
name: hackathon-cli
description: Use the hackathon CLI tool to manage hackathons from the terminal. Use when the user asks to create hackathons, add judges, manage prizes, prize tracks, sponsors, teams, announcements, challenges, schedule items, release perks, assign teams to rooms, import from Luma, broadcast messages, or publish results using the `hackathon` command-line tool — including phrasings like "make a hackathon on Sunday", "set up judging", "add a sponsor", or any hackathon management task in the terminal.
allowed-tools: Read Bash(hackathon:*) Bash(bun:*) Bash(npm:*) Bash(npx:*)
metadata:
  model: sonnet
---

# Hackathon CLI — hackathon.new Command-Line Tool

Manage hackathon.new from the terminal using the `hackathon` CLI (`@agi-ventures-canada/hackathon-cli`). This skill guides AI agents through using the CLI to create hackathons, manage judges and judging rounds, configure prize tracks, add sponsors and perks, invite teams, broadcast announcements, schedule the event, and publish results.

**For direct REST API access (curl commands, debugging endpoints), use the `hackathon-api` skill instead.**

## Reference Files

- `references/commands.md` — Complete CLI command reference with all flags and options
- `references/workflow-examples.md` — Natural language to CLI command mappings and end-to-end examples

## When to Activate

- User asks to create, update, or manage a hackathon using the CLI or terminal
- User asks to add/remove judges, sponsors, participants, or prizes
- User asks to configure judging criteria, rubric levels, rounds, or prize tracks
- User asks to invite attendees or assign teams to rooms
- User asks to broadcast or schedule an announcement
- User asks to create challenges or add schedule items
- User asks to release a sponsor perk
- User asks to import a hackathon from a Luma event URL
- User asks to calculate or publish results
- User gives natural language commands like "make me a hackathon on Sunday from 7am to 9pm"
- User mentions "hackathon.new" in the context of hackathon management

## When NOT to Activate

- User wants to make direct REST API calls or curl commands (use `hackathon-api`)
- User is working on the hackathon.new codebase itself (editing source code, running tests)
- User is asking about general hackathon concepts (use `hackathon-organizer` or `hackathon-attendee`)
- User is working with the hackathon.new web dashboard UI directly

## Installation

### Install the CLI

```bash
npm install -g @agi-ventures-canada/hackathon-cli
# or
npx @agi-ventures-canada/hackathon-cli
```

Verify installation:

```bash
hackathon --version
```

### For local development (from the repo)

```bash
bun cli <args>           # Runs TypeScript source directly via Bun
```

### Login & Authentication

```bash
# Browser-based login (opens browser, creates API key automatically)
hackathon login

# Login against a local dev instance
hackathon login --base-url http://localhost:3000

# Or provide an API key directly
hackathon login --api-key sk_live_your_key_here

# Or set via environment variable
export HACKATHON_API_KEY=sk_live_your_key_here
export HACKATHON_BASE_URL=http://localhost:3000  # optional
```

Verify your setup:

```bash
hackathon whoami
```

Config is saved to `~/.hackathon/config.json`. The `--base-url` is remembered after login.

```bash
hackathon logout  # Remove saved credentials
```

## Command Structure

The CLI uses **positional arguments** for resource IDs, not `--hackathon` flags:

```
hackathon <resource> <action> <id> [sub-id] [--flags]
```

All commands support `--json` for machine-readable output and `--yes`/`-y` to skip confirmation prompts.

When required flags are omitted in a terminal (TTY), the CLI prompts interactively via `@clack/prompts`.

`events` is an alias for `hackathons` — `hackathon events list` and `hackathon hackathons list` behave identically.

The retired `judging levels` aliases return guidance without calling their unavailable API. Inspect supported settings with `judging scorecards list`.

## Core Commands

### Public Browsing (no auth required)

```bash
hackathon browse hackathons                # Search public hackathons
hackathon browse submissions <slug>        # View submissions for a hackathon
hackathon browse results <slug>            # View published results
hackathon browse org <slug>                # View organization profile
```

### Hackathon Management

```bash
hackathon events list
hackathon events create --name "Sunday AI Hackathon" --slug "sunday-ai-hackathon"
hackathon events get <id-or-slug>
hackathon events update <id-or-slug> --name "Updated Name"
hackathon events delete <id-or-slug>
hackathon events activity <id-or-slug>     # Recent activity timeline

# Import from Luma / lu.ma
hackathon events create --from-url https://lu.ma/abcd1234
```

### Judging — Judges

```bash
hackathon judging judges list <hackathon-id>
hackathon judging judges add <hackathon-id> --email judge@example.com
hackathon judging judges add <hackathon-id> --user-id user_abc123
hackathon judging judges remove <hackathon-id> <participant-id>
hackathon judging invitations list <hackathon-id>
hackathon judging invitations cancel <hackathon-id> <invitation-id>
```

### Judging — Setup and Scorecards

```bash
hackathon judging setup inspect <event> --json
hackathon judging setup configure <event> --starter --prize-name "Best overall"
hackathon judging setup configure <event> --opens-at 2026-09-12T09:00:00-04:00 --closes-at 2026-09-12T17:00:00-04:00 --timezone America/Toronto --reviews-per-project 3 --reminders on
hackathon judging scorecards list <event>
hackathon judging scorecards update <event> <prize-id> --file scorecard.json
hackathon judging criteria create <event> --name "Innovation" --min-score 0 --max-score 10 --weight 25
hackathon judging criteria update <event> <criteria-id> --weight 30
hackathon judging criteria delete <event> <criteria-id>
```

Use the starter only when the user wants the default prize and scorecard. It creates four equal 0–10 categories: Innovation, Technical execution, Design and UX, Impact. Inspect existing settings first. Keep category IDs when editing a scorecard. Supported styles are `weighted_score`, `gate_check`, `bucket_sort`, `judges_pick`, and `crowd_vote`. After a submitted review, changing scoring rules requires a new round; prize metadata remains editable.

### Judging — Invitations and Project Reviews

```bash
hackathon judging invitations batch <event> --emails "alice@example.com,bob@example.com"
hackathon judging invitations batch <event> --emails "alice@example.com,bob@example.com" --send --request-key <key>
hackathon judging invitations remind <event> --emails "alice@example.com"
hackathon judging assignments preview <event> --reviews-per-project 3 --json
hackathon judging assignments apply <event> --reviews-per-project 3 --expected-version <preview-version> --request-key <key>
hackathon judging assignments list <event>
hackathon judging assignments create <event> --judge <judge-id> --submission <project-id>
hackathon judging assignments create <event> --judge <judge-id> --submission <project-id> --prize <gate-or-bucket-prize>
hackathon judging judges scope <event> <judge-id> --prizes <prize-id,...> --rooms all
hackathon judging assignments delete <event> <assignment-id>
hackathon judging pick-results <event>
```

Batch invitations and reminders preview by default; `--send` applies them. Optional `--prizes` and `--rooms` limit a judge's scope. Read each result's outcome and delivery; draft events queue email. Assignment targets are reviews per project for each prize. Preserve the target and version when applying a preview. Reuse request keys for retries. Completed reviews cannot be removed.

Use `judges scope` without change flags to inspect current scope and its version. `--prizes all` allows all prizes; `--rooms all` clears room limits. A judge's submitted reviews lock their prizes and rooms.

### Judging — Optional Rounds

```bash
hackathon judging rounds list <event>
hackathon judging rounds preset <event> --preset shortlist --data '{"advanceTopN":5}'
hackathon judging rounds create <event> --name "Finals"
hackathon judging rounds update <event> <round-id> --file round.json
hackathon judging rounds activate <event> <round-id>
hackathon judging rounds complete <event> <round-id>
hackathon judging rounds candidates <event> <round-id>
hackathon judging rounds advance <event> <round-id> --file advancement.json
```

Round dates override the event judging window. Legacy `auto-assign --per-judge 5` keeps its per-prize cap. Existing track commands remain available for older events; new setup does not require tracks or rounds.

### Prize Tracks (rounds + advancement)

Tracks group prizes together and drive multi-round judging (screening → semi-finals → finalists).

```bash
hackathon tracks list <hackathon-id>
hackathon tracks get <hackathon-id> <track-id>
hackathon tracks create <hackathon-id> --name "Grand Prize"
hackathon tracks update <hackathon-id> <track-id> --name "Sponsor Award"
hackathon tracks delete <hackathon-id> <track-id>

# Rounds ("buckets") within a track
hackathon tracks buckets <hackathon-id> <track-id>
hackathon tracks update-round <hackathon-id> <track-id> <round-id> --advance-top-n 5
hackathon tracks activate-round <hackathon-id> <track-id> <round-id>
hackathon tracks calculate-results <hackathon-id> <track-id>
```

### Prizes

```bash
hackathon prizes list <hackathon-id>
hackathon prizes create <hackathon-id> --name "First Place" --value "$5,000"
hackathon prizes update <hackathon-id> <prize-id> --name "Grand Prize"
hackathon prizes delete <hackathon-id> <prize-id>
hackathon prizes reorder <hackathon-id> <id-1> <id-2> ...
hackathon prizes assign <hackathon-id> <prize-id> --submission <submission-id>
hackathon prizes unassign <hackathon-id> <prize-id> <submission-id>
```

### Sponsors

```bash
hackathon sponsors list <hackathon-id>
hackathon sponsors add <hackathon-id> --name "Acme Corp" --tier gold --website "https://acme.com"
hackathon sponsors update <hackathon-id> <sponsor-id> --tier platinum
hackathon sponsors remove <hackathon-id> <sponsor-id>
hackathon sponsors reorder <hackathon-id> <id-1> <id-2> ...
```

### Sponsor Perks

```bash
hackathon perks list <hackathon-id>
hackathon perks create <hackathon-id> --name "OpenAI Credits" --type credit --sponsor <sponsor-id>
hackathon perks update <hackathon-id> <perk-id> --instructions "New redemption steps"
hackathon perks delete <hackathon-id> <perk-id>
hackathon perks release <hackathon-id> <perk-id>    # Make visible to participants now
```

### Teams

```bash
hackathon teams list <hackathon-id>
hackathon teams create <hackathon-id> --name "Team Rocket" --captain-email captain@example.com
hackathon teams update-members <hackathon-id> <team-id> --add alice@co.com,bob@co.com --remove carol@co.com
hackathon teams update <hackathon-id> <team-id> --name "New Name" --mode in_person
hackathon teams delete <hackathon-id> <team-id>

# Room assignment (for hybrid / in-person events)
hackathon teams assign-room <hackathon-id> --team <team-id> --room <room-id>
hackathon teams unassign-room <hackathon-id> <room-id> <team-id>
```

### Announcements

```bash
hackathon announcements list <hackathon-id>
hackathon announcements create <hackathon-id> --title "Kickoff!" --body "See you at 9am" --priority normal
hackathon announcements update <hackathon-id> <announcement-id> --body "Updated copy"
hackathon announcements delete <hackathon-id> <announcement-id>
hackathon announcements publish <hackathon-id> <announcement-id>                      # Send now
hackathon announcements schedule <hackathon-id> <announcement-id> --at 2026-05-01T09:00:00Z
```

### Challenges

Sponsor prompts or themes attendees can build against.

```bash
hackathon challenges list <hackathon-id>
hackathon challenges create <hackathon-id> --title "Build with voice AI" --description "..."
hackathon challenges update <hackathon-id> <challenge-id> --title "New title"
hackathon challenges delete <hackathon-id> <challenge-id>
hackathon challenges reorder <hackathon-id> <id-1> <id-2> ...
```

### Event Schedule

Event-scoped timeline items (kickoff, workshops, lunch, demos). **Different from** `hackathon schedules` which manages **org-level cron jobs**.

```bash
hackathon schedule list <hackathon-id>
hackathon schedule add <hackathon-id> --title "Opening Keynote" --starts-at 2026-05-01T09:00:00Z --ends-at 2026-05-01T09:30:00Z
hackathon schedule update <hackathon-id> <item-id> --title "New title"
hackathon schedule delete <hackathon-id> <item-id>
```

### Judge Display

```bash
hackathon judge-display list <hackathon-id>
hackathon judge-display create <hackathon-id> --name "Judge Panel"
hackathon judge-display update <hackathon-id> <display-id>
hackathon judge-display delete <hackathon-id> <display-id>
hackathon judge-display reorder <hackathon-id> <id-1> <id-2> ...
```

### Results

```bash
hackathon results calculate <hackathon-id>
hackathon results get <hackathon-id>
hackathon results publish <hackathon-id>
hackathon results unpublish <hackathon-id>
```

### Webhooks

```bash
hackathon webhooks list
hackathon webhooks create --url "https://your-endpoint.com/hook" --events "submission.submitted,participant.registered"
hackathon webhooks delete <webhook-id>
```

### Jobs

```bash
hackathon jobs list
hackathon jobs get <job-id>
hackathon jobs create --type <job-type>
hackathon jobs result <job-id>
hackathon jobs cancel <job-id>
```

### Org-level Schedules (cron jobs)

```bash
hackathon schedules list
hackathon schedules create --name "Daily sync"
hackathon schedules get <schedule-id>
hackathon schedules update <schedule-id>
hackathon schedules delete <schedule-id>
```

## Global Options

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON instead of formatted table |
| `--yes`, `-y` | Skip confirmation prompts |
| `--base-url` | Override API base URL for this command |
| `--api-key` | Override API key for this command |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

## Finding the Current Hackathon

When a user says "my current hackathon" or "my hackathon":

```bash
hackathon events list
```

Look for the hackathon with `active` or `published` status. If ambiguous, ask which one they mean.

The CLI supports **slug resolution** — most commands that take a hackathon ID also accept a slug (e.g., `hackathon events get my-hackathon-slug`).

## Date Handling

When users say things like "make me a hackathon on Sunday from 7am to 9pm":

1. **Parse the dates** — convert natural language to ISO 8601 timestamps
2. Use the user's timezone if known, otherwise ask
3. Create the hackathon first, then update dates via the dashboard or API (the CLI `create` command focuses on name/slug/description)
4. Default status is `draft` — remind the user to publish when ready

For schedule items and announcements, pass ISO 8601 timestamps (`2026-05-01T09:00:00Z`) to `--starts-at`, `--ends-at`, and `--at`.

## Error Handling

Common errors:
- **"Not authenticated"** — run `hackathon login` or set `HACKATHON_API_KEY` env var
- **"Insufficient permissions"** — API key lacks required scope, create a new key with proper permissions
- **"Not found"** — verify the hackathon/resource ID exists with a list command
- **"Conflict"** — duplicate resource (slug already taken, already registered, etc.)

## Tips for AI Agents

1. **Always store IDs** — capture returned `id` values for use in subsequent commands
2. **Use `--json` flag** — parse output programmatically with `--json` for reliable ID extraction
3. **Check before creating** — list existing resources before creating duplicates
4. **Confirm destructive actions** — ask the user before deleting or publishing
5. **Judging setup** — inspect first; save a starter prize and scorecard when requested, then preview invitations and project assignments. Add rounds only when needed.
6. **Default to draft** — create hackathons in draft status, let the user decide when to publish
7. **Use `--yes`** — pass `-y` to skip interactive confirmations when running non-interactively
8. **Prefer Luma import** — if the user has a Luma event page, use `--from-url` instead of recreating the details manually
9. **Schedule announcements** — for a pre-planned event, create announcements once and use `announcements schedule --at <iso>` rather than sending manually on the day

## Full Reference

For the complete command reference, see `references/commands.md`.

For end-to-end workflow examples, see `references/workflow-examples.md`.
