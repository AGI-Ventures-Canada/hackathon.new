---
name: local-dev-setup
description: Helps set up the local development environment for hackathon.new. Use when someone asks how to run the project locally, set up local database, start local Supabase, configure .env or environment variables, get env keys, run dev server, install dependencies, or troubleshoot local setup issues.
allowed-tools: Read Glob Bash(bun:*) Bash(bunx:*) Bash(supabase:*) Bash(git:*) Bash(which:*) Bash(brew:*) Bash(node:*) Bash(npx:*) Bash(docker:*) Bash(curl:*) Bash(open:*) Bash(cat:*) Bash(cp:*) Bash(ls:*) Bash(lsof:*) Bash(kill:*) Bash(rm:-rf node_modules*)
metadata:
  internal: true
---

# Developer Onboarding

Guide new developers through setting up hackathon.new interactively. Work through each step, verify completion, and troubleshoot issues as they arise.

## Automated Setup

Run all prerequisite checks and guide the developer step-by-step:

### Step 1: Check Prerequisites

Run these commands to verify the developer has required tools:

```bash
bun --version       # Need Bun 1.0+
node --version      # Need Node.js 20.9+ (for Next.js 16)
supabase --version  # Need Supabase CLI
docker info         # Need Docker running (for local Supabase)
```

**If missing tools, install them:**

| Tool | Install Command |
|------|-----------------|
| Bun | `curl -fsSL https://bun.sh/install \| bash` or `brew install oven-sh/bun/bun` |
| Node.js | `brew install node@20` or [nodejs.org](https://nodejs.org) (v20.9+) |
| Supabase CLI | `brew install supabase/tap/supabase` |
| Docker | [Docker Desktop](https://www.docker.com/products/docker-desktop) |

### Step 2: Install Dependencies

```bash
bun install
```

Verify: Check that `node_modules` directory exists and has content.

### Step 3: Environment Setup

Copy the example env file:

```bash
cp .env.example .env.local
```

Required environment variables:

```bash
# Clerk (authentication)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...

# API Key hashing (required for creating/verifying API keys)
API_KEY_SECRET=<generate-with-openssl>

# Encryption (required for CLI auth — encrypts API keys stored in cli_auth_sessions)
ENCRYPTION_KEY=<generate-with-openssl>

# Admin portal (optional — enables /admin god mode)
ADMIN_ENABLED=true

# Resend (email sending)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@hackathon.new

# App URL (used for email links, invite URLs, etc.)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Tavily (optional - enables rich content extraction from Luma event pages)
# Without this, Luma imports still work but won't extract sponsors, rules, or prizes
TAVILY_API_KEY=tvly-...

# Supabase (auto-filled by bun dev for local)
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
```

**Get Clerk keys from:** https://dashboard.clerk.com → API Keys. Get `CLERK_WEBHOOK_SIGNING_SECRET` from the Clerk webhook endpoint configured for `POST /api/webhooks/clerk` and the `email.created` event.

**Generate API_KEY_SECRET and ENCRYPTION_KEY:** Both are 32-byte hex secrets. `API_KEY_SECRET` hashes API keys before storing them. `ENCRYPTION_KEY` encrypts API keys in CLI auth sessions (required for `hackathon login` to work). Generate both with:

```bash
echo "API_KEY_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local
```

**Admin portal access** requires two things: (1) `ADMIN_ENABLED=true` in `.env.local`, and (2) the Clerk user must have `{ "admin": true }` in their public metadata. Set this in Clerk Dashboard > Users > your user > Public metadata. The Clerk session token template must also map `"metadata": "{{user.public_metadata}}"` under Configure > Sessions > Customize session token for the claims to reach the app.

**Supabase keys are auto-configured** when running `bun dev` (local Supabase).

### Step 4: Start Development Server

```bash
bun dev
```

This will automatically:
1. Start local Supabase (if not running)
2. Configure `.env.local` with local Supabase credentials
3. Generate TypeScript types from database
4. Start Next.js dev server

First run may take a few minutes to download Supabase containers.

### Step 5: Verify Everything Works

Open these URLs to verify the setup:

| URL | Expected Result |
|-----|-----------------|
| http://localhost:3000 | App loads (may redirect to sign-in) |
| http://localhost:3000/docs | API documentation site |
| http://localhost:3000/api/swagger | API reference (Swagger UI) |
| http://localhost:3000/api/public/health | `{"status":"ok","timestamp":"..."}` |
| http://localhost:54423 | Supabase Studio |

Test the health endpoint:

```bash
curl http://localhost:3000/api/public/health
```

### Step 6: Run Tests

```bash
bun test
```

All tests should pass before making changes. Target: 90% code coverage.

### Step 7: Git Workflow Introduction

Read the project's git workflow from CLAUDE.md:

- **Never push directly to main** - always use feature branches
- Create PRs as drafts first
- Follow conventional commit format

Create your first feature branch:

```bash
git checkout -b feature/your-feature-name
```

## Quick Reference

### Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Start dev server (auto-starts local Supabase) |
| `bun dev:fresh` | Reset database + start dev server (clean slate) |
| `bun run build` | Production build |
| `bun test` | Run tests |
| `bun lint` | Run ESLint |
| `bun db:sync` | Reset DB + regenerate types |
| `bun db:diff name` | Capture Studio changes as migration |
| `bun update-types` | Regenerate TypeScript types |

### Local URLs

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| API Documentation | http://localhost:3000/docs |
| API Swagger | http://localhost:3000/api/swagger |
| Health Check | http://localhost:3000/api/public/health |
| LLMs.txt | http://localhost:3000/llms.txt |
| Supabase Studio | http://localhost:54423 |
| Supabase API | http://localhost:54321 |
| Inbucket (email) | http://localhost:54424 |

## Project Structure

```
app/                    # Next.js App Router pages
├── (auth)/             # Auth pages (sign-in, sign-up)
├── (dashboard)/        # Dashboard pages (agents, jobs, keys)
├── docs/               # SDK documentation (Fumadocs)
└── api/                # API routes (Elysia)

lib/                    # Core libraries
├── api/                # Elysia API routes
├── agents/             # AI agent utilities
├── ai/                 # AI SDK configuration
├── db/                 # Database client and types
├── email/              # Email handling (Resend)
├── integrations/       # OAuth integrations
├── sandbox/            # Daytona sandbox management
├── services/           # Business logic services
└── workflows/          # Workflow DevKit agents

content/docs/           # API documentation MDX files
supabase/               # Database migrations and config
```

## Documentation Development

Documentation lives in `content/docs/` as MDX files.

### Adding a New Doc Page

1. Create `content/docs/your-page.mdx`:
```mdx
---
title: Your Page Title
description: Brief description
---

Your content here with **markdown** support.
```

2. Update `content/docs/meta.json` to add to navigation

### Using Components

```mdx
<Tabs items={['npm', 'pnpm', 'bun']} persist groupId="package-manager">
  <Tab value="npm">npm install package</Tab>
  <Tab value="pnpm">pnpm add package</Tab>
  <Tab value="bun">bun add package</Tab>
</Tabs>

<Callout type="warn">
Warning message here
</Callout>
```

## Database Development

### Fresh Start (Clean Database)

```bash
bun dev:fresh
```

This resets the database, runs all migrations, seeds test data, and starts the dev server.

### After Schema Changes

If you modified migrations or made changes in Supabase Studio:

```bash
bun db:sync  # Reset + regenerate types
```

### Capturing UI Changes as Migrations

If you made schema changes via Supabase Studio:

```bash
bun db:diff descriptive_migration_name
```

This creates a migration file in `supabase/migrations/`.

### Creating New Tables

Always add RLS with DENY ALL policy:

```sql
CREATE TABLE new_table (...);

ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access" ON new_table FOR ALL USING (false);
```

## Troubleshooting

### API key creation fails (500 error)
If creating API keys fails with a 500 error, `API_KEY_SECRET` is likely missing from `.env.local`. Generate one:
```bash
echo "API_KEY_SECRET=$(openssl rand -hex 32)" >> .env.local
```
Restart the dev server after adding.

### CLI login fails ("Authorization Failed / Internal server error")
If `hackathon login` opens the browser but shows "Authorization Failed — Internal server error", `ENCRYPTION_KEY` is missing from `.env.local`. The CLI auth flow encrypts API keys before storing them in `cli_auth_sessions`, and this requires a 32-byte hex key:
```bash
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local
```
Restart the dev server after adding.

### Port 3000 already in use
```bash
lsof -i :3000
kill -9 <PID>
```

### Bun install fails
```bash
rm -rf node_modules bun.lock
bun install
```

### Docker not running
```bash
open -a Docker  # macOS
# Wait for Docker to start, then retry bun dev
```

### Supabase containers fail to start
```bash
supabase stop
docker system prune -f  # Clean up old containers
supabase start
```

### Supabase connection issues
- Check `.env.local` has correct credentials
- For local: ensure `supabase start` succeeded
- For remote: verify project is not paused in dashboard

### TypeScript errors after schema changes
```bash
bun update-types  # Regenerate types from local DB
```

### Migration conflicts
```bash
bun dev:fresh  # Nuclear option: reset everything
```

### Build fails with type errors
```bash
bun run build  # Check exact error
bunx tsc --noEmit  # TypeScript check only
```

## Next Steps After Setup

1. Read `CLAUDE.md` for project conventions
2. Browse `/docs` for API documentation
3. Explore `/api/swagger` for API reference
4. Read domain docs in `lib/*/CLAUDE.md` for specific patterns
5. Create a feature branch and start coding!
