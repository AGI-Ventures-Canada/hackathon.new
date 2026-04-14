# Supabase Development Guide

This document covers Supabase setup, database development, and migrations for the oatmeal project.

## CRITICAL: Service Key Only Access

**This project uses ONLY the Supabase service role key to access data.**

- RLS is enabled on all tables with DENY ALL policies
- The service role key bypasses RLS, allowing application access
- No other clients (anon key, user tokens) can read/write data
- Auth and permissions are handled in the application layer, not RLS

**Why:**
- Simpler permission model (one place for auth logic)
- Clerk handles user authentication
- API keys handle integration authentication
- Application code enforces tenant isolation

## CRITICAL: Never Push to Main

**NEVER develop on `main`. NEVER push directly to `main`.**

Database migrations pushed directly to `main` will immediately run on PRODUCTION.

**Safe workflow:**

1. Create feature branch: `git checkout -b feature/your-feature`
2. Add/edit migrations on the feature branch
3. Test locally: `supabase db reset`
4. Push to feature branch: `git push -u origin feature/your-feature`
5. Open PR → Supabase creates preview database branch
6. Test migrations on preview branch
7. Merge PR → migrations deploy to production safely

## CRITICAL: Never Apply Migrations Directly to Production

**NEVER use `mcp__supabase__apply_migration` or `supabase db push` directly on production.**

- All database migrations MUST go through the PR workflow
- Create migration files locally → commit to feature branch → PR → merge
- When PR merges, Supabase automatically applies the migration

**FORBIDDEN:**

- `mcp__supabase__apply_migration` on production project
- `supabase db push` to production
- Running DDL via MCP `execute_sql` on production

**ALLOWED:**

- `mcp__supabase__execute_sql` for SELECT queries (read-only investigation)
- `mcp__supabase__execute_sql` for emergency data fixes (with explicit user approval)

## Local Database Development

When developing locally, `bun dev` automatically starts local Supabase and configures the app.

**Commands:**

```bash
bun dev              # Start dev server (auto-starts local Supabase)
bun dev:fresh        # Reset DB + start dev server (clean slate)
bun db:sync          # Reset DB, replay migrations + seed, regenerate types
bun update-types     # Regenerate TypeScript types from local DB
```

**Applying migrations:**

```bash
bun db:sync           # Reset DB, replay migrations + seed, regenerate types (recommended)
supabase db reset     # Reset DB and replay migrations + seed (no type generation)
supabase migration up # Apply only pending migrations (preserves data)
```

**Capturing UI changes:**

If schema changes are made via Supabase Studio (localhost:54323):

```bash
bun db:diff descriptive_migration_name
```

## TypeScript Type Generation

Types are auto-generated from the local database schema.

**Location:** `lib/db/types.ts`

**Manual generation:**

```bash
bun update-types           # From local database
bun update-types:remote    # From remote (requires PROJECT_REF)
```

**Usage:**

```typescript
import { Database, Tables } from "@/lib/db/types";

type Agent = Tables<"agents">;
type Tenant = Tables<"tenants">;
```

## Migration Best Practices

- **Use `IF NOT EXISTS`** in CREATE statements
- **Timestamp prefix format**: `YYYYMMDDHHMMSS_description.sql`
- **Migration order matters**: Files run sequentially by timestamp
- **Seed data**: Goes in `supabase/seed.sql`, not in migrations

## Seed Data Organization

Seed data is organized in modular files under `supabase/seeds/` for maintainability:

```
supabase/seeds/
├── 01_tenants.sql              # Base tenants (orgs and users)
├── 02_api_keys_and_audit.sql   # API keys and audit logs
├── 03_hackathons_demo.sql      # Demo org hackathons
├── 04_hackathons_agi_ventures.sql
├── 05_hackathons_agi_house.sql
├── 06_hackathons_other_orgs.sql
├── 07_sponsors.sql             # Hackathon sponsors
├── 08_participants_dev_user.sql
├── 09_participants_seed.sql
├── 10_participants_agi_house.sql
├── 11_teams.sql
├── 12_teams_agi_house.sql
├── 13_team_assignments.sql
├── 14-19_submissions_*.sql     # Project submissions
```

**Files are numbered by foreign key dependencies** - tenants first, then hackathons, then participants, etc.

**Editing seed data:**

1. Edit the appropriate file in `supabase/seeds/`
2. Regenerate seed.sql: `cat supabase/seeds/*.sql > supabase/seed.sql`
3. Test with `supabase db reset`

**Important:** Supabase runs `seed.sql` directly - it doesn't support psql `\ir` includes. The `seed.sql` file must contain the concatenated content.

## When Creating New Tables

Always add RLS with DENY ALL policy so application can bypass using service key:

```sql
CREATE TABLE IF NOT EXISTS new_table (...);

ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to new_table" ON new_table FOR ALL USING (false);
```

## Auto-seeded Agenda Items

A PostgreSQL AFTER INSERT trigger (`trg_hackathon_seed_agenda`) on the `hackathons` table automatically creates 6 default agenda items for every new hackathon: Opening Kickoff, Challenge Release, Hacking Begins, Submissions Close, Presentations, and Awards Ceremony. The trigger function `seed_default_agenda_items()` derives times from `starts_at` / `ends_at` (with fallback defaults if null).

**Do not manually insert default agenda items in application code** — the trigger handles all creation paths including seed data, imports, and test scenarios. The `challenge_release` and `submission_deadline` items use `ON CONFLICT DO NOTHING` via the partial unique index to stay idempotent.

## Supabase Branching

**Docs:** https://supabase.com/docs/guides/deployment/branching

When you push a feature branch to GitHub, Supabase creates a preview database branch.

**Key Points:**

- Preview branches start EMPTY - no production data
- Migrations in `supabase/migrations/` run automatically
- `supabase/seed.sql` seeds test data (preview only)
- Each branch has its own API credentials (project ref, anon key, service key)

### Branch Types

**Ephemeral Branches (Default):**
- Created automatically when PR is opened
- Deleted when PR is merged or closed
- Used for feature development and testing

**Persistent Branches:**
- Long-lived branches that survive PR merges
- Ideal for staging/QA environments
- Data persists between deployments
- Configure in Supabase Dashboard → Branches → Create persistent branch

### Persistent Staging Branch

To set up a persistent staging environment:

1. Go to Supabase Dashboard → Your Project → Branches
2. Click "Create branch" → Select "Persistent"
3. Name it `staging` (or match your git branch name)
4. The branch will have its own:
   - Database with persistent data
   - Unique project ref and API keys
   - Independent from production

**Staging workflow:**
```
feature branch → PR to staging → test on staging branch
staging → PR to main → deploy to production
```

**Environment variables for staging:**
- `SUPABASE_URL` - staging branch URL
- `SUPABASE_ANON_KEY` - staging anon key
- `SUPABASE_SERVICE_ROLE_KEY` - staging service key

### Branch Commands

```bash
# List all branches
supabase branches list

# Create a branch locally (linked to git branch)
supabase branches create <branch-name>

# Delete a branch
supabase branches delete <branch-name>

# Get branch credentials
supabase branches get <branch-name>
```

## Project Info

- **Project ID:** udrmzihwkxnbkqpvphsx
- **Organization:** Cats with Bats
- **Region:** us-east-1

## Documentation

- [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-init)
- [Branching](https://supabase.com/docs/guides/deployment/branching)
- [GitHub Integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Type Generation](https://supabase.com/docs/guides/api/rest/generating-types)
