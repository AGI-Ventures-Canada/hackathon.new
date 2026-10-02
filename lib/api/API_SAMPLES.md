# hackathon.new API Reference

Reference guide for the hackathon.new REST API. All endpoints use JSON request/response bodies unless noted.

## Setup

Store your API key and base URL as environment variables:

```bash
export BASE_URL="https://your-domain.com"  # or http://localhost:3000 for local dev
export API_KEY="sk_live_your_api_key_here"
```

Get your API key from the dashboard at **Settings > API Keys**. Test it:

```bash
curl -s "$BASE_URL/api/v1/whoami" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

## Authentication

| Namespace | Auth | Description |
|-----------|------|-------------|
| `/api/public/*` | None | Read-only public data (hackathons, results, announcements) |
| `/api/dashboard/*` | API key or Clerk session | Manage hackathons, judges, prizes, sponsors |
| `/api/v1/*` | API key only | Programmatic access for jobs, webhooks, activity logs |

All authenticated requests use the `Authorization: Bearer $API_KEY` header.

---

## Public Endpoints

No authentication required. Read-only access to public hackathon data.

### List hackathons

```bash
curl -s "$BASE_URL/api/public/hackathons" | jq .

# With search
curl -s "$BASE_URL/api/public/hackathons?q=ai" | jq .
```

**Response:**

```json
{
  "hackathons": [
    {
      "id": "uuid",
      "name": "AI Builders Hackathon",
      "slug": "ai-builders-2026",
      "description": "Build AI-powered applications",
      "bannerUrl": "https://storage.example.com/banners/abc.webp",
      "status": "active",
      "startsAt": "2026-02-01T00:00:00Z",
      "endsAt": "2026-02-15T23:59:59Z",
      "registrationOpensAt": "2026-01-15T00:00:00Z",
      "registrationClosesAt": "2026-01-31T23:59:59Z",
      "organizer": {
        "id": "uuid",
        "name": "Acme Corp",
        "slug": "acme",
        "logoUrl": "https://storage.example.com/logos/acme.png"
      }
    }
  ]
}
```

---

### Get hackathon details

```bash
curl -s "$BASE_URL/api/public/hackathons/ai-builders-2026" | jq .
```

**Response:**

```json
{
  "id": "uuid",
  "name": "AI Builders Hackathon",
  "slug": "ai-builders-2026",
  "description": "Build AI-powered applications",
  "rules": "Markdown rules content...",
  "bannerUrl": "https://storage.example.com/banners/abc.webp",
  "status": "active",
  "startsAt": "2026-02-01T00:00:00Z",
  "endsAt": "2026-02-15T23:59:59Z",
  "registrationOpensAt": "2026-01-15T00:00:00Z",
  "registrationClosesAt": "2026-01-31T23:59:59Z",
  "organizer": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme",
    "logoUrl": "https://storage.example.com/logos/acme.png"
  },
  "sponsors": [
    {
      "id": "uuid",
      "name": "TechCo",
      "logoUrl": "https://example.com/techco.png",
      "websiteUrl": "https://techco.com",
      "tier": "gold",
      "tenant": {
        "slug": "techco",
        "name": "TechCo",
        "logoUrl": "https://storage.example.com/logos/techco.png"
      }
    }
  ]
}
```

---

### Get organization profile

```bash
curl -s "$BASE_URL/api/public/orgs/acme" | jq .
```

**Response:**

```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "slug": "acme",
  "logoUrl": "https://storage.example.com/logos/acme.png",
  "logoUrlDark": "https://storage.example.com/logos/acme-dark.png",
  "description": "Building the future",
  "websiteUrl": "https://acme.com",
  "organizedHackathons": [],
  "sponsoredHackathons": []
}
```

---

### View submissions

```bash
curl -s "$BASE_URL/api/public/hackathons/ai-builders-2026/submissions" | jq .
```

**Response:**

```json
{
  "submissions": [
    {
      "id": "uuid",
      "title": "AI Code Review Bot",
      "description": "Automated code review powered by LLMs",
      "githubUrl": "https://github.com/user/project",
      "liveAppUrl": "https://my-app.vercel.app",
      "demoVideoUrl": null,
      "status": "submitted",
      "createdAt": "2026-02-10T15:30:00Z",
      "submitter": "Jane Smith"
    }
  ]
}
```

---

### View results

Returns published results. Returns 404 if results are not yet published.

```bash
curl -s "$BASE_URL/api/public/hackathons/ai-builders-2026/results" | jq .
```

**Response:**

```json
{
  "results": [
    {
      "rank": 1,
      "submissionTitle": "AI Code Review Bot",
      "teamName": "BuilderSquad",
      "weightedScore": 92.5,
      "judgeCount": 3,
      "prizes": ["Best Overall", "Most Innovative"]
    }
  ]
}
```

---

### View announcements

Returns published announcements, most recent first. Excludes drafts and scheduled.

```bash
curl -s "$BASE_URL/api/public/hackathons/ai-builders-2026/announcements" | jq .
```

**Response:**

```json
{
  "announcements": [
    {
      "id": "uuid",
      "title": "Submission deadline extended",
      "body": "You have an extra hour to submit your projects!",
      "priority": "urgent",
      "audience": "everyone",
      "published_at": "2026-04-28T14:00:00Z"
    }
  ]
}
```

---

### View schedule

```bash
curl -s "$BASE_URL/api/public/hackathons/ai-builders-2026/schedule" | jq .
```

**Response:**

```json
{
  "scheduleItems": [
    {
      "id": "uuid",
      "title": "Opening Ceremony",
      "description": "Welcome and kickoff",
      "starts_at": "2026-04-28T09:00:00Z",
      "ends_at": "2026-04-28T09:30:00Z",
      "location": "Main Hall",
      "sort_order": 0
    }
  ]
}
```

---

### View registration status

```bash
curl -s "$BASE_URL/api/public/hackathons/ai-builders-2026/registration" | jq .
```

**Response:**

```json
{
  "participantCount": 42,
  "isRegistered": null
}
```

`isRegistered` is `true`/`false` for signed-in users, `null` otherwise.

---

### Import from Luma

Extracts structured event data from a public Luma event page.

```bash
curl -s -X POST "$BASE_URL/api/public/import/luma" \
  -H "Content-Type: application/json" \
  -d '{"slug": "sfagents"}' | jq .
```

`slug` is the Luma event slug from the URL (e.g., `sfagents` from `lu.ma/sfagents`).

**Response:**

```json
{
  "name": "Autonomous Agents Hackathon",
  "description": "Build AI agents that work autonomously...",
  "startsAt": "2026-02-27T09:30:00.000-08:00",
  "endsAt": "2026-02-27T19:30:00.000-08:00",
  "locationType": "in_person",
  "locationName": "San Francisco, California",
  "locationUrl": null,
  "imageUrl": "https://images.lumacdn.com/cdn-cgi/image/.../event-covers/..."
}
```

Returns 404 if the event doesn't exist, is private, or the page structure has changed.

---

### Get assignment detail for scoring

Requires Clerk session (judge must own the assignment).

```bash
curl -s "$BASE_URL/api/public/hackathons/$SLUG/judging/assignments/$ASSIGNMENT_ID" \
  --cookie "clerk-session=..."
```

```json
{
  "id": "a1b2c3d4-...",
  "submissionId": "s1s2s3s4-...",
  "submissionTitle": "SmartRoute AI",
  "submissionDescription": "An AI-powered route optimizer",
  "submissionGithubUrl": "https://github.com/team/smartroute",
  "submissionLiveAppUrl": "https://smartroute.app",
  "submissionScreenshotUrl": null,
  "teamName": "Team Alpha",
  "isComplete": false,
  "notes": "",
  "buckets": [],
  "existingGateResponses": [],
  "existingBucketId": null,
  "criteria": [
    {
      "id": "c1c2c3c4-...",
      "name": "Innovation",
      "description": "How novel is the approach?",
      "max_score": 10,
      "weight": 2,
      "category": "core",
      "currentScore": null,
      "rubricLevels": []
    }
  ]
}
```

---

### Save scores for assignment

Requires Clerk session (judge must own the assignment). Hackathon must be in `judging` or `active` status.
Send the request again to revise scores while judging is still open.

```bash
curl -s -X POST "$BASE_URL/api/public/hackathons/$SLUG/judging/assignments/$ASSIGNMENT_ID/scores" \
  --cookie "clerk-session=..." \
  -H "Content-Type: application/json" \
  -d '{
    "scores": [
      { "criteriaId": "c1c2c3c4-...", "score": 8 }
    ],
    "notes": "Strong technical implementation"
  }'
```

```json
{ "success": true }
```

---

### Save ranked judge picks

Requires a Clerk session. Every project must be assigned to the current judge.

```bash
curl -s -X POST "$BASE_URL/api/public/hackathons/$SLUG/judging/picks" \
  --cookie "clerk-session=..." \
  -H "Content-Type: application/json" \
  -d '{
    "prizeId": "p1p2p3p4-...",
    "rankedSubmissionIds": ["s1s2s3s4-...", "s5s6s7s8-..."]
  }'
```

```json
{ "success": true }
```

---

### Ask a mentor

Requires an attendee Clerk session while the event is active. The attendee or their team can have one unresolved request.

```bash
curl -s -X POST "$BASE_URL/api/public/hackathons/$SLUG/mentor-request" \
  --cookie "clerk-session=..." \
  -H "Content-Type: application/json" \
  -d '{ "category": "API", "description": "Help us read this error" }' | jq .
```

### Read the mentor queue

Public viewers receive counts only. A mentor Clerk session also receives the safe request list.

```bash
curl -s "$BASE_URL/api/public/hackathons/$SLUG/mentor-queue" \
  --cookie "clerk-session=..." | jq .
```

### Claim or finish mentor help

Only an event mentor can claim. Only that same mentor can finish the request.

```bash
curl -s -X POST "$BASE_URL/api/public/hackathons/$SLUG/mentor-request/$REQUEST_ID/claim" \
  --cookie "clerk-session=..." | jq .

curl -s -X POST "$BASE_URL/api/public/hackathons/$SLUG/mentor-request/$REQUEST_ID/resolve" \
  --cookie "clerk-session=..." | jq .
```

---

## Dashboard Endpoints

All dashboard endpoints require an API key: `-H "Authorization: Bearer $API_KEY"`.

### Check who you are

```bash
curl -s "$BASE_URL/api/dashboard/me" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "tenantId": "uuid",
  "keyId": "uuid",
  "scopes": ["hackathons:read", "hackathons:write"]
}
```

---

### Hackathon Management

#### List your hackathons

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons" \
  -H "Authorization: Bearer $API_KEY" | jq .

# With search
curl -s "$BASE_URL/api/dashboard/hackathons?q=ai" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

#### Read one attendee event workspace

Requires a Clerk session for a registered attendee. The response is private and includes only the current attendee's team and project review data.

```bash
curl -s "$BASE_URL/api/dashboard/webmcp/attendee-events/ai-builders-2026" \
  --cookie "clerk-session=..." | jq .
```

---

#### Create a hackathon

Scope: `hackathons:write`

The basic `name` and `description` request still works. You can also create one complete private draft in a single request. If any child section fails, the new draft is removed.

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Builders 2026",
    "description": "Build AI-powered apps",
    "startsAt": "2026-09-08T08:30:00-04:00",
    "endsAt": "2026-09-09T17:00:00-04:00",
    "registrationOpensAt": "2026-08-25T12:00:00-04:00",
    "registrationClosesAt": "2026-09-07T08:30:00-04:00",
    "locationType": "hybrid",
    "locationName": "Toronto",
    "locationUrl": "https://example.com/live",
    "rules": "Be kind. Build during the event.",
    "sponsors": [{ "name": "OpenAI", "tier": "gold" }],
    "prizes": [{ "name": "Best Overall", "description": null, "value": "$5,000" }],
    "challenges": [{
      "title": "Useful agents",
      "description": "Build an agent people can trust.",
      "resources": [{ "label": "Starter guide", "url": "https://example.com/guide" }]
    }],
    "agendaItems": [{
      "title": "Kickoff",
      "description": null,
      "startsAt": "2026-09-08T08:30:00-04:00",
      "endsAt": "2026-09-08T09:00:00-04:00",
      "location": "Main stage",
      "speakers": ["Jane Smith"]
    }]
  }' | jq .
```

**Response:**

```json
{ "id": "uuid", "name": "AI Builders 2026", "slug": "ai-builders-2026" }
```

Save the returned `id` — you'll need it for all subsequent management calls.

---

#### Create from imported event data

Scope: `hackathons:write`

Creates a fully configured hackathon from structured event data (Luma or any external source), including banner image, sponsors, prizes, challenges, and agenda.

```bash
curl -s -X POST "$BASE_URL/api/dashboard/import/event" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Autonomous Agents Hackathon",
    "description": "Build AI agents that work autonomously...",
    "startsAt": "2026-02-27T09:30:00.000-08:00",
    "endsAt": "2026-02-27T19:30:00.000-08:00",
    "locationType": "in_person",
    "locationName": "San Francisco, California",
    "imageUrl": "https://images.lumacdn.com/cdn-cgi/image/.../event-covers/...",
    "challenges": [
      {
        "title": "AI for Healthcare",
        "description": "Build an agent that improves patient triage.",
        "resources": [
          { "label": "Sample dataset", "url": "https://example.com/dataset.csv" }
        ]
      }
    ],
    "agendaItems": [
      {
        "title": "Opening Keynote",
        "description": "The state of AI agents",
        "startsAt": "2026-02-27T09:30:00-08:00",
        "endsAt": "2026-02-27T10:00:00-08:00",
        "location": "Main Hall",
        "speakers": ["Jane Smith"]
      }
    ]
  }' | jq .
```

**Parameters:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Hackathon name |
| `description` | No | Full description |
| `startsAt` | No | ISO 8601 datetime |
| `endsAt` | No | ISO 8601 datetime |
| `locationType` | No | `"in_person"` or `"virtual"` |
| `locationName` | No | Human-readable location |
| `locationUrl` | No | URL for virtual events |
| `imageUrl` | No | Banner image URL to download and import |
| `sponsors` | No | Array of `{ name, tier }` |
| `rules` | No | Combined event rules / code of conduct |
| `prizes` | No | Array of `{ name, description?, value? }` |
| `challenges` | No | Array of `{ title, description?, resources? }` — tracks/themes participants build for |
| `agendaItems` | No | Array of `{ title, startsAt, description?, endsAt?, location?, speakers? }`. Passing a non-empty agenda replaces the auto-seeded default sessions (trigger items like `challenge_release` and `submission_deadline` are preserved). Items without `startsAt` are skipped. |

**Response:**

```json
{ "id": "uuid", "name": "Autonomous Agents Hackathon", "slug": "autonomous-agents-hackathon" }
```

The banner image (if provided) is downloaded, optimized, and uploaded to storage. If the download fails, the hackathon is still created without a banner.

---

#### Get hackathon details

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

#### Update hackathon settings

Scope: `hackathons:write`. All fields optional — only provided fields are updated.

```bash
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/settings" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "description": "New description",
    "status": "published",
    "startsAt": "2026-03-01T00:00:00Z",
    "endsAt": "2026-03-15T23:59:59Z",
    "registrationOpensAt": "2026-02-15T00:00:00Z",
    "registrationClosesAt": "2026-02-28T23:59:59Z",
    "maxParticipants": 200,
    "minTeamSize": 2,
    "maxTeamSize": 5,
    "allowSolo": false,
    "judgingMode": "points"
  }' | jq .
```

**Valid statuses:** `draft`, `published`, `registration_open`, `active`, `judging`, `completed`, `archived`

Starting `judging` returns `409 judging_setup_incomplete` until every scored prize has complete rules. The response includes an `issues` list with the changes needed.

| Field | Type | Description |
|-------|------|-------------|
| `maxParticipants` | number or null | Maximum participants (null = unlimited) |
| `minTeamSize` | number | Minimum team size |
| `maxTeamSize` | number | Maximum team size |
| `allowSolo` | boolean | Whether solo participation is allowed |
| `judgingMode` | string | `"points"` or `"subjective"` |

---

#### Upload / remove banner

Scope: `hackathons:write`. Accepted types: PNG, JPEG, WebP. Max size: 50MB.

```bash
# Upload
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/banner" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@banner.png" | jq .

# Remove
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/banner" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Sponsors

#### List sponsors

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/sponsors" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

#### Add a sponsor

Scope: `hackathons:write`. Valid tiers: `title`, `gold`, `silver`, `bronze`, `partner`

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/sponsors" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechCo",
    "tier": "gold",
    "websiteUrl": "https://techco.com",
    "logoUrl": "https://example.com/techco.png"
  }' | jq .
```

---

#### Update / remove a sponsor

Scope: `hackathons:write`

```bash
# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/sponsors/$SPONSOR_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "tier": "title" }' | jq .

# Remove
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/sponsors/$SPONSOR_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

#### Reorder sponsors

Scope: `hackathons:write`

```bash
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/sponsors/reorder" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "sponsorIds": ["uuid-1", "uuid-2", "uuid-3"] }' | jq .
```

---

### Judge Display Profiles

Public-facing judge profiles shown on hackathon pages. Separate from judge operational records (assignments, invitations).

#### List judge profiles

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judges/display" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "judges": [
    {
      "id": "uuid",
      "name": "Jane Smith",
      "title": "VP of Engineering",
      "organization": "Acme Corp",
      "headshotUrl": "https://storage.example.com/headshots/uuid.webp",
      "displayOrder": 0,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

#### Create a judge profile

Scope: `hackathons:write`

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judges/display" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "title": "VP of Engineering",
    "organization": "Acme Corp",
    "email": "jane@acme.com"
  }' | jq .
```

---

#### Update / delete a judge profile

Scope: `hackathons:write`

```bash
# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judges/display/$JUDGE_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "CTO", "organization": "New Corp" }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judges/display/$JUDGE_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

#### Reorder judge profiles

Scope: `hackathons:write`

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judges/display/reorder" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "orderedIds": ["judge-id-2", "judge-id-1", "judge-id-3"] }' | jq .
```

---

#### Upload / remove headshot

Scope: `hackathons:write`. Accepted types: PNG, JPEG, WebP. Max size: 5MB.

```bash
# Upload
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judges/display/$JUDGE_ID/headshot" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@headshot.jpg" | jq .

# Remove
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judges/display/$JUDGE_ID/headshot" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Judging Criteria

#### List criteria

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/criteria" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "criteria": [
    {
      "id": "uuid",
      "name": "Innovation",
      "description": "How novel is the approach?",
      "maxScore": 10,
      "weight": 1.5,
      "displayOrder": 1,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

#### Create a criterion

Scope: `hackathons:write`

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/criteria" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Innovation",
    "description": "How novel is the approach?",
    "maxScore": 10,
    "weight": 1.5
  }' | jq .
```

---

#### Update / delete a criterion

Scope: `hackathons:write`

```bash
# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/criteria/$CRITERIA_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "weight": 2.0 }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/criteria/$CRITERIA_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Judge Management

#### List judges

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/judges" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "judges": [
    {
      "participantId": "uuid",
      "displayName": "Jane Smith",
      "email": "jane@example.com",
      "imageUrl": "https://img.clerk.com/...",
      "assignmentCount": 5,
      "completedCount": 3
    }
  ]
}
```

---

#### Add a judge

Scope: `hackathons:write`. Add by email — if the user doesn't have an account, an invitation is saved and delivery is attempted.

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/judges" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "email": "judge@example.com" }' | jq .
```

**Email invitation response:**

```json
{
  "queued": false,
  "delivery": "sent",
  "invitation": {
    "id": "uuid",
    "email": "judge@example.com",
    "token": "accept-token"
  }
}
```

**Queued response for a draft event:**

```json
{
  "queued": true,
  "delivery": "queued",
  "queueReason": "event_draft",
  "invitation": {
    "id": "uuid",
    "email": "judge@example.com",
    "token": "accept-token"
  }
}
```

`delivery` is `sent`, `queued`, or `failed`. `failed` means the invite was saved but email delivery could not be confirmed. `queued` is also returned for compatibility and is true only while a draft invite waits for go-live. When `delivery` is `queued`, `queueReason` is `event_draft`. Use that value to explain why the email is waiting and what will release it.

---

#### Remove a judge

Scope: `hackathons:write`

```bash
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/judges/$PARTICIPANT_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{ "success": true, "resultsStale": true }
```

`resultsStale` indicates previously calculated results need recalculation.

---

#### Search users

Scope: `hackathons:read`. Search by name or email to find users to add as judges.

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/user-search?q=jane" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "users": [
    {
      "id": "user_abc",
      "email": "jane@example.com",
      "firstName": "Jane",
      "lastName": "Smith",
      "imageUrl": "https://img.clerk.com/..."
    }
  ]
}
```

---

#### List judge invitations

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/invitations" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

#### Cancel a judge invitation

Scope: `hackathons:write`

```bash
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/invitations/$INVITATION_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

#### Remind a judge invite

Scope: `hackathons:write`. A pending invite can receive one manual reminder. Reuse the same idempotency key if the request is retried.

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/invitations/$INVITATION_ID/remind" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: judge-reminder-$INVITATION_ID" | jq .
```

---

### Judging Assignments

#### List assignments

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/assignments" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "assignments": [
    {
      "id": "uuid",
      "judgeParticipantId": "uuid",
      "judgeName": "Jane Smith",
      "submissionId": "uuid",
      "submissionTitle": "AI Code Review Bot",
      "isComplete": false,
      "assignedAt": "2026-02-15T10:00:00Z"
    }
  ],
  "progress": {
    "totalAssignments": 15,
    "completedAssignments": 9,
    "totalSubmissions": 5,
    "fullyJudgedSubmissions": 3
  }
}
```

---

#### Auto-assign judges to submissions

Scope: `hackathons:write`. Distributes submissions across judges evenly.

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/auto-assign" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "submissionsPerJudge": 3 }' | jq .
```

**Response:**

```json
{ "assignedCount": 15 }
```

---

#### Manually assign / remove an assignment

Scope: `hackathons:write`

```bash
# Assign
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/assignments" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "judgeParticipantId": "uuid", "submissionId": "uuid" }' | jq .

# Remove
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/judging/assignments/$ASSIGNMENT_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Event people

#### Change an attendee to a judge

Scope: `hackathons:write`. This remains available during judging. Team links are kept so the judge can't score their own team.

```bash
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/participants/$PARTICIPANT_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"role":"judge"}' | jq .
```

---

### Teams

#### Remind a team invite

Scope: `hackathons:write`. A pending invite can receive one manual reminder. Reuse the same idempotency key if the request is retried.

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/teams/$TEAM_ID/invitations/$INVITATION_ID/remind" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: team-reminder-$INVITATION_ID" | jq .
```

---

#### Update team name

Scope: `hackathons:write`

```bash
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/teams/$TEAM_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Team Name"}'
```

---

### Prizes

#### List prizes

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "prizes": [
    {
      "id": "uuid",
      "name": "Best Overall",
      "description": "Top project across all criteria",
      "value": "$5,000",
      "displayOrder": 1,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "assignments": [
    {
      "id": "uuid",
      "prizeId": "uuid",
      "prizeName": "Best Overall",
      "submissionId": "uuid",
      "submissionTitle": "AI Code Review Bot",
      "teamName": "BuilderSquad",
      "assignedAt": "2026-02-16T12:00:00Z"
    }
  ]
}
```

---

#### Create a prize

Scope: `hackathons:write`

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Best Overall", "description": "Top project", "value": "$5,000" }' | jq .
```

---

#### Update / delete a prize

Scope: `hackathons:write`

```bash
# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes/$PRIZE_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "value": "$10,000" }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes/$PRIZE_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

#### Reorder prizes

Scope: `hackathons:write`

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes/reorder" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "orderedIds": ["prize-id-3", "prize-id-1", "prize-id-2"] }' | jq .
```

---

#### Assign / unassign a prize to a submission

Scope: `hackathons:write`

```bash
# Assign
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes/$PRIZE_ID/assign" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "submissionId": "uuid" }' | jq .

# Unassign
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/prizes/$PRIZE_ID/assign/$SUBMISSION_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Judging Rounds

Rounds are optional hackathon-level phases that enable finalists-style judging (round 1 narrows to top N, round 2 picks winners). Single-round hackathons don't need rounds at all.

#### List rounds

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

#### Create a round

Scope: `hackathons:write`

```bash
# Simple manual round
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Finals" }' | jq .

# Round that auto-advances the top 10 by score
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Semifinals",
    "advancement": "top_n",
    "advancementConfig": { "topN": 10 }
  }' | jq .
```

---

#### Set up rounds from a preset

Scope: `hackathons:write`. Creates a starter template of rounds. Four presets:

- `single` — one round, judges score every project once
- `shortlist` — two rounds; the top N by score move on (requires `advanceTopN`)
- `threshold` — two rounds; everyone scoring at or above a bar moves on (requires `threshold`)
- `finalists_pick` — one manual round with a `judges_pick` prize; judges select favorites, most picks wins (optional `prizeName`, `maxPicks`)

```bash
# Shortlist preset: top 10 move on to finals
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/preset" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "preset": "shortlist", "advanceTopN": 10 }' | jq .

# Single-round preset
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/preset" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "preset": "single" }' | jq .

# Finalists — judges pick by vibes (no scoring): 1 round + 1 judges_pick prize
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/preset" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "preset": "finalists_pick", "prizeName": "Grand Prize", "maxPicks": 1 }' | jq .
```

**Response:**

```json
{
  "success": true,
  "roundIds": ["uuid", "uuid"],
  "screeningPrizeId": "uuid"
}
```

The legacy `/rounds/finalists-preset` endpoint still works as an alias for `{ "preset": "shortlist", "advanceTopN": N }` but prefer `/rounds/preset` for new integrations.

---

#### Update / delete a round

Scope: `hackathons:write`

```bash
# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "advancement": "top_n", "advancementConfig": { "topN": 8 } }' | jq .

# Activate (only one round active at a time)
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID/activate" \
  -H "Authorization: Bearer $API_KEY"

# Complete
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID/complete" \
  -H "Authorization: Bearer $API_KEY"

# Delete (round must not be active)
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

#### Advance submissions to the next round

Scope: `hackathons:write`

```bash
# List candidates for the manual-advance picker (current round's submissions
# with any screening scores and whether each is already in the target round)
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID/advance-candidates?toRoundId=uuid" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Auto-advance using the round's top-N rule and screening prize scores
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID/advance" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "toRoundId": "uuid", "auto": true }' | jq .

# Advance specific submissions manually
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID/advance" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "toRoundId": "uuid", "submissionIds": ["sub-1", "sub-2"] }' | jq .

# Remove submissions from the target round (undo a manual pick before close)
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/rounds/$ROUND_ID/advance" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "toRoundId": "uuid", "submissionIds": ["sub-1"] }' | jq .
```

---

### Results

#### Calculate rankings

Scope: `hackathons:write`. Computes each prize ranking with its scoring style.

```bash
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/results/calculate" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{ "success": true, "count": 5 }
```

---

#### View results

Scope: `hackathons:read`. Detailed results with scores (organizer view).

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/results" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "results": [
    {
      "id": "uuid",
      "rank": 1,
      "submissionId": "uuid",
      "submissionTitle": "AI Code Review Bot",
      "teamName": "BuilderSquad",
      "totalScore": 85,
      "weightedScore": 92.5,
      "judgeCount": 3,
      "publishedAt": null,
      "prizes": ["Best Overall"]
    }
  ],
  "isPublished": false
}
```

---

#### Publish / unpublish results

Scope: `hackathons:write`. Publishing makes results publicly visible and transitions the hackathon to `completed`.

```bash
# Publish
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/results/publish" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Unpublish
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/results/unpublish" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

### Announcements

#### List announcements

Scope: `hackathons:read`. Includes drafts and scheduled (organizer view).

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

#### Create / update / delete an announcement

Scope: `hackathons:write`. Created as a draft — use publish or schedule to make it visible.

```bash
# Create
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Submission deadline extended",
    "body": "You have an extra hour!",
    "priority": "urgent",
    "audience": "everyone"
  }' | jq .

# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements/$ANNOUNCEMENT_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Updated title", "audience": "judges" }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements/$ANNOUNCEMENT_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

#### Publish / schedule / unpublish an announcement

Scope: `hackathons:write`

```bash
# Publish immediately
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements/$ANNOUNCEMENT_ID/publish" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Schedule for later
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements/$ANNOUNCEMENT_ID/schedule" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "scheduledAt": "2026-04-28T14:00:00Z" }' | jq .

# Revert to draft
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/announcements/$ANNOUNCEMENT_ID/unpublish" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

### Schedule

#### List schedule items

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/schedule" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

#### Create / update / delete a schedule item

Scope: `hackathons:write`

```bash
# Create
curl -s -X POST "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/schedule" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Opening Ceremony",
    "startsAt": "2026-04-28T09:00:00Z",
    "endsAt": "2026-04-28T09:30:00Z",
    "location": "Main Hall"
  }' | jq .

# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/schedule/$ITEM_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Updated title", "location": "Room B" }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/hackathons/$HACKATHON_ID/schedule/$ITEM_ID" \
  -H "Authorization: Bearer $API_KEY"
```

The `linkedTo` field on `PATCH` controls how the item is bound to the hackathon timeline:

| Value | Effect |
|-------|--------|
| `event_start` | `starts_at` stays in sync with the hackathon's start time |
| `event_end` | `starts_at` stays in sync with the hackathon's end time |
| `event_publish` | Status-only link (no time sync). For `challenge_release` items, fires the release when the hackathon transitions to `published` |
| `null` | Item uses its own `starts_at` value |

---

### Organization Profile

#### Get / update profile

```bash
# Get (scope: org:read)
curl -s "$BASE_URL/api/dashboard/org-profile" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Update (scope: org:write)
curl -s -X PATCH "$BASE_URL/api/dashboard/org-profile" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme",
    "description": "Building the future",
    "websiteUrl": "https://acme.com"
  }' | jq .
```

---

#### Upload / delete logo

Scope: `org:write`. Accepted types: PNG, JPEG, WebP, SVG. Max size: 2MB.

```bash
# Upload (variant: "light" or "dark")
curl -s -X POST "$BASE_URL/api/dashboard/upload-logo" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@logo.png" \
  -F "variant=light" | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/logo/light" \
  -H "Authorization: Bearer $API_KEY"
```

---

#### Manage organization people

These routes are used by the settings page and require a Clerk browser session for the active organization.

```bash
# List people and pending invites
curl -s "$BASE_URL/api/dashboard/organization-members" | jq .

# Invite someone
curl -s -X POST "$BASE_URL/api/dashboard/organization-members/invitations" \
  -H "Content-Type: application/json" \
  -d '{ "email": "teammate@example.com", "role": "org:member" }' | jq .

# Cancel a pending invite
curl -s -X DELETE "$BASE_URL/api/dashboard/organization-members/invitations/$INVITATION_ID"

# Remove a person
curl -s -X DELETE "$BASE_URL/api/dashboard/organization-members/$USER_ID"
```

---

### Webhooks

Scope: `webhooks:read` / `webhooks:write`

```bash
# List
curl -s "$BASE_URL/api/dashboard/webhooks" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Create
curl -s -X POST "$BASE_URL/api/dashboard/webhooks" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["hackathon.updated", "submission.submitted", "results.published"]
  }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/webhooks/$WEBHOOK_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Schedules (recurring jobs)

Scope: `schedules:read` / `schedules:write`

```bash
# List
curl -s "$BASE_URL/api/dashboard/schedules" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Create
curl -s -X POST "$BASE_URL/api/dashboard/schedules" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sync-event",
    "cron": "0 9 * * *",
    "input": { "eventId": "abc" }
  }' | jq .

# Get details
curl -s "$BASE_URL/api/dashboard/schedules/$SCHEDULE_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Update
curl -s -X PATCH "$BASE_URL/api/dashboard/schedules/$SCHEDULE_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "cron": "0 12 * * *" }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/dashboard/schedules/$SCHEDULE_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Jobs

```bash
# List (with pagination)
curl -s "$BASE_URL/api/dashboard/jobs?limit=10&offset=0" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Get details
curl -s "$BASE_URL/api/dashboard/jobs/$JOB_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

## v1 Integration Endpoints

All v1 endpoints require API key authentication. For programmatic and async operations.

### Check API key identity

```bash
curl -s "$BASE_URL/api/v1/whoami" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "tenantId": "uuid",
  "tenantName": "Acme Labs",
  "tenantSlug": "acme-labs",
  "tenantType": "organization",
  "keyId": "uuid",
  "keyName": "hackathon.new CLI (localhost, 2026-05-04)",
  "scopes": ["hackathons:read", "hackathons:write"]
}
```

---

### Create a job

Scope: `hackathons:write`. Starts a workflow execution. Supports idempotency.

```bash
curl -s -X POST "$BASE_URL/api/v1/jobs" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-request-id-123" \
  -d '{ "type": "sync-event", "input": { "eventId": "abc" } }' | jq .
```

---

### Get job status

Scope: `hackathons:read`

```bash
curl -s "$BASE_URL/api/v1/jobs/$JOB_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

### Get job result

Scope: `hackathons:read`. Returns **202** with empty body while the job is still running.

```bash
curl -s "$BASE_URL/api/v1/jobs/$JOB_ID/result" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Poll until complete
while true; do
  HTTP_CODE=$(curl -s -o /tmp/job-result.json -w "%{http_code}" \
    "$BASE_URL/api/v1/jobs/$JOB_ID/result" \
    -H "Authorization: Bearer $API_KEY")
  if [ "$HTTP_CODE" -ne 202 ]; then
    cat /tmp/job-result.json | jq .
    break
  fi
  sleep 1
done
```

---

### Cancel a job

Scope: `hackathons:write`

```bash
curl -s -X POST "$BASE_URL/api/v1/jobs/$JOB_ID/cancel" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

### Webhooks (v1)

Scope: `webhooks:read` / `webhooks:write`

```bash
# List
curl -s "$BASE_URL/api/v1/webhooks" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Create (returns secret once — save it)
curl -s -X POST "$BASE_URL/api/v1/webhooks" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["hackathon.updated", "submission.submitted"]
  }' | jq .

# Delete
curl -s -X DELETE "$BASE_URL/api/v1/webhooks/$WEBHOOK_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

### Activity logs

Scope: `hackathons:read`. Returns audit logs for a hackathon with filtering, sorting, date ranges, and pagination.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Page size (1-100) |
| `offset` | number | 0 | Pagination offset |
| `action` | string | — | Substring filter (e.g. `judge`) |
| `resource_type` | string | — | Exact match (e.g. `hackathon`, `team`) |
| `since` | string | — | ISO 8601 timestamp, only logs after this time |
| `until` | string | — | ISO 8601 timestamp, only logs before this time |
| `sort` | string | `desc` | `asc` or `desc` |

```bash
# Latest 50 logs
curl -s "$BASE_URL/api/v1/hackathons/$HACKATHON_ID/activity" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Filter by action
curl -s "$BASE_URL/api/v1/hackathons/$HACKATHON_ID/activity?action=judge" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Date range + resource type
curl -s "$BASE_URL/api/v1/hackathons/$HACKATHON_ID/activity?since=2026-04-01T00:00:00Z&until=2026-04-03T23:59:59Z&resource_type=team" \
  -H "Authorization: Bearer $API_KEY" | jq .

# Oldest first, page 2
curl -s "$BASE_URL/api/v1/hackathons/$HACKATHON_ID/activity?sort=asc&limit=20&offset=20" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

**Response:**

```json
{
  "logs": [
    {
      "id": "a1b2c3d4-...",
      "action": "judge.added",
      "resourceType": "hackathon_participant",
      "resourceId": "p1-uuid",
      "actorType": "api_key",
      "metadata": { "hackathonId": "h1-uuid", "email": "judge@example.com" },
      "createdAt": "2026-04-03T14:30:00.000Z"
    }
  ],
  "total": 142
}
```

---

## Error Handling

All endpoints return errors in this format:

```json
{ "error": "Error message here", "code": "error_code" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request (invalid input) |
| `401` | Unauthorized (missing or invalid auth) |
| `403` | Forbidden (missing required scope) |
| `404` | Not found |
| `409` | Conflict (duplicate resource) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

### Rate limiting

When rate limited (429), check these response headers:

- `X-RateLimit-Remaining` — requests remaining in the current window
- `X-RateLimit-Reset` — Unix timestamp when the limit resets

Wait until the reset timestamp before retrying.

```bash
# Use -i to see rate limit headers
curl -i "$BASE_URL/api/v1/jobs" \
  -H "Authorization: Bearer $API_KEY"
```


### Sponsor changes from WebMCP

Sponsor add, update, and remove use the same organizer authorization and pre-completion lifecycle checks as the app and CLI. WebMCP supplies the current event status and version; stale context returns `409 event_changed`. Adding a sponsor also requires a UUID `x-webmcp-idempotency-key`, reused for a retry of the same request. Website edits accept bare domains and reject unsafe URLs. Names must contain text and be at most 200 characters; tiers are `gold`, `silver`, `bronze`, `custom`, or `none`.

```bash
curl -X PATCH "$BASE_URL/api/dashboard/hackathons/$EVENT_ID/sponsors/$SPONSOR_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example sponsor","websiteUrl":"example.com","tier":"gold"}'
```

### Private judging drafts and explicit submission

These routes require the invited judge's Clerk session. API keys cannot read or write a judge's private drafts. Open the review first, and use its returned revision and scorecard version on each write.

```http
GET /api/public/hackathons/my-event/judging/reviews/ASSIGNMENT_UUID
```

The response contains `response` (saved draft or submitted answers), `submitted`, `revision`, `criteriaVersion`, `hasDraft`, `isComplete`, `canEdit`, and the assigned project and scorecard. A draft never changes prize results or marks an assignment complete.

```http
PATCH /api/public/hackathons/my-event/judging/reviews/ASSIGNMENT_UUID
Content-Type: application/json

{
  "expectedRevision": 0,
  "criteriaVersion": "VERSION_FROM_GET",
  "response": {
    "kind": "weighted_score",
    "scores": {"CRITERION_UUID": null},
    "notes": "Check the live demo later."
  }
}
```

Use `POST` at the same URL to submit a complete review. Each successful draft save or submission returns the next revision. A stale revision or changed scorecard returns `409`; reload and review the preserved choices before retrying. Judging windows, ownership, and criterion membership are checked again in the atomic database transaction.

Other response shapes use `kind: "gate_check"` with a `gates` map of criterion UUIDs to `true`, `false`, or draft-only `null`; or `kind: "bucket_sort"` with `bucketId` and optional legacy `gates`. All include `notes` (up to 2,000 characters).

Ranked choices use the same GET/PATCH/POST lifecycle at `/api/public/hackathons/my-event/judging/pick-reviews/PRIZE_UUID`, with `response: {"kind":"judges_pick","rankedSubmissionIds":["PROJECT_UUID"],"notes":""}`. An empty draft is allowed; submission requires at least one assigned project and enforces the prize limit.

The older score, check, group, and pick POST routes retain their request and response formats and use this same atomic publication service. They return `409` if an unfinished private draft would be overwritten.
