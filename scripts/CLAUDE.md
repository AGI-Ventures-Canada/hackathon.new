# scripts/CLAUDE.md

Developer scripts for this repo. Currently:

- [browser.sh](browser.sh) — `bun run browser` wrapper for `agent-browser` against local dev
- [test-scenario.ts](test-scenario.ts) — seeds the local DB with hackathons at specific lifecycle stages

---

## browser.sh

Wrapper for `agent-browser` that handles the full startup sequence for local UI verification. Use it via `bun run browser` — never invoke `scripts/browser.sh` directly in docs or CI.

```bash
bun run browser                 # opens http://localhost:3000/home
bun run browser /hackathons     # any path
bun run browser --refresh-auth  # re-save auth from side Chrome profile
bun run browser --close         # close the hackathon.new agent-browser session
bun run browser --quit-chrome   # also quit the side Chrome instance
```

### What it does

1. Verifies dev server is reachable at `localhost:3000` (prompts `bun dev` if not).
2. Launches a **dedicated side Chrome instance** with its own profile at `.auth/chrome-profile/` and `--remote-debugging-port=9222`. Your main Chrome window is never touched.
3. On first run, opens the side window so you can sign in once — auth persists in the profile for future runs.
4. Saves auth state to `.auth/auth.json` (first run or `--refresh-auth`) via `agent-browser --auto-connect state save`.
5. Closes any stale `hackathon.new` session, opens the target path with `--state`, waits for `networkidle`, prints a snapshot.

### Environment overrides

| Var | Default | Purpose |
|-----|---------|---------|
| `HACKATHON_BASE_URL` | `http://localhost:3000` | Change base URL (e.g., preview deploy) |
| `CHROME_DEBUG_PORT` | `9222` | Alternate debug port for the side Chrome |
| `CHROME_APP` | `/Applications/Google Chrome.app` | Path to Chrome.app |
| `CHROME_PROFILE_DIR` | `$PWD/.auth/chrome-profile` | Location of the dedicated profile |

### Notes

- `.auth/` is gitignored. It holds the signed-in Chrome profile and a plaintext `auth.json` — delete it to clear the session.
- Full agent-browser reference: [.agents/skills/agent-browser/](../.agents/skills/agent-browser/) (see `references/oatmeal-shortcut.md`).

---

## test-scenario.ts

Seeds the local database with hackathons at specific lifecycle stages.

### Usage

```bash
bun run scripts/test-scenario.ts <scenario>
```

Requires `bun dev` or local Supabase to be running.

### Available Scenarios

| Scenario | Status | Dev User State |
|----------|--------|----------------|
| `pre-registration` | published | Not registered, registration open |
| `registered-no-team` | active | Registered as participant, no team |
| `team-formed` | active | Captain with 2 members + 1 pending invite |
| `submitted` | active | Team has submitted project, ends in 2 days |
| `judging` | judging | 5 teams, 3 judges, no scores yet |
| `judging-in-progress` | judging | ~60% of assignments scored |
| `results-ready` | judging | All scored, results calculated, 3 prizes defined |
| `attendee-captain-pending-invite` | active | Captain with a pending invite to an unknown email |
| `attendee-invite-expired` | active | Captain with an invite that expired 8 days ago |
| `attendee-invite-declined` | active | Captain with a declined invite record |
| `attendee-team-at-capacity` | active | Captain of a max-size team with an extra pending invite |
| `attendee-invited-to-team` | active | Dev user has a pending invite from another captain |
| `attendee-solo-submitted` | active | Dev user registered solo and submitted |
| `attendee-submitted-then-left` | active | Dev user submitted, then left team (others remain) |
| `attendee-announcements-audiences` | active | 7 announcements, one per audience enum value (repros broken audience filter) |
| `attendee-perks-mixed` | active | Released, scheduled-future, and hidden perks |
| `attendee-winner-pending-claim` | judging | Results published, dev user's team won 1st place |

### File Structure

```
scripts/
├── test-scenario.ts           # CLI entry point
└── test-scenarios/
    ├── _helpers.ts            # Shared utilities and constants
    ├── pre-registration.ts
    ├── registered-no-team.ts
    ├── team-formed.ts
    ├── submitted.ts
    ├── judging.ts
    ├── judging-in-progress.ts
    ├── results-ready.ts
    ├── attendee-captain-pending-invite.ts
    ├── attendee-invite-expired.ts
    ├── attendee-invite-declined.ts
    ├── attendee-team-at-capacity.ts
    ├── attendee-invited-to-team.ts
    ├── attendee-solo-submitted.ts
    ├── attendee-submitted-then-left.ts
    ├── attendee-announcements-audiences.ts
    ├── attendee-perks-mixed.ts
    └── attendee-winner-pending-claim.ts
```

### _helpers.ts

Shared utilities for all scenarios:

#### Constants

- `DEV_USER_ID` - Clerk user ID for the local dev account
- `SEED_USERS` - Array of 5 fake user IDs for test participants
- `SUBMISSION_DATA` - 5 sample project titles/descriptions
- `CRITERIA_PRESETS` - Default judging criteria (Innovation, Technical Execution, Presentation)

#### Functions

| Function | Purpose |
|----------|---------|
| `promptForOptionalTenantId()` | Prompts user for optional tenant_id (press Enter for default) |
| `getOrCreateTenant(overrideTenantId?)` | Gets/creates tenant for DEV_USER_ID, or uses override if provided |
| `createTestHackathon(opts)` | Creates hackathon with given status/dates (deletes existing by slug) |
| `registerParticipant(hackathonId, userId, role)` | Registers user as participant or judge |
| `createTeamWithMembers(hackathonId, captain, members)` | Creates team and assigns members |
| `createSubmission(hackathonId, teamId, participantId, index)` | Creates submission from template |
| `addJudgingCriteria(hackathonId)` | Adds 3 default criteria, returns IDs |
| `assignJudges(hackathonId, judgeIds, submissionIds, judgeTeamIds)` | Creates judge assignments (skips own team) |
| `submitRandomScores(assignmentId, criteriaIds)` | Submits random scores 3-10 for all criteria |
| `printReady(slug, hackathonId?)` | Prints URLs to access the seeded hackathon |

### Adding a New Scenario

1. Create `scripts/test-scenarios/<name>.ts`
2. Import helpers from `./_helpers`
3. Define a unique `SLUG` constant (e.g., `"test-<name>"`)
4. Implement `async function run()` that sets up the scenario
5. Call `printReady(SLUG)` at the end
6. Add the scenario name to the `scenarios` array in `test-scenario.ts`

#### Template

```typescript
import {
  getOrCreateTenant,
  createTestHackathon,
  DEV_USER_ID,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-my-scenario"

async function run() {
  console.log("Setting up my-scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)
  const now = new Date()

  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "My Scenario Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 7 * 86400000),
  })

  // Add scenario-specific setup here

  console.log("Description of what was set up.")
  printReady(SLUG, hackathonId)
}

run().catch(console.error)
```

### Required Environment Variables

The admin scenario runner (UI at `/admin/scenarios`, API at `/api/admin/scenario-run/:name`) requires:

| Variable | How to set |
|----------|-----------|
| `SCENARIO_ORG_ID` | Clerk Dashboard → Organizations → copy the org ID of your dev/staging org |
| `SCENARIO_DEV_USER_ID` | Run `bun run scripts/provision-test-users.ts` — it writes this and the seed user IDs to `.env.local` automatically |

These are separate from the legacy CLI scripts in this directory, which resolve the dev user tenant via Supabase directly.

### Notes

- Each scenario prompts for an optional organizer tenant_id (press Enter for default dev user tenant)
- Each scenario deletes any existing hackathon with the same slug before creating
- Scenarios use predictable slugs (`test-<name>`) for easy URL access
- Judging scenarios assign DEV_USER_ID as both participant and judge to test dual roles
