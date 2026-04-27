---
name: hackathon-api
description: Interact with the Oatmeal hackathon platform directly via its REST API using curl commands. Use when the user asks to make direct API calls, test endpoints, debug API responses, call the Oatmeal API programmatically, import from Luma via URL, configure prize tracks or judging rounds, send announcements, release sponsor perks, or run a hybrid hackathon — including phrasings like "curl the hackathon API", "test api", or when the user mentions `oatmeal` in a hackathon-management context.
allowed-tools: Read Bash(curl:*) Bash(jq:*) Bash(export:*)
metadata:
  model: sonnet
---

# Hackathon API — Direct REST API Access

Interact with the Oatmeal hackathon platform directly via its REST API using `curl` commands. Use this skill when you need raw API access, are debugging endpoints, testing integrations, or building custom scripts against the Oatmeal API.

**For CLI usage, use the `hackathon-cli` skill instead.** This skill is for direct HTTP/REST API interaction.

## Reference Files

- `references/api-endpoints.md` — Complete API endpoint catalog organized by category with request/response shapes
- `references/workflow-examples.md` — Natural language to API call mappings, common workflows, and end-to-end examples

## When to Activate

- User asks to create, update, or manage a hackathon
- User asks to add/remove judges, sponsors, teams, or prizes
- User asks to configure judging criteria, rounds, or prize tracks
- User asks to calculate or publish results
- User asks to register for a hackathon or manage submissions
- User asks to send/schedule announcements or email blasts
- User asks to release sponsor perks or sponsor credits
- User asks to import a hackathon from a Luma or external event URL
- User asks to set up webhooks, integrations, or scheduled jobs
- User mentions "oatmeal" in the context of hackathon management
- User gives natural language commands like "make me a hackathon on Sunday from 7am to 9pm"

## When NOT to Activate

- User is working on the Oatmeal codebase itself (editing source code, running tests, etc.)
- User is asking about general hackathon concepts unrelated to the platform
- User is working with the Oatmeal web dashboard UI directly

## Prerequisites

Before making API calls, the user needs:

1. **A running Oatmeal instance** — either local (`http://localhost:3000`) or production (`https://getoatmeal.com`)
2. **An API key** — obtained from the dashboard at `/hackathons` > Settings > API Keys
3. **An organization** — the user must belong to a Clerk organization

### Step 1: Verify the Instance

```bash
curl -s "http://localhost:3000/api/public/health" | jq .
```

Expected: `{"status":"ok","timestamp":"..."}`

If this fails, the Oatmeal server is not running. The user needs to start it with `bun dev` (if local) or provide their production URL.

### Step 2: Set Up Authentication

Store the API key and base URL as environment variables for all subsequent calls:

```bash
export HACKATHON_BASE_URL="http://localhost:3000"
export HACKATHON_API_KEY="sk_live_your_api_key_here"
```

Test authentication:

```bash
curl -s -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/v1/whoami" | jq .
```

If the user doesn't have an API key yet, they need to create one from the web dashboard (Settings > API Keys). API key creation requires a browser session and cannot be done via API.

### Step 3: Verify Organization

```bash
curl -s -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/me" | jq .
```

## Route Namespace Guide

| Namespace | Auth | Use For |
|-----------|------|---------|
| `/api/public/*` | None (some need Clerk session) | Browsing, registration, attendee pages |
| `/api/dashboard/*` | API key OR Clerk session | All management operations — **use this for agents** |
| `/api/v1/*` | API key only | Jobs, webhooks (deliberately narrow) |

**Rule of thumb for agents:** Use `/api/dashboard/*` with a `Bearer sk_live_...` API key for every resource operation (create / list / update / delete). The `/api/v1/*` surface exists for stable integration primitives (jobs + webhooks + activity logs) and is not a replay of the dashboard API.

## Core Workflows

### Create a Hackathon

When users say things like "make me a hackathon on Sunday from 7am to 9pm":

1. **Parse the dates** — convert natural language to ISO 8601 timestamps
2. **Create the hackathon** — `POST /api/dashboard/hackathons`
3. **Configure settings** — `PATCH /api/dashboard/hackathons/:id/settings`

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons" \
  -d '{
    "name": "Sunday AI Hackathon",
    "slug": "sunday-ai-hackathon",
    "description": "A one-day AI hackathon",
    "startsAt": "2026-03-15T07:00:00Z",
    "endsAt": "2026-03-15T21:00:00Z",
    "registrationOpensAt": "2026-03-08T00:00:00Z",
    "registrationClosesAt": "2026-03-15T06:00:00Z"
  }' | jq .
```

### Import from Luma (or any event URL)

When users paste a Luma or event URL:

```bash
# One-step create: fetch + create
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/import/url" \
  -d '{"url": "https://lu.ma/abcd1234"}' | jq .

# Or: preview first, edit, then create
PREVIEW=$(curl -s -X POST -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/public/import/url" \
  -d '{"url": "https://lu.ma/abcd1234"}' | jq .)

# User reviews $PREVIEW, then POSTs to /dashboard/import/event with edits
```

### Update Hackathon Settings

```bash
curl -s -X PATCH -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/settings" \
  -d '{"status": "published", "name": "Updated Name"}' | jq .
```

Valid statuses: `draft`, `published`, `registration_open`, `active`, `judging`, `completed`, `archived`

### Add a Judge

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/judging/judges" \
  -d '{"email": "judge@example.com"}' | jq .
```

### Create a Prize (embedded criteria/buckets)

Every prize is a self-contained judging unit with its own style and criteria/buckets:

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/prizes" \
  -d '{
    "name": "Best Overall",
    "value": "$5,000",
    "judgingStyle": "bucket_sort",
    "buckets": [
      {"level": 1, "label": "Not a fit"},
      {"level": 2, "label": "Solid"},
      {"level": 3, "label": "Excellent"}
    ]
  }' | jq .
```

### Multi-Round Judging with Prize Tracks

Prize tracks group prizes and share rounds (e.g. "Grand Prize" with screening → finals):

```bash
# Create the track
TRACK=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/prize-tracks" \
  -d '{"name": "Grand Prize", "intent": "overall_winner", "style": "bucket_sort"}' | jq .)

TRACK_ID=$(echo $TRACK | jq -r '.id')

# Add a Finals round to the track (the initial round was auto-created)
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/prize-tracks/$TRACK_ID/rounds" \
  -d '{"name": "Finals", "style": "subjective"}' | jq .

# Once screening closes, calculate and activate the next round
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/prize-tracks/$TRACK_ID/rounds/$ROUND_ID/calculate-results" | jq .

curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/prize-tracks/$TRACK_ID/rounds/$FINALS_ROUND_ID/activate" | jq .
```

### Broadcast Announcements

```bash
# Create draft
ANN_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/announcements" \
  -d '{
    "title": "Kickoff in 15 minutes",
    "body": "Join us in the main room at 9 AM sharp.",
    "priority": "normal",
    "audience": "all"
  }' | jq -r '.id')

# Publish now
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/announcements/$ANN_ID/publish" | jq .

# OR schedule for later
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/announcements/$ANN_ID/schedule" \
  -d '{"publishAt": "2026-05-01T09:00:00Z"}' | jq .
```

### Sponsor Perks

```bash
# Add sponsor
SPONSOR_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/sponsors" \
  -d '{"name": "Acme Corp", "tier": "gold", "websiteUrl": "https://acme.com"}' | jq -r '.id')

# Create a perk linked to the sponsor
PERK_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/perks" \
  -d "{
    \"name\": \"Acme Cloud Credits\",
    \"type\": \"credit\",
    \"sponsorId\": \"$SPONSOR_ID\",
    \"code\": \"ACME500\",
    \"redemptionUrl\": \"https://acme.com/redeem\"
  }" | jq -r '.id')

# Release it to attendees
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/perks/$PERK_ID/release" | jq .
```

### Teams & Rooms (Hybrid Event)

```bash
# Create team
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/teams" \
  -d '{"name": "Team Rocket", "captainEmail": "ash@example.com", "mode": "in_person"}' | jq .

# Add members
curl -s -X PATCH -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/teams/{TEAM_ID}/members" \
  -d '{"addEmails": ["bob@co.com", "carol@co.com"]}' | jq .

# Assign to room
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/rooms/{ROOM_ID}/teams" \
  -d '{"teamId": "{TEAM_ID}"}' | jq .
```

### Calculate and Publish Results

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/results/calculate" | jq .

curl -s -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/results" | jq .

curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/{HACKATHON_ID}/results/publish" | jq .
```

## Finding the Current Hackathon

When a user says "my current hackathon" or "my hackathon", list their hackathons and pick the most recent active one:

```bash
curl -s -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons" | jq .
```

Look for the hackathon with the most recent `startsAt` date or `active`/`published` status. If ambiguous, ask the user which one they mean.

## API Key Scopes

API keys have scoped permissions. Common scopes needed:

| Scope | Operations |
|-------|-----------|
| `hackathons:read` | List/get hackathons, teams, judges, prizes, tracks, rounds, results, announcements, perks, sponsors, challenges, schedule |
| `hackathons:write` | Create/update/delete any of the above; publish/schedule announcements; release perks; advance rounds; assign judges |
| `webhooks:read` | List webhooks |
| `webhooks:write` | Create/delete webhooks |
| `schedules:read` | List schedules |
| `schedules:write` | Create/update/delete schedules |
| `org:read` | Read organization profile |
| `org:write` | Update organization profile |

For full management, ensure the API key has both `hackathons:read` and `hackathons:write` scopes.

## Error Handling

All API errors return JSON with a consistent shape:

```json
{"code": "error_code", "message": "Human-readable message"}
```

Common errors:
- `401` — Missing or invalid API key. Check `$HACKATHON_API_KEY` is set correctly.
- `403` — API key lacks required scope. User needs to create a new key with proper permissions.
- `404` — Resource not found. Verify the hackathon ID exists.
- `409` — Conflict (e.g., duplicate registration, slug already taken, round already active).
- `422` — Validation error. Check the request body matches the expected schema.

## Hackathon Lifecycle

```
draft → published → registration_open → active → judging → completed → archived
```

Transition via `PATCH /dashboard/hackathons/:id/settings` with `{"status": "<target>"}` — or use the phase-specific helper `PATCH /dashboard/hackathons/:id/phase`.

## Tips for AI Agents

1. **Always store IDs** — After creating a resource, capture the returned `id` for use in subsequent calls
2. **Check before creating** — List existing resources before creating duplicates
3. **Parse dates carefully** — Convert "this Sunday" to the correct ISO 8601 date using the current date context
4. **Confirm destructive actions** — Ask the user before deleting resources or publishing results
5. **Use jq for readability** — Pipe responses through `jq .` for formatted output
6. **Batch operations** — When setting up a full hackathon, create prizes with embedded criteria/buckets in one call rather than separate endpoints
7. **Default to draft** — Create hackathons in draft status and let the user decide when to publish
8. **Prefer `/dashboard/*` over `/v1/*`** — The dashboard API is the source of truth for CRUD; v1 is for jobs/webhooks only

## Full API Reference

For the complete endpoint catalog with request/response shapes, see `references/api-endpoints.md`.

For end-to-end workflow examples with natural language mappings, see `references/workflow-examples.md`.
