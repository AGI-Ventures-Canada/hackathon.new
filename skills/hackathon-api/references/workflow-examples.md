# Hackathon API — Workflow Examples

Natural language commands mapped to API call sequences. Use these as patterns when interpreting user requests.

## Natural Language → API Mapping

| User Says | API Calls |
|-----------|-----------|
| "Make me a hackathon on Sunday from 7am to 9pm" | `POST /dashboard/hackathons` with computed dates |
| "Import from this Luma event: lu.ma/abcd" | `POST /dashboard/import/url` with `{url}` |
| "Add judge@example.com as a judge" | `GET /dashboard/hackathons` → find active → `POST .../judging/judges` |
| "Add rubric levels to the Innovation criterion" | Prizes now embed `criteria`; pass them inline when creating the prize |
| "Create prizes: 1st $5k, 2nd $2.5k, 3rd $1k" | 3x `POST .../prizes` |
| "Set up a Grand Prize track with screening → finals" | `POST .../prize-tracks` → `POST .../prize-tracks/:tid/rounds` |
| "Top 10 move on to finals" | `PATCH .../prize-tracks/:tid/rounds/:rid` with `{"advancement": "top_n"}` |
| "Activate the finals round" | `POST .../prize-tracks/:tid/rounds/:rid/activate` |
| "Auto-assign judges" | `POST .../prizes/:pid/auto-assign` with `{submissionsPerJudge}` |
| "Add Acme Corp as a gold sponsor" | `POST .../sponsors` with `{name, tier, websiteUrl}` |
| "Give participants $500 OpenAI credits" | `POST .../perks` with `{name, type:"credit", sponsorId}` |
| "Release the OpenAI perk now" | `POST .../perks/:pid/release` |
| "Add a team called Team Rocket" | `POST .../teams` with `{name, captainEmail}` |
| "Add bob@co.com and carol@co.com to team X" | `PATCH .../teams/:tid/members` with `{addEmails}` |
| "Put Team Rocket in Room A" | `POST .../rooms/:rid/teams` with `{teamId}` |
| "Send an announcement at 9 AM tomorrow" | `POST .../announcements` → `POST .../announcements/:aid/schedule` with `{publishAt}` |
| "Send this kickoff message now" | `POST .../announcements/:aid/publish` |
| "Add a Voice AI challenge" | `POST .../challenges` with `{name, description}` |
| "Add lunch from 12-1 on day 1" | `POST .../schedule` with `{title, startsAt, endsAt}` |
| "Calculate results and publish" | `POST .../results/calculate` → `POST .../results/publish` |
| "What hackathons do I have?" | `GET /dashboard/hackathons` |
| "Show me the results" | `GET .../results` |
| "Notify me when someone submits" | `POST /dashboard/webhooks` with events list |

## End-to-End: Set Up a Full Hackathon

When a user says something like "Set up a hackathon called AI Builders this Saturday 9am-6pm with 3 prizes and innovation/execution/design criteria":

### Step 1: Create the Hackathon

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons" \
  -d '{
    "name": "AI Builders",
    "slug": "ai-builders",
    "description": "AI Builders Hackathon",
    "startsAt": "2026-03-14T09:00:00-05:00",
    "endsAt": "2026-03-14T18:00:00-05:00",
    "registrationOpensAt": "2026-03-08T00:00:00-05:00",
    "registrationClosesAt": "2026-03-14T08:00:00-05:00"
  }' | jq .
```

Save the returned `id` as `$HACKATHON_ID`.

### Step 2: Create Prizes (with embedded criteria)

Each prize carries its own judging style and criteria:

```bash
# Scored prize with criteria
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes" \
  -d '{
    "name": "First Place",
    "value": "$5,000",
    "judgingStyle": "bucket_sort",
    "buckets": [
      {"level": 1, "label": "Not a fit"},
      {"level": 2, "label": "Solid"},
      {"level": 3, "label": "Excellent"}
    ]
  }' | jq .

# Pass/fail prize with criteria
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes" \
  -d '{
    "name": "Compliance Award",
    "judgingStyle": "gate_check",
    "criteria": [
      {"name": "Working demo", "description": "Runs without errors"},
      {"name": "Original code", "description": "No plagiarism"}
    ]
  }' | jq .
```

### Step 3: Publish

```bash
curl -s -X PATCH -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/settings" \
  -d '{"status": "published"}' | jq .
```

## End-to-End: Import from Luma

When a user says "create a hackathon from this Luma event: lu.ma/abcd1234":

```bash
# One-step create
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/import/url" \
  -d '{"url": "https://lu.ma/abcd1234"}' | jq .
```

Response: `{"id": "...", "name": "...", "slug": "..."}`. The hackathon starts in `draft` — review and publish when ready.

To preview before creating:

```bash
# Extract data (no auth)
curl -s -X POST -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/public/import/url" \
  -d '{"url": "https://lu.ma/abcd1234"}' | jq .

# Then create with edits
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/import/event" \
  -d '{ ...edited fields... }' | jq .
```

## End-to-End: Multi-Round Judging with Prize Tracks

When a user says "run a screening round that advances top 10 to finals":

```bash
# Create the track — the initial round is auto-created
TRACK=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prize-tracks" \
  -d '{"name":"Grand Prize", "intent":"overall_winner", "style":"bucket_sort"}' | jq .)

TRACK_ID=$(echo $TRACK | jq -r '.id')

# Fetch the full track to get the initial round id
TRACK_DETAILS=$(curl -s -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prize-tracks/$TRACK_ID" | jq .)

SCREENING_ROUND_ID=$(echo $TRACK_DETAILS | jq -r '.rounds[0].id')

# Set advancement on the screening round
curl -s -X PATCH -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prize-tracks/$TRACK_ID/rounds/$SCREENING_ROUND_ID" \
  -d '{"advancement":"top_n"}' | jq .

# Add a finals round
FINALS_ROUND=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prize-tracks/$TRACK_ID/rounds" \
  -d '{"name":"Finals", "style":"subjective"}' | jq .)

FINALS_ROUND_ID=$(echo $FINALS_ROUND | jq -r '.id')

# Activate screening
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prize-tracks/$TRACK_ID/rounds/$SCREENING_ROUND_ID/activate" | jq .

# After screening closes: calculate, then activate finals
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prize-tracks/$TRACK_ID/rounds/$SCREENING_ROUND_ID/calculate-results" | jq .

curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prize-tracks/$TRACK_ID/rounds/$FINALS_ROUND_ID/activate" | jq .
```

## End-to-End: Finalists Preset (hackathon-level)

The "Finalists — judges pick" preset creates two rounds + a hidden screening prize in one call:

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/finalists-preset" \
  -d '{"advanceTopN": 5, "round1Name": "Semifinals", "round2Name": "Finals"}' | jq .
```

## End-to-End: Add Judges and Run Judging

When a user says "Add these judges: alice@co.com, bob@co.com, charlie@co.com":

```bash
# Add judges
for email in alice@co.com bob@co.com charlie@co.com; do
  curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
    -H "Content-Type: application/json" \
    "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/judges" \
    -d "{\"email\": \"$email\"}" | jq .
done

# Auto-assign submissions for a specific prize
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes/$PRIZE_ID/auto-assign" \
  -d '{"submissionsPerJudge": 5}' | jq .

# Check progress
curl -s -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/progress" | jq .
```

## End-to-End: Add Sponsors with Perks

When a user says "Add Acme as a gold sponsor with a $500 credit perk":

```bash
# Add the sponsor
SPONSOR_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/sponsors" \
  -d '{"name": "Acme Corp", "tier": "gold", "websiteUrl": "https://acme.com"}' | jq -r '.id')

# Create a perk linked to the sponsor
PERK_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/perks" \
  -d "{
    \"name\": \"Acme Cloud Credits\",
    \"type\": \"credit\",
    \"sponsorId\": \"$SPONSOR_ID\",
    \"code\": \"ACME500\",
    \"redemptionUrl\": \"https://acme.com/redeem\",
    \"instructions\": \"Enter this code at checkout\"
  }" | jq -r '.id')

# Release the perk to attendees when the event starts
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/perks/$PERK_ID/release" | jq .
```

## End-to-End: Broadcast Announcements

When a user says "Schedule a kickoff message for 9 AM tomorrow and a submission reminder 1 hour before close":

```bash
# Kickoff
KICKOFF_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements" \
  -d '{
    "title": "Kickoff in 15 minutes!",
    "body": "Join us in the main room at 9 AM sharp.",
    "priority": "normal",
    "audience": "all"
  }' | jq -r '.id')

curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements/$KICKOFF_ID/schedule" \
  -d '{"publishAt": "2026-05-01T08:45:00Z"}' | jq .

# Submission reminder
REMINDER_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements" \
  -d '{
    "title": "1 hour until submissions close",
    "body": "Finalize your projects and submit before 5 PM.",
    "priority": "urgent",
    "audience": "teams"
  }' | jq -r '.id')

curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements/$REMINDER_ID/schedule" \
  -d '{"publishAt": "2026-05-02T16:00:00Z"}' | jq .
```

## End-to-End: Hybrid Event — Teams and Rooms

When a user says "Create Team Rocket and assign them to Room A":

```bash
# Create the team (captain by email)
TEAM_ID=$(curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/teams" \
  -d '{
    "name": "Team Rocket",
    "captainEmail": "ash@example.com",
    "mode": "in_person"
  }' | jq -r '.id')

# Add members
curl -s -X PATCH -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/teams/$TEAM_ID/members" \
  -d '{"addEmails": ["misty@co.com", "brock@co.com"]}' | jq .

# Assign to a room
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rooms/$ROOM_ID/teams" \
  -d "{\"teamId\": \"$TEAM_ID\"}" | jq .
```

## End-to-End: Challenges

When a user says "Add a Voice AI challenge and a Sustainability challenge":

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/challenges" \
  -d '{"name": "Voice AI", "description": "Build a voice-first experience"}' | jq .

curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/challenges" \
  -d '{"name": "Sustainability", "description": "Solve a climate or sustainability problem"}' | jq .
```

## End-to-End: Event Schedule

When a user says "Add kickoff at 9 AM, lunch at noon, demos at 4 PM on May 1":

```bash
for item in \
  '{"title":"Kickoff","type":"kickoff","startsAt":"2026-05-01T09:00:00Z","endsAt":"2026-05-01T09:30:00Z","location":"Main Stage"}' \
  '{"title":"Lunch","type":"meal","startsAt":"2026-05-01T12:00:00Z","endsAt":"2026-05-01T13:00:00Z","location":"Cafeteria"}' \
  '{"title":"Demos","type":"demos","startsAt":"2026-05-01T16:00:00Z","endsAt":"2026-05-01T18:00:00Z","location":"Main Stage"}'; do
  curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
    -H "Content-Type: application/json" \
    "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/schedule" \
    -d "$item" | jq .
done
```

## End-to-End: Calculate and Publish Results

When a user says "close judging and announce winners":

```bash
# Calculate rankings from submitted scores
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/results/calculate" | jq .

# Review results
curl -s -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/results" | jq .

# Publish (makes public, transitions hackathon to completed)
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/results/publish" | jq .
```

## End-to-End: Set Up Webhooks

When a user says "notify me when someone submits":

```bash
curl -s -X POST -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/webhooks" \
  -d '{
    "url": "https://your-webhook-endpoint.com/hook",
    "events": ["submission.submitted", "participant.registered"]
  }' | jq .
```

Save the returned `secret` — it's shown only once and used to verify webhook signatures.

## Hackathon Lifecycle Status Transitions

```
draft → published → registration_open → active → judging → completed → archived
```

Each status change is done via:

```bash
curl -s -X PATCH -H "Authorization: Bearer $HACKATHON_API_KEY" \
  -H "Content-Type: application/json" \
  "$HACKATHON_BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/settings" \
  -d '{"status": "TARGET_STATUS"}' | jq .
```

## Date Handling Cheat Sheet

When converting natural language dates:

| User Says | Interpretation |
|-----------|---------------|
| "this Sunday" | Next upcoming Sunday from today |
| "next Friday" | Friday of next week |
| "tomorrow at 9am" | Tomorrow 09:00 in user's timezone |
| "March 15th" | 2026-03-15 (current year unless past) |
| "7am to 9pm" | startsAt=07:00, endsAt=21:00 |
| "all day" | startsAt=00:00, endsAt=23:59 |
| "weekend hackathon" | Saturday 09:00 to Sunday 18:00 |
| "48-hour hackathon" | startsAt to startsAt+48h |

Always use ISO 8601 format with timezone: `2026-03-15T09:00:00-05:00`

If the user's timezone is unknown, ask before creating the hackathon.
