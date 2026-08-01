# Hackathon CLI — Command Reference

Complete reference for all `hackathon` CLI commands. Source: `packages/cli/src/`.

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help / banner |
| `--version`, `-v` | Show CLI version |
| `--json` | Output as JSON instead of formatted table |
| `--yes`, `-y` | Skip confirmation prompts |
| `--base-url` | Override API base URL for this command |
| `--api-key` | Override API key for this command |

## Auth

### `hackathon login`

Interactive login flow. Opens browser for Clerk sign-in, auto-creates an API key, and saves config to `~/.hackathon/config.json`.

| Flag | Description |
|------|-------------|
| `--api-key` | Skip browser flow, validate and save this key directly |
| `--base-url` | Target instance URL (saved to config) |
| `--no-browser` | Paste API key manually instead of opening browser |
| `--yes`, `-y` | Overwrite existing config without prompting |

Environment variables `HACKATHON_API_KEY` and `HACKATHON_BASE_URL` override config when set.

### `hackathon logout`

Remove saved credentials (`~/.hackathon/config.json`).

### `hackathon whoami`

Show current auth info: tenant ID, key ID, and scopes.

### `hackathon update`

Check for a newer version of the CLI and update it.

---

## Browse (public, no auth required)

### `hackathon browse hackathons`

Search public hackathons.

### `hackathon browse submissions <slug>`

View submissions for a hackathon by slug.

### `hackathon browse results <slug>`

View published results for a hackathon by slug.

### `hackathon browse org <slug>`

View organization profile by slug.

---

## Hackathons / Events

`events` is an alias for `hackathons` — the two groups are interchangeable.

### `hackathon events list`

List all hackathons for your organization.

### `hackathon events create`

Create a new hackathon. Prompts interactively if flags omitted in TTY.

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Hackathon name |
| `--slug` | Yes | URL-safe identifier (auto-suggested from name in interactive mode) |
| `--description` | No | Short description |
| `--from-url` | No | Import from a supported public event page URL (`luma.com` / `lu.ma`). When used, CLI creates the hackathon from the external event data instead of the scratch flow. |

### `hackathon events get <id-or-slug>`

Get full details for a hackathon. Supports both UUID and slug.

### `hackathon events update <id-or-slug>`

Update hackathon settings.

| Flag | Description |
|------|-------------|
| `--name` | Update name |
| `--slug` | Update slug |
| `--description` | Update description |

At least one flag is required.

### `hackathon events delete <id-or-slug>`

Delete a hackathon. Prompts for confirmation (skip with `--yes`).

### `hackathon events activity <id-or-slug>`

Show recent activity log for the hackathon.

---

## Judging — Criteria

### `hackathon judging criteria list <hackathon-id>`

List all judging criteria.

### `hackathon judging criteria create <hackathon-id>`

Create a criterion. Prompts interactively if flags omitted.

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Criterion name (e.g., "Innovation") |
| `--description` | No | What judges should evaluate |
| `--max-score` | No | Maximum score (default 10, prompted in TTY) |
| `--weight` | No | Weight multiplier (default 1, prompted in TTY) |

### `hackathon judging criteria update <hackathon-id> <criteria-id>`

Update a criterion. Same flags as `create`, all optional.

### `hackathon judging criteria delete <hackathon-id> <criteria-id>`

Delete a criterion. Prompts for confirmation.

---

## Judging — Levels (Rubric Descriptors)

Level descriptors tell judges what each score on a criterion means (e.g. "Baseline", "Solid", "Exceptional"). **Unlike other judging commands, levels use verbose flags rather than positional args.**

### `hackathon judging levels list --hackathon-id <id> --criteria-id <cid>`

List rubric levels for a criterion.

### `hackathon judging levels add`

Add a level to a criterion.

| Flag | Required | Description |
|------|----------|-------------|
| `--hackathon-id` | Yes | Hackathon ID |
| `--criteria-id` | Yes | Criterion ID |
| `--label` | Yes | Short label (e.g. "Solid") |
| `--description` | No | Longer description of what this level means |

### `hackathon judging levels update`

Update a level.

| Flag | Required | Description |
|------|----------|-------------|
| `--hackathon-id` | Yes | Hackathon ID |
| `--criteria-id` | Yes | Criterion ID |
| `--level-id` | Yes | Level ID |
| `--label` | No | New label |
| `--description` | No | New description |

### `hackathon judging levels delete`

Delete a level. Prompts for confirmation.

| Flag | Required | Description |
|------|----------|-------------|
| `--hackathon-id` | Yes | Hackathon ID |
| `--criteria-id` | Yes | Criterion ID |
| `--level-id` | Yes | Level ID |

---

## Judging — Judges

### `hackathon judging judges list <hackathon-id>`

List all judges with assignment and completion counts.

### `hackathon judging judges add <hackathon-id>`

Add a judge. Provide one of:

| Flag | Description |
|------|-------------|
| `--email` | Judge's email (sends invitation if not found on platform) |
| `--user-id` | Clerk user ID (if known) |

### `hackathon judging judges remove <hackathon-id> <participant-id>`

Remove a judge. Prompts for confirmation.

---

## Judging — Invitations

### `hackathon judging invitations list <hackathon-id>`

List pending judge invitations.

### `hackathon judging invitations cancel <hackathon-id> <invitation-id>`

Cancel a pending judge invitation. Prompts for confirmation.

---

## Judging — Assignments

### `hackathon judging auto-assign <hackathon-id>`

Auto-distribute submissions across judges.

| Flag | Required | Description |
|------|----------|-------------|
| `--per-judge` | Yes | Number of submissions per judge |

### `hackathon judging assignments list <hackathon-id>`

List all assignments with progress stats.

### `hackathon judging assignments create <hackathon-id>`

Manually assign a judge to a submission.

| Flag | Required | Description |
|------|----------|-------------|
| `--judge` | Yes | Judge participant ID |
| `--submission` | Yes | Submission ID |

### `hackathon judging assignments delete <hackathon-id> <assignment-id>`

Remove an assignment. Prompts for confirmation.

### `hackathon judging pick-results <hackathon-id>`

View pick-based judging results.

### `hackathon judging track-assign <hackathon-id>`

Assign a judge to a specific track (multi-track hackathons).

| Flag | Required | Description |
|------|----------|-------------|
| `--judge` | Yes | Judge participant ID |
| `--track` | Yes | Prize track ID |

### `hackathon judging track-unassign <hackathon-id>`

Remove a judge's track assignment.

| Flag | Required | Description |
|------|----------|-------------|
| `--judge` | Yes | Judge participant ID |
| `--track` | Yes | Prize track ID |

---

## Prize Tracks

Tracks group prizes together and drive multi-round judging (screening → semi-finals → finalists).

### `hackathon tracks list <hackathon-id>`

List all prize tracks.

### `hackathon tracks get <hackathon-id> <track-id>`

Get track details including rounds.

### `hackathon tracks create <hackathon-id>`

Create a track.

| Flag | Description |
|------|-------------|
| `--name` | Track name |
| `--description` | Track description |

### `hackathon tracks update <hackathon-id> <track-id>`

Update a track. Same flags as `create`, all optional.

### `hackathon tracks delete <hackathon-id> <track-id>`

Delete a track. Prompts for confirmation.

### `hackathon tracks buckets <hackathon-id> <track-id>`

List rounds (buckets) for a track.

### `hackathon tracks update-round <hackathon-id> <track-id> <round-id>`

Update a round's advancement rules.

| Flag | Description |
|------|-------------|
| `--advance-top-n` | Top N submissions advance to next round |
| `--advance-threshold` | Submissions scoring ≥ threshold advance |
| `--name` | Round name |

### `hackathon tracks activate-round <hackathon-id> <track-id> <round-id>`

Make a round the active scoring round.

### `hackathon tracks calculate-results <hackathon-id> <track-id>`

Calculate advancement for the active round.

---

## Prizes

### `hackathon prizes list <hackathon-id>`

List all prizes and their assignments.

### `hackathon prizes create <hackathon-id>`

Create a prize. Prompts for name interactively if omitted.

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Prize name (e.g., "First Place") |
| `--description` | No | Prize description |
| `--type` | No | Prize type |
| `--value` | No | Prize value (e.g., "$5,000") |

### `hackathon prizes update <hackathon-id> <prize-id>`

Update a prize. Same flags as `create`, all optional.

### `hackathon prizes delete <hackathon-id> <prize-id>`

Delete a prize. Prompts for confirmation.

### `hackathon prizes reorder <hackathon-id> <id-1> <id-2> ...`

Reorder prizes by passing prize IDs in desired order.

### `hackathon prizes assign <hackathon-id> <prize-id>`

Assign a prize to a winning submission.

| Flag | Required | Description |
|------|----------|-------------|
| `--submission` | Yes | Submission ID |

### `hackathon prizes unassign <hackathon-id> <prize-id> <submission-id>`

Remove a prize assignment. Prompts for confirmation.

---

## Sponsors

### `hackathon sponsors list <hackathon-id>`

List all sponsors ordered by `displayOrder`.

### `hackathon sponsors add <hackathon-id>`

Add a sponsor.

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Sponsor display name |
| `--tier` | No | Tier (e.g. `gold`, `silver`, `platinum`) |
| `--custom-tier-label` | No | Free-form tier label (overrides `--tier` label in UI) |
| `--website` | No | Sponsor website URL |
| `--logo-url` | No | Existing logo URL (skip for local upload) |
| `--sponsor-tenant-id` | No | Link to a hackathon.new tenant (so the sponsor can self-manage) |
| `--use-org-assets` | No | Copy org logo/description instead of requiring upload |

### `hackathon sponsors update <hackathon-id> <sponsor-id>`

Update sponsor fields. Same flags as `add`, all optional.

### `hackathon sponsors remove <hackathon-id> <sponsor-id>`

Remove a sponsor. Prompts for confirmation.

### `hackathon sponsors reorder <hackathon-id> <id-1> <id-2> ...`

Reorder sponsors by passing sponsor IDs in desired order.

---

## Sponsor Perks

Perks are credits, API keys, coupons, or custom offers released to participants.

### `hackathon perks list <hackathon-id>`

List all perks.

### `hackathon perks create <hackathon-id>`

Create a perk.

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Perk name |
| `--description` | No | Perk description |
| `--type` | No | `api_key`, `credit`, `coupon`, or `other` |
| `--sponsor` | No | Sponsor ID (links the perk to a sponsor) |
| `--code` | No | Static redemption code |
| `--redemption-url` | No | URL participants visit to claim |
| `--instructions` | No | Redemption instructions |
| `--scheduled-release-at` | No | ISO 8601 timestamp to auto-release |

### `hackathon perks update <hackathon-id> <perk-id>`

Update a perk. Same flags as `create`, all optional.

### `hackathon perks delete <hackathon-id> <perk-id>`

Delete a perk. Prompts for confirmation.

### `hackathon perks release <hackathon-id> <perk-id>`

Release a perk now — makes it visible to participants.

---

## Teams

### `hackathon teams list <hackathon-id>`

List all teams with members and room assignments.

### `hackathon teams create <hackathon-id>`

Create a team.

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Team name |
| `--captain-email` | Yes | Email of the team captain (invites if not on platform) |

### `hackathon teams update <hackathon-id> <team-id>`

Update a team.

| Flag | Description |
|------|-------------|
| `--name` | Team name |
| `--mode` | `in_person`, `virtual`, or `none` (clears the mode) |

### `hackathon teams update-members <hackathon-id> <team-id>`

Add or remove members by email.

| Flag | Description |
|------|-------------|
| `--add` | Comma-separated emails to add |
| `--remove` | Comma-separated emails to remove |

### `hackathon teams delete <hackathon-id> <team-id>`

Delete a team. Prompts for confirmation.

### `hackathon teams assign-room <hackathon-id>`

Assign a team to a room.

| Flag | Required | Description |
|------|----------|-------------|
| `--team` | Yes | Team ID |
| `--room` | Yes | Room ID |

### `hackathon teams unassign-room <hackathon-id> <room-id> <team-id>`

Remove a team from a room. Prompts for confirmation.

---

## Announcements

### `hackathon announcements list <hackathon-id>`

List all announcements (published, scheduled, and drafts).

### `hackathon announcements create <hackathon-id>`

Create an announcement.

| Flag | Required | Description |
|------|----------|-------------|
| `--title` | Yes | Announcement title |
| `--body` | Yes | Announcement body |
| `--priority` | No | `normal` or `urgent` |
| `--audience` | No | Target audience (`all`, `teams`, `judges`) |

### `hackathon announcements update <hackathon-id> <announcement-id>`

Update an announcement. Same flags as `create`, all optional.

### `hackathon announcements delete <hackathon-id> <announcement-id>`

Delete an announcement. Prompts for confirmation.

### `hackathon announcements publish <hackathon-id> <announcement-id>`

Publish (send) immediately.

### `hackathon announcements schedule <hackathon-id> <announcement-id>`

Schedule for later delivery.

| Flag | Required | Description |
|------|----------|-------------|
| `--at` | Yes | ISO 8601 timestamp |

---

## Challenges

Sponsor or theme-based prompts. Released on the event timeline.

### `hackathon challenges list <hackathon-id>`

List all challenges.

### `hackathon challenges create <hackathon-id>`

Create a challenge.

| Flag | Required | Description |
|------|----------|-------------|
| `--title` | Yes | Challenge title |
| `--description` | No | Challenge prompt / description |

### `hackathon challenges update <hackathon-id> <challenge-id>`

Update a challenge. Same flags as `create`, all optional.

### `hackathon challenges delete <hackathon-id> <challenge-id>`

Delete a challenge. Prompts for confirmation.

### `hackathon challenges reorder <hackathon-id> <id-1> <id-2> ...`

Reorder challenges by passing IDs in desired order.

---

## Event Schedule

Event-scoped timeline items (kickoff, lunch, demos). **Different from** `hackathon schedules` which manages **org-level cron jobs**.

### `hackathon schedule list <hackathon-id>`

List all schedule items.

### `hackathon schedule add <hackathon-id>`

Add a schedule item. If `--starts-at` is omitted in TTY, the CLI defaults to the next 15-minute slot after the last item (or 9:00 AM tomorrow if no items exist), with a 30-minute duration.

| Flag | Required | Description |
|------|----------|-------------|
| `--title` | Yes | Item title |
| `--starts-at` | No | ISO 8601 start timestamp |
| `--ends-at` | No | ISO 8601 end timestamp |
| `--description` | No | Longer description |
| `--location` | No | Location (room name, URL) |
| `--trigger-type` | No | `challenge_release` or `submission_deadline` to tie the item to a programmatic event |

### `hackathon schedule update <hackathon-id> <item-id>`

Update a schedule item. Same flags as `add`, all optional.

### `hackathon schedule delete <hackathon-id> <item-id>`

Delete a schedule item. Prompts for confirmation. Items with a trigger-type are protected — remove the trigger first.

---

## Judge Display

### `hackathon judge-display list <hackathon-id>`

List judge display profiles.

### `hackathon judge-display create <hackathon-id>`

Create a judge display profile.

### `hackathon judge-display update <hackathon-id> <display-id>`

Update a judge display profile.

### `hackathon judge-display delete <hackathon-id> <display-id>`

Delete a judge display profile. Prompts for confirmation.

### `hackathon judge-display reorder <hackathon-id> <id-1> <id-2> ...`

Reorder judge display profiles.

---

## Results

### `hackathon results calculate <hackathon-id>`

Calculate rankings from submitted scores.

### `hackathon results get <hackathon-id>`

View detailed results with scores (organizer view).

### `hackathon results publish <hackathon-id>`

Make results public. Transitions hackathon to `completed` status. Prompts for confirmation.

### `hackathon results unpublish <hackathon-id>`

Hide results from public view. Prompts for confirmation.

---

## Webhooks

### `hackathon webhooks list`

List all webhooks.

### `hackathon webhooks create`

| Flag | Required | Description |
|------|----------|-------------|
| `--url` | Yes | Webhook endpoint URL |
| `--events` | Yes | Comma-separated event list |

Available events: `hackathon.created`, `hackathon.updated`, `submission.submitted`, `submission.updated`, `results.published`, `participant.registered`

### `hackathon webhooks delete <id>`

Delete a webhook. Prompts for confirmation.

---

## Jobs

### `hackathon jobs list`

List jobs. Supports filtering via additional flags.

### `hackathon jobs get <id>`

Get job details and status.

### `hackathon jobs create`

Create a job (supports idempotency).

### `hackathon jobs result <id>`

Get job result. Returns 202 if still running.

### `hackathon jobs cancel <id>`

Cancel a running job. Prompts for confirmation.

---

## Org Schedules (cron jobs)

Different from event `schedule` — these are **org-level cron jobs** (e.g., daily digests).

### `hackathon schedules list`

List all org schedules.

### `hackathon schedules create`

Create a cron schedule.

### `hackathon schedules get <id>`

Get schedule details.

### `hackathon schedules update <id>`

Update a schedule.

### `hackathon schedules delete <id>`

Delete a schedule. Prompts for confirmation.
