# Hackathon API — Complete Endpoint Reference

All endpoints use JSON request/response bodies unless noted. Authentication via `Authorization: Bearer sk_live_...` header.

## Base URL

```
Local:      http://localhost:3000
Production: https://getoatmeal.com
```

---

## Public Endpoints (`/api/public/*`)

No authentication required unless noted.

### Health & Discovery

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/health` | Service health check → `{"status":"ok"}` |
| GET | `/api/public/hackathons` | List public hackathons. Query: `?q=search` |
| GET | `/api/public/hackathons/:slug` | Get hackathon details with sponsors |
| GET | `/api/public/orgs/:slug` | Organization profile with their hackathons |

### Registration (Clerk session required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/hackathons/:slug/registration` | Participant count + registration status |
| POST | `/api/public/hackathons/:slug/register` | Register current user |

### Submissions (Clerk session required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/hackathons/:slug/submissions` | List all submissions |
| GET | `/api/public/hackathons/:slug/submissions/me` | Current user's submission |
| POST | `/api/public/hackathons/:slug/submissions` | Create submission |
| PATCH | `/api/public/hackathons/:slug/submissions` | Update submission |
| POST | `/api/public/hackathons/:slug/submissions/screenshot` | Upload screenshot (multipart, max 10MB) |
| DELETE | `/api/public/hackathons/:slug/submissions/screenshot` | Remove screenshot |

### Attendee views (Clerk session required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/hackathons/:slug/poll` | Registration + team status polling |
| GET | `/api/public/hackathons/:slug/announcements` | Visible announcements for this viewer |
| GET | `/api/public/hackathons/:slug/schedule` | Published schedule items |
| GET | `/api/public/hackathons/:slug/winners` | Published winners (404 if not published) |
| GET | `/api/public/hackathons/:slug/perks` | Released perks the viewer can redeem |
| GET | `/api/public/hackathons/:slug/categories` | Challenge categories/themes |
| POST | `/api/public/hackathons/:slug/social-submit` | Create "working-on" social submission |

### Mentor queue (Clerk session)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/public/hackathons/:slug/mentor-request` | Request mentor help |
| GET | `/api/public/hackathons/:slug/mentor-queue` | Current mentor queue |
| POST | `/api/public/hackathons/:slug/mentor-request/:requestId/claim` | Claim a request as mentor |
| POST | `/api/public/hackathons/:slug/mentor-request/:requestId/resolve` | Mark request resolved |

### Team Invitations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/invitations/:token` | Get invitation details |
| POST | `/api/public/invitations/:token/accept` | Accept invitation (Clerk) |
| POST | `/api/public/invitations/:token/decline` | Decline invitation (Clerk) |

### Judge Invitations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/judge-invitations/:token` | Get judge invitation details |
| POST | `/api/public/judge-invitations/:token/accept` | Accept (Clerk) |
| POST | `/api/public/judge-invitations/:token/decline` | Decline (Clerk) |

### Judging UI (Clerk session, judge role)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/hackathons/:slug/judging/assignments` | Judge's assigned submissions |
| GET | `/api/public/hackathons/:slug/judging/assignments/:id` | Full assignment with criteria/scores |
| POST | `/api/public/hackathons/:slug/judging/assignments/:id/scores` | Submit scores |
| PATCH | `/api/public/hackathons/:slug/judging/assignments/:id/notes` | Save private notes |

### Results

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/hackathons/:slug/results` | Published results (404 if not published) |

### Import (preview only)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/public/import/url` | Extract event data from any event URL (Luma supported). No auth. |

---

## Dashboard Endpoints (`/api/dashboard/*`)

Requires API key (`Authorization: Bearer sk_live_...`) or Clerk session.

### Identity

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/me` | any | Current principal info |

### Hackathon CRUD

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons` | `hackathons:read` | List organized hackathons. Query: `?q=search` |
| POST | `/dashboard/hackathons` | `hackathons:write` | Create hackathon |
| GET | `/dashboard/hackathons/:id` | `hackathons:read` | Get full hackathon details |
| DELETE | `/dashboard/hackathons/:id` | `hackathons:write` | Delete hackathon |
| PATCH | `/dashboard/hackathons/:id/settings` | `hackathons:write` | Update settings |
| PATCH | `/dashboard/hackathons/:id/phase` | `hackathons:write` | Transition phase (same effect as `settings.status`) |
| POST | `/dashboard/hackathons/:id/banner` | `hackathons:write` | Upload banner (multipart, max 50MB) |
| DELETE | `/dashboard/hackathons/:id/banner` | `hackathons:write` | Remove banner |
| GET | `/dashboard/hackathons/:id/action-items-poll` | `hackathons:read` | Organizer to-do list |
| GET | `/dashboard/hackathons/:id/live-stats` | `hackathons:read` | Real-time hackathon stats |

### Import (dashboard)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| POST | `/dashboard/import/url` | `hackathons:write` | Fetch + create in one step. Body: `{url, name?, description?}` |
| POST | `/dashboard/import/event` | `hackathons:write` | Create from already-extracted event data (used after `/public/import/url` preview) |

#### Create Hackathon Request Body

```json
{
  "name": "string (required)",
  "slug": "string (required, URL-safe)",
  "description": "string",
  "startsAt": "ISO 8601 datetime",
  "endsAt": "ISO 8601 datetime",
  "registrationOpensAt": "ISO 8601 datetime",
  "registrationClosesAt": "ISO 8601 datetime"
}
```

#### Update Settings Request Body

All fields optional:

```json
{
  "name": "string",
  "slug": "string",
  "description": "string",
  "rules": "string (markdown)",
  "status": "draft | published | registration_open | active | judging | completed | archived",
  "startsAt": "ISO 8601",
  "endsAt": "ISO 8601",
  "registrationOpensAt": "ISO 8601",
  "registrationClosesAt": "ISO 8601",
  "location": "string",
  "anonymousJudging": "boolean",
  "minTeamSize": "number",
  "maxTeamSize": "number"
}
```

### Hackathon Views (Clerk-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/hackathons/participating` | Hackathons user is participating in |
| GET | `/dashboard/hackathons/sponsored` | Hackathons sponsored by org |
| GET | `/dashboard/hackathons/judging` | Hackathons where user is a judge |

### Sponsor Management

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/sponsors` | `hackathons:read` | List sponsors |
| POST | `/dashboard/hackathons/:id/sponsors` | `hackathons:write` | Add sponsor |
| PATCH | `/dashboard/hackathons/:id/sponsors/:sid` | `hackathons:write` | Update sponsor |
| DELETE | `/dashboard/hackathons/:id/sponsors/:sid` | `hackathons:write` | Remove sponsor |
| PATCH | `/dashboard/hackathons/:id/sponsors/reorder` | `hackathons:write` | Reorder (body: `{"sponsorIds": [...]}`) |
| POST | `/dashboard/hackathons/:id/sponsors/:sid/logo` | `hackathons:write` | Upload sponsor logo |
| DELETE | `/dashboard/hackathons/:id/sponsors/:sid/logo` | `hackathons:write` | Delete sponsor logo |

#### Add Sponsor Request Body

```json
{
  "name": "string (required)",
  "tier": "gold | silver | bronze | custom",
  "customTierLabel": "string (when tier is custom)",
  "logoUrl": "string",
  "websiteUrl": "string"
}
```

### Teams

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/teams` | `hackathons:read` | List teams with members |
| POST | `/dashboard/hackathons/:id/teams` | `hackathons:write` | Create team |
| PATCH | `/dashboard/hackathons/:id/teams/:teamId` | `hackathons:write` | Update team (name, mode) |
| PATCH | `/dashboard/hackathons/:id/teams/:teamId/members` | `hackathons:write` | Add/remove members |
| POST | `/dashboard/hackathons/:id/teams/bulk-assign` | `hackathons:write` | Bulk-assign teams to rooms |

#### Create Team Request Body

```json
{
  "name": "string (required)",
  "captainEmail": "string",
  "mode": "in_person | virtual"
}
```

#### Update Members Request Body

```json
{
  "addEmails": ["alice@co.com", "bob@co.com"],
  "removeParticipantIds": ["uuid"]
}
```

### Rooms (in-person events)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/rooms` | `hackathons:read` | List rooms with assignments |
| POST | `/dashboard/hackathons/:id/rooms` | `hackathons:write` | Create room |
| PATCH | `/dashboard/hackathons/:id/rooms/:roomId` | `hackathons:write` | Update room details |
| DELETE | `/dashboard/hackathons/:id/rooms/:roomId` | `hackathons:write` | Delete room |
| POST | `/dashboard/hackathons/:id/rooms/:roomId/teams` | `hackathons:write` | Assign team to room (body: `{teamId}`) |
| DELETE | `/dashboard/hackathons/:id/rooms/:roomId/teams/:teamId` | `hackathons:write` | Unassign team |
| PATCH | `/dashboard/hackathons/:id/rooms/:roomId/teams/:teamId` | `hackathons:write` | Update assignment (slot/notes) |
| PATCH | `/dashboard/hackathons/:id/rooms/:roomId/timer` | `hackathons:write` | Update demo timer |
| POST | `/dashboard/hackathons/:id/rooms/:roomId/timer/pause` | `hackathons:write` | Pause timer |
| POST | `/dashboard/hackathons/:id/rooms/:roomId/timer/resume` | `hackathons:write` | Resume timer |

### Challenges

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/challenges` | `hackathons:read` | List challenges |
| POST | `/dashboard/hackathons/:id/challenges` | `hackathons:write` | Create challenge |
| PUT | `/dashboard/hackathons/:id/challenges/:cid` | `hackathons:write` | Update challenge (full replace) |
| DELETE | `/dashboard/hackathons/:id/challenges/:cid` | `hackathons:write` | Delete challenge |
| PUT | `/dashboard/hackathons/:id/challenges/reorder` | `hackathons:write` | Reorder (body: `{challengeIds: [...]}`) |
| POST | `/dashboard/hackathons/:id/challenge/release` | `hackathons:write` | Release the next scheduled challenge |

### Categories (challenge themes)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/categories` | `hackathons:read` | List categories |
| POST | `/dashboard/hackathons/:id/categories` | `hackathons:write` | Create category |
| PATCH | `/dashboard/hackathons/:id/categories/:categoryId` | `hackathons:write` | Update category |
| DELETE | `/dashboard/hackathons/:id/categories/:categoryId` | `hackathons:write` | Delete category |

### Announcements

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/announcements` | `hackathons:read` | List announcements |
| POST | `/dashboard/hackathons/:id/announcements` | `hackathons:write` | Create draft announcement |
| PATCH | `/dashboard/hackathons/:id/announcements/:aid` | `hackathons:write` | Update draft |
| DELETE | `/dashboard/hackathons/:id/announcements/:aid` | `hackathons:write` | Delete announcement |
| POST | `/dashboard/hackathons/:id/announcements/:aid/publish` | `hackathons:write` | Publish immediately |
| POST | `/dashboard/hackathons/:id/announcements/:aid/schedule` | `hackathons:write` | Schedule for later (body: `{publishAt}`) |
| POST | `/dashboard/hackathons/:id/announcements/:aid/unpublish` | `hackathons:write` | Unpublish |

#### Create Announcement Request Body

```json
{
  "title": "string (required)",
  "body": "string (markdown)",
  "priority": "normal | urgent",
  "audience": "all | teams | judges | sponsors"
}
```

### Event-scoped Schedule

Distinct from org-level `/dashboard/schedules` (cron jobs). These are event timeline items.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/schedule` | `hackathons:read` | List schedule items |
| POST | `/dashboard/hackathons/:id/schedule` | `hackathons:write` | Add schedule item |
| PATCH | `/dashboard/hackathons/:id/schedule/:itemId` | `hackathons:write` | Update schedule item |
| DELETE | `/dashboard/hackathons/:id/schedule/:itemId` | `hackathons:write` | Delete schedule item |

#### Schedule Item Request Body

```json
{
  "title": "string (required)",
  "description": "string",
  "startsAt": "ISO 8601 (required)",
  "endsAt": "ISO 8601 (required)",
  "location": "string",
  "type": "kickoff | workshop | meal | judging | demos | awards | other"
}
```

### Sponsor Perks

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/perks` | `hackathons:read` | List perks |
| POST | `/dashboard/hackathons/:id/perks` | `hackathons:write` | Create perk |
| PUT | `/dashboard/hackathons/:id/perks/:pid` | `hackathons:write` | Update perk |
| DELETE | `/dashboard/hackathons/:id/perks/:pid` | `hackathons:write` | Delete perk |
| POST | `/dashboard/hackathons/:id/perks/:pid/release` | `hackathons:write` | Release perk to attendees |
| POST | `/dashboard/hackathons/:id/perks-none` | `hackathons:write` | Declare "no perks this hackathon" |

#### Create Perk Request Body

```json
{
  "name": "string (required)",
  "description": "string",
  "type": "credit | api_key | coupon | custom",
  "sponsorId": "uuid",
  "code": "string (redemption code)",
  "redemptionUrl": "string",
  "instructions": "string (markdown)",
  "releaseStrategy": "immediate | manual | scheduled",
  "releaseAt": "ISO 8601 (when scheduled)"
}
```

### Mentor Requests

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/mentor-requests` | `hackathons:read` | List mentor requests with status |

### Social Submissions (working-on posts)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/social-submissions` | `hackathons:read` | List social submissions |
| PATCH | `/dashboard/hackathons/:id/social-submissions/:submissionId` | `hackathons:write` | Update status (hide/feature) |

### Email Blasts

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| POST | `/dashboard/hackathons/:id/email-blast` | `hackathons:write` | Send mass email to audience |

### Reminder Emails (post-event)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/reminders` | `hackathons:read` | List scheduled reminder emails |
| DELETE | `/dashboard/hackathons/:id/reminders/:reminderId` | `hackathons:write` | Cancel reminder |
| POST | `/dashboard/hackathons/:id/reminders/:reminderId/send` | `hackathons:write` | Send reminder now |
| GET | `/dashboard/hackathons/:id/fulfillments` | `hackathons:read` | List post-event fulfillment tasks |
| POST | `/dashboard/hackathons/:id/fulfillments/initialize` | `hackathons:write` | Generate fulfillment plan |

### Sponsor Fulfillments

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/sponsor-fulfillments` | `hackathons:read` | List sponsor post-event deliverables |
| PATCH | `/dashboard/hackathons/:id/sponsor-fulfillments/:fulfillmentId` | `hackathons:write` | Update fulfillment status |

### Judging — Prizes (primary judging unit)

Each prize is its own judging unit with embedded criteria and/or buckets.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/prizes` | `hackathons:read` | List prizes with progress |
| POST | `/dashboard/hackathons/:id/prizes` | `hackathons:write` | Create prize |
| GET | `/dashboard/hackathons/:id/prizes/:prizeId` | `hackathons:read` | Get prize |
| PATCH | `/dashboard/hackathons/:id/prizes/:prizeId` | `hackathons:write` | Update prize (incl. replace criteria/buckets) |
| DELETE | `/dashboard/hackathons/:id/prizes/:prizeId` | `hackathons:write` | Delete prize |
| POST | `/dashboard/hackathons/:id/prizes/:prizeId/assign-judge` | `hackathons:write` | Assign judge (body: `{judgeParticipantId}`) |
| DELETE | `/dashboard/hackathons/:id/prizes/:prizeId/judges/:judgeParticipantId` | `hackathons:write` | Unassign judge |
| POST | `/dashboard/hackathons/:id/prizes/:prizeId/auto-assign` | `hackathons:write` | Auto-distribute submissions (body: `{submissionsPerJudge}`) |
| POST | `/dashboard/hackathons/:id/prizes/:prizeId/calculate-results` | `hackathons:write` | Calculate ranked results |
| PUT | `/dashboard/hackathons/:id/prizes/:prizeId/buckets` | `hackathons:write` | Replace bucket definitions |

#### Create Prize Request Body

```json
{
  "name": "string (required)",
  "description": "string",
  "value": "string (e.g. '$5,000')",
  "judgingStyle": "bucket_sort | gate_check | crowd_vote | judges_pick",
  "roundId": "uuid (optional round)",
  "assignmentMode": "organizer_assigned | self_select",
  "maxPicks": "number (for judges_pick)",
  "displayOrder": "number",
  "criteria": [{"name": "Innovation", "description": "How novel..."}],
  "buckets": [
    {"level": 1, "label": "Solid", "description": "Works as expected"},
    {"level": 2, "label": "Excellent", "description": "Goes beyond"}
  ]
}
```

#### Legacy Prize Fields (edit drawer)

```json
{
  "type": "score | favorite | crowd | criteria",
  "rank": 1,
  "kind": "cash | credits | swag | opportunity",
  "monetaryValue": 5000,
  "currency": "USD",
  "distributionMethod": "paypal | stripe | wire | other"
}
```

### Judging — Prize Tracks

A group of prizes that share rounds (e.g. "Grand Prize", "Sponsor Awards").

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/prize-tracks` | `hackathons:read` | List tracks with progress |
| POST | `/dashboard/hackathons/:id/prize-tracks` | `hackathons:write` | Create track (auto-creates first round) |
| GET | `/dashboard/hackathons/:id/prize-tracks/:trackId` | `hackathons:read` | Get full track with rounds + buckets |
| PATCH | `/dashboard/hackathons/:id/prize-tracks/:trackId` | `hackathons:write` | Update track |
| DELETE | `/dashboard/hackathons/:id/prize-tracks/:trackId` | `hackathons:write` | Delete track |
| POST | `/dashboard/hackathons/:id/prize-tracks/:trackId/rounds` | `hackathons:write` | Add round to track |
| PATCH | `/dashboard/hackathons/:id/prize-tracks/:trackId/rounds/:roundId` | `hackathons:write` | Update round (style/status/advancement) |
| POST | `/dashboard/hackathons/:id/prize-tracks/:trackId/rounds/:roundId/activate` | `hackathons:write` | Activate a round for judging |
| POST | `/dashboard/hackathons/:id/prize-tracks/:trackId/rounds/:roundId/calculate-results` | `hackathons:write` | Calculate round results |
| PUT | `/dashboard/hackathons/:id/prize-tracks/:trackId/rounds/:roundId/buckets` | `hackathons:write` | Replace bucket definitions |

#### Create Prize Track Request Body

```json
{
  "name": "string (required)",
  "description": "string",
  "intent": "overall_winner | sponsor_prize | crowd_favorite | quick_comparison | custom",
  "style": "bucket_sort | gate_check | head_to_head | top_n | compliance | crowd",
  "sponsorId": "uuid (links track to sponsor)",
  "displayOrder": "number"
}
```

#### Create Round Request Body

```json
{
  "name": "string (required)",
  "style": "bucket_sort | gate_check | head_to_head | top_n | compliance | crowd | points | subjective"
}
```

### Judging — Rounds (hackathon-level, legacy)

Flat rounds not tied to a prize track. Used for the "Finalists — judges pick" preset.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/rounds` | `hackathons:read` | List all rounds |
| POST | `/dashboard/hackathons/:id/rounds` | `hackathons:write` | Create round |
| POST | `/dashboard/hackathons/:id/rounds/preset` | `hackathons:write` | Create rounds from a preset |
| POST | `/dashboard/hackathons/:id/rounds/finalists-preset` | `hackathons:write` | Legacy: "Finalists — judges pick" preset |
| PATCH | `/dashboard/hackathons/:id/rounds/:roundId` | `hackathons:write` | Update round |
| DELETE | `/dashboard/hackathons/:id/rounds/:roundId` | `hackathons:write` | Delete round (not if active) |
| POST | `/dashboard/hackathons/:id/rounds/:roundId/activate` | `hackathons:write` | Activate round |
| POST | `/dashboard/hackathons/:id/rounds/:roundId/complete` | `hackathons:write` | Mark complete |
| POST | `/dashboard/hackathons/:id/rounds/:roundId/advance` | `hackathons:write` | Advance submissions (body: `{toRoundId, submissionIds?, auto?}`) |

#### Preset Request Body

```json
{
  "preset": "shortlist | tournament | single-round",
  "advanceTopN": 10,
  "threshold": 8,
  "round1Name": "Semifinals",
  "round2Name": "Finals",
  "seedScreeningPrize": true,
  "prizeName": "Best Overall",
  "maxPicks": 1
}
```

### Judging — Judges

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/judging/judges` | `hackathons:read` | List judges with stats |
| POST | `/dashboard/hackathons/:id/judging/judges` | `hackathons:write` | Add judge (by `clerkUserId` or `email`) |
| DELETE | `/dashboard/hackathons/:id/judging/judges/:pid` | `hackathons:write` | Remove judge |
| GET | `/dashboard/hackathons/:id/judging/invitations` | `hackathons:read` | Pending judge invitations |
| DELETE | `/dashboard/hackathons/:id/judging/invitations/:iid` | `hackathons:write` | Cancel invitation |
| GET | `/dashboard/hackathons/:id/judging/user-search` | `hackathons:read` | Search users. Query: `?q=name` |
| GET | `/dashboard/hackathons/:id/judging/progress` | `hackathons:read` | Judging progress stats |

#### Add Judge Request Body

```json
{"email": "judge@example.com"}
// OR
{"clerkUserId": "user_abc123"}
```

### Judges on the Public Event Page

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/judges/display` | `hackathons:read` | List public judge cards |
| DELETE | `/dashboard/hackathons/:id/judges/display/:judgeId` | `hackathons:write` | Remove judge card |
| POST | `/dashboard/hackathons/:id/judges/display/:judgeId/headshot` | `hackathons:write` | Upload headshot |
| DELETE | `/dashboard/hackathons/:id/judges/display/:judgeId/headshot` | `hackathons:write` | Remove headshot |

### Results

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| POST | `/dashboard/hackathons/:id/results/calculate` | `hackathons:write` | Calculate rankings across all prizes |
| GET | `/dashboard/hackathons/:id/results` | `hackathons:read` | Organizer results view |
| POST | `/dashboard/hackathons/:id/results/publish` | `hackathons:write` | Make public |
| POST | `/dashboard/hackathons/:id/results/unpublish` | `hackathons:write` | Hide |

### Organization Profile

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/org-profile` | `org:read` | Get tenant profile |
| PATCH | `/dashboard/org-profile` | `org:write` | Update profile |
| GET | `/dashboard/organizations/slug-available` | Clerk-only | Check slug availability |
| GET | `/dashboard/organizations/search` | Clerk-only | Search orgs |
| POST | `/dashboard/upload-logo` | `org:write` | Upload org logo |
| DELETE | `/dashboard/logo/:variant` | `org:write` | Delete logo variant |

### Team Invitations (Clerk-only)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/dashboard/teams/:tid/invitations` | Send invitation (rate limited: 10/min) |
| GET | `/dashboard/teams/:tid/invitations` | List invitations. Query: `?status=pending` |
| DELETE | `/dashboard/teams/:tid/invitations/:iid` | Cancel invitation |

### API Keys (Clerk-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/keys` | List API keys |
| POST | `/dashboard/keys` | Create key (returns raw key once) |
| POST | `/dashboard/keys/:id/revoke` | Revoke key |

### Webhooks

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/webhooks` | `webhooks:read` | List webhooks |
| POST | `/dashboard/webhooks` | `webhooks:write` | Create webhook |
| DELETE | `/dashboard/webhooks/:id` | `webhooks:write` | Delete webhook |

### Schedules (org-level cron jobs)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/schedules` | `schedules:read` | List schedules |
| POST | `/dashboard/schedules` | `schedules:write` | Create schedule |
| GET | `/dashboard/schedules/:id` | `schedules:read` | Get schedule details |
| PATCH | `/dashboard/schedules/:id` | `schedules:write` | Update schedule |
| DELETE | `/dashboard/schedules/:id` | `schedules:write` | Delete schedule |

### Integrations (Clerk-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/integrations` | List OAuth integrations |
| GET | `/dashboard/integrations/:provider/auth-url` | Get OAuth URL |
| DELETE | `/dashboard/integrations/:provider` | Remove integration |

### Credentials (Clerk-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/credentials` | List credentials |
| POST | `/dashboard/credentials` | Save credential |
| PATCH | `/dashboard/credentials/:provider` | Update credential |
| DELETE | `/dashboard/credentials/:provider` | Delete credential |

### Jobs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/jobs` | List jobs. Query: `?limit=&offset=` |
| GET | `/dashboard/jobs/:id` | Get job details |

---

## V1 Integration Endpoints (`/api/v1/*`)

API key only. For programmatic/async operations. Deliberately narrow surface — use `/dashboard/*` endpoints for CRUD.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/v1/whoami` | any | API key identity |
| POST | `/v1/jobs` | `hackathons:write` | Create async job. Supports `Idempotency-Key` header |
| GET | `/v1/jobs/:id` | `hackathons:read` | Get job status |
| GET | `/v1/jobs/:id/result` | `hackathons:read` | Get result (202 if still running) |
| POST | `/v1/jobs/:id/cancel` | `hackathons:write` | Cancel job |
| GET | `/v1/webhooks` | `webhooks:read` | List webhooks |
| POST | `/v1/webhooks` | `webhooks:write` | Create webhook |
| DELETE | `/v1/webhooks/:id` | `webhooks:write` | Delete webhook |

---

## Webhook Events

Available events for webhook subscriptions:

| Event | Fired When |
|-------|-----------|
| `hackathon.created` | New hackathon created |
| `hackathon.updated` | Hackathon settings changed |
| `submission.submitted` | New submission created |
| `submission.updated` | Submission updated |
| `results.published` | Results made public |
| `participant.registered` | User registers for hackathon |
