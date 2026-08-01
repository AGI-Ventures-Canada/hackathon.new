# Hackathon CLI — Workflow Examples

Natural language commands mapped to CLI command sequences.

## Natural Language → CLI Command Mapping

| User Says | CLI Commands |
|-----------|-------------|
| "Make me a hackathon" | `hackathon events create --name "..." --slug "..."` |
| "Import from this Luma event: lu.ma/abcd" | `hackathon events create --from-url https://lu.ma/abcd` |
| "Add judge@example.com as a judge" | `hackathon events list` → `hackathon judging judges add <id> --email judge@example.com` |
| "Set up 3 judging criteria" | 3x `hackathon judging criteria create <id> --name "..." --max-score 10` |
| "Add rubric levels" | `hackathon judging levels add --hackathon-id <id> --criteria-id <cid> --label "Solid"` |
| "Create prizes: 1st $5k, 2nd $2.5k, 3rd $1k" | 3x `hackathon prizes create <id> --name "..." --value "..."` |
| "Set up a Grand Prize track and a Sponsor Award track" | 2x `hackathon tracks create <id> --name "..."` |
| "Top 5 submissions advance to finals" | `hackathon tracks update-round <id> <track> <round> --advance-top-n 5` |
| "Auto-assign judges" | `hackathon judging auto-assign <id> --per-judge 5` |
| "Add Acme Corp as a gold sponsor" | `hackathon sponsors add <id> --name "Acme Corp" --tier gold` |
| "Give participants $500 OpenAI credits" | `hackathon perks create <id> --name "OpenAI credits" --type credit --sponsor <sid>` |
| "Release the OpenAI perk now" | `hackathon perks release <id> <perk-id>` |
| "Add a team called Team Rocket, captain is ash@example.com" | `hackathon teams create <id> --name "Team Rocket" --captain-email ash@example.com` |
| "Add bob@co.com and carol@co.com to team X" | `hackathon teams update-members <id> <team-id> --add bob@co.com,carol@co.com` |
| "Put Team Rocket in Room A" | `hackathon teams assign-room <id> --team <tid> --room <rid>` |
| "Send an announcement at 9 AM tomorrow" | `hackathon announcements create <id> --title "..." --body "..."` → `hackathon announcements schedule <id> <aid> --at 2026-05-01T09:00:00Z` |
| "Send this kickoff message now" | `hackathon announcements publish <id> <aid>` |
| "Add a Voice AI challenge" | `hackathon challenges create <id> --title "Build with voice AI"` |
| "Add lunch from 12-1 on day 1" | `hackathon schedule add <id> --title "Lunch" --starts-at 2026-05-01T12:00:00Z --ends-at 2026-05-01T13:00:00Z` |
| "Calculate results and publish" | `hackathon results calculate <id>` → `hackathon results publish <id>` |
| "Change hackathon name to AI Summit" | `hackathon events update <id-or-slug> --name "AI Summit"` |
| "What hackathons do I have?" | `hackathon events list` |
| "Show me the results" | `hackathon results get <id>` |
| "Browse public hackathons" | `hackathon browse hackathons` |

## End-to-End: Set Up a Full Hackathon

When a user says "Set up a hackathon called AI Builders with 3 prizes and innovation/execution/design criteria":

### Step 1: Create the Hackathon

```bash
hackathon events create --name "AI Builders" --slug "ai-builders" --json
```

Save the returned `id` from the JSON output.

### Step 2: Add Judging Criteria

```bash
hackathon judging criteria create <id> \
  --name "Innovation" \
  --description "How novel and creative is the solution?" \
  --max-score 10 --weight 1.0

hackathon judging criteria create <id> \
  --name "Execution" \
  --description "How well is the solution built and polished?" \
  --max-score 10 --weight 1.0

hackathon judging criteria create <id> \
  --name "Design" \
  --description "How good is the UX and visual design?" \
  --max-score 10 --weight 1.0
```

### Step 3: Create Prizes

```bash
hackathon prizes create <id> --name "First Place" --value "$5,000"
hackathon prizes create <id> --name "Second Place" --value "$2,500"
hackathon prizes create <id> --name "Third Place" --value "$1,000"
```

### Step 4: Verify Setup

```bash
hackathon events get <id>
hackathon judging criteria list <id>
hackathon prizes list <id>
```

## End-to-End: Import a Hackathon from Luma

When a user says "Create a hackathon from this Luma event: lu.ma/abcd1234":

```bash
hackathon events create --from-url https://lu.ma/abcd1234 --json
```

The CLI fetches the Luma event and creates the hackathon with matching title, description, dates, and cover image. The hackathon starts in `draft` — review details and publish when ready.

## End-to-End: Multi-Round Judging with Tracks

When a user says "Run a screening round that advances top 10 to finals":

### Step 1: Create a Track

```bash
hackathon tracks create <id> --name "Grand Prize" --json
# Save the returned track ID as $TRACK_ID
```

### Step 2: Inspect Rounds

```bash
hackathon tracks buckets <id> $TRACK_ID
# Save the screening round ID as $SCREENING_ID and finalists round ID as $FINAL_ID
```

### Step 3: Configure Advancement

```bash
hackathon tracks update-round <id> $TRACK_ID $SCREENING_ID --advance-top-n 10
```

### Step 4: Activate the Screening Round

```bash
hackathon tracks activate-round <id> $TRACK_ID $SCREENING_ID
```

### Step 5: Once Screening Closes, Advance

```bash
hackathon tracks calculate-results <id> $TRACK_ID
hackathon tracks activate-round <id> $TRACK_ID $FINAL_ID
```

## End-to-End: Add Sponsors with Perks

When a user says "Add Acme as a gold sponsor with a $500 credit perk":

```bash
# Add the sponsor
SPONSOR_ID=$(hackathon sponsors add <id> --name "Acme Corp" --tier gold --website "https://acme.com" --json | jq -r '.id')

# Create a perk linked to the sponsor
PERK_ID=$(hackathon perks create <id> \
  --name "Acme Cloud Credits" \
  --type credit \
  --sponsor $SPONSOR_ID \
  --code "ACME500" \
  --redemption-url "https://acme.com/redeem" \
  --instructions "Enter this code at checkout" \
  --json | jq -r '.id')

# Release it to participants when the event starts
hackathon perks release <id> $PERK_ID
```

## End-to-End: Broadcast Announcements

When a user says "Schedule a kickoff message for 9 AM tomorrow and a submission reminder 1 hour before close":

```bash
# Create the kickoff announcement
KICKOFF_ID=$(hackathon announcements create <id> \
  --title "Kickoff in 15 minutes!" \
  --body "Join us in the main room at 9 AM sharp." \
  --priority normal \
  --json | jq -r '.id')

hackathon announcements schedule <id> $KICKOFF_ID --at 2026-05-01T08:45:00Z

# Create the reminder
REMINDER_ID=$(hackathon announcements create <id> \
  --title "1 hour until submissions close" \
  --body "Finalize your projects and submit before 5 PM." \
  --priority urgent \
  --json | jq -r '.id')

hackathon announcements schedule <id> $REMINDER_ID --at 2026-05-02T16:00:00Z
```

## End-to-End: Add Judges and Run Judging

When a user says "Add these judges: alice@co.com, bob@co.com, charlie@co.com":

### Step 1: Find the Hackathon

```bash
hackathon events list
```

### Step 2: Add Judges

```bash
hackathon judging judges add <id> --email alice@co.com
hackathon judging judges add <id> --email bob@co.com
hackathon judging judges add <id> --email charlie@co.com
```

### Step 3: Auto-Assign

```bash
hackathon judging auto-assign <id> --per-judge 5
```

### Step 4: Check Progress

```bash
hackathon judging assignments list <id>
```

## End-to-End: Organize a Hybrid Event

When a user says "Assign these in-person teams to rooms":

```bash
# List teams
hackathon teams list <id> --json

# Mark Team Rocket as in-person
hackathon teams update <id> <team-id> --mode in_person

# Assign to Room A
hackathon teams assign-room <id> --team <team-id> --room <room-id>
```

## End-to-End: Calculate and Publish Results

When a user says "close judging and announce winners":

```bash
hackathon results calculate <id>
hackathon results get <id>

# Assign prizes to top submissions
hackathon prizes assign <id> <first-prize-id> --submission <winner-id>

# Publish (makes public, transitions to completed)
hackathon results publish <id>
```

## End-to-End: Set Up Webhooks

When a user says "notify me when someone submits":

```bash
hackathon webhooks create \
  --url "https://your-endpoint.com/hook" \
  --events "submission.submitted,participant.registered"
```

## Hackathon Lifecycle

The typical lifecycle managed through the dashboard:

```
draft → published → registration_open → active → judging → completed → archived
```

## Using JSON Output for Scripting

Use `--json` to capture IDs programmatically:

```bash
# Create and capture ID
HACKATHON_ID=$(hackathon events create --name "Test" --slug "test" --json | jq -r '.id')

# Use in subsequent commands
hackathon judging criteria create $HACKATHON_ID --name "Innovation" --max-score 10
hackathon prizes create $HACKATHON_ID --name "First Place" --value "$1,000"
```

## Local Development

When working on the hackathon.new codebase, use `bun cli` instead of `hackathon`:

```bash
# Start local server
bun dev

# Auth against local instance
bun cli login --base-url http://localhost:3000

# Run commands
bun cli events list
bun cli prizes create <hackathon-id> --name "Best AI App"
bun cli judging judges list <hackathon-id>
```

Seed test data for different scenarios:

```bash
bun run scripts/test-scenario.ts judging   # Seeds judges + submissions
bun cli judging judges list <hackathon-id>
bun cli judging auto-assign <hackathon-id> --per-judge 3
```
