# Hackathon API — Complete Endpoint Reference

All endpoints use JSON request/response bodies unless noted. Authentication via `Authorization: Bearer sk_live_...` header.

## Base URL

```
Local:      http://localhost:3000
Production: https://your-domain.com
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

### Import

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/public/import/luma` | Extract event data from Luma page |

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
| PATCH | `/dashboard/hackathons/:id/settings` | `hackathons:write` | Update settings |
| POST | `/dashboard/hackathons/:id/banner` | `hackathons:write` | Upload banner (multipart, max 50MB) |
| DELETE | `/dashboard/hackathons/:id/banner` | `hackathons:write` | Remove banner |
| POST | `/dashboard/import/luma` | `hackathons:write` | Create from Luma event |

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

### Judging Criteria

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/judging/criteria` | `hackathons:read` | List criteria |
| POST | `/dashboard/hackathons/:id/judging/criteria` | `hackathons:write` | Create criterion |
| PATCH | `/dashboard/hackathons/:id/judging/criteria/:cid` | `hackathons:write` | Update criterion |
| DELETE | `/dashboard/hackathons/:id/judging/criteria/:cid` | `hackathons:write` | Delete criterion |

#### Create Criterion Request Body

```json
{
  "name": "string (required)",
  "description": "string",
  "maxScore": "number (required, e.g. 10)",
  "weight": "number (default 1.0)",
  "displayOrder": "number"
}
```

### Judge Management

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/judging/judges` | `hackathons:read` | List judges with stats |
| POST | `/dashboard/hackathons/:id/judging/judges` | `hackathons:write` | Add judge (by `clerkUserId` or `email`) |
| DELETE | `/dashboard/hackathons/:id/judging/judges/:pid` | `hackathons:write` | Remove judge |
| GET | `/dashboard/hackathons/:id/judging/invitations` | `hackathons:read` | Pending judge invitations |
| DELETE | `/dashboard/hackathons/:id/judging/invitations/:iid` | `hackathons:write` | Cancel invitation |
| GET | `/dashboard/hackathons/:id/judging/user-search` | `hackathons:read` | Search users. Query: `?q=name` |

#### Add Judge Request Body

```json
{"email": "judge@example.com"}
// OR
{"clerkUserId": "user_abc123"}
```

### Judging Assignments

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/judging/assignments` | `hackathons:read` | List all assignments with progress |
| POST | `/dashboard/hackathons/:id/judging/assignments` | `hackathons:write` | Manual assign |
| DELETE | `/dashboard/hackathons/:id/judging/assignments/:aid` | `hackathons:write` | Remove assignment |
| POST | `/dashboard/hackathons/:id/judging/auto-assign` | `hackathons:write` | Auto-distribute submissions |

#### Auto-Assign Request Body

```json
{"submissionsPerJudge": 5}
```

### Prize Management

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/hackathons/:id/prizes` | `hackathons:read` | List prizes |
| POST | `/dashboard/hackathons/:id/prizes` | `hackathons:write` | Create prize |
| PATCH | `/dashboard/hackathons/:id/prizes/:pid` | `hackathons:write` | Update prize |
| DELETE | `/dashboard/hackathons/:id/prizes/:pid` | `hackathons:write` | Delete prize |
| POST | `/dashboard/hackathons/:id/prizes/:pid/assign` | `hackathons:write` | Assign to submission |
| DELETE | `/dashboard/hackathons/:id/prizes/:pid/assign/:sid` | `hackathons:write` | Unassign from submission |

#### Create Prize Request Body

```json
{
  "name": "string (required)",
  "description": "string",
  "value": "string (e.g. '$5,000')",
  "displayOrder": "number"
}
```

#### Assign Prize Request Body

```json
{"submissionId": "uuid"}
```

### Results

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| POST | `/dashboard/hackathons/:id/results/calculate` | `hackathons:write` | Calculate rankings |
| GET | `/dashboard/hackathons/:id/results` | `hackathons:read` | Get detailed results (organizer view) |
| POST | `/dashboard/hackathons/:id/results/publish` | `hackathons:write` | Make results public |
| POST | `/dashboard/hackathons/:id/results/unpublish` | `hackathons:write` | Hide results |

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

### Schedules

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

API key only. For programmatic/async operations.

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
