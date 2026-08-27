# Oatmeal Project Shortcut: `bun run browser`

For local Oatmeal dev work, prefer the wrapper script over raw `agent-browser` commands.

```bash
bun run browser                 # opens http://localhost:3000/home
bun run browser /hackathons     # any path
bun run browser --refresh-auth  # re-save auth from the side Chrome profile
bun run browser --close         # close the oatmeal agent-browser session
bun run browser --quit-chrome   # also quit the side Chrome instance
```

## What It Does

The script at [scripts/browser.sh](../../../../scripts/browser.sh) handles the full startup sequence:

1. Verifies `localhost:3000` is up (tells you to run `bun dev` if not).
2. Launches a **dedicated side Chrome instance** with its own profile at `.auth/chrome-profile/` and `--remote-debugging-port=9222` — your main Chrome window is never touched.
3. On first run, opens `${BASE_URL}/home` in the side window and prompts you to sign in once. Auth persists in the profile for every future run.
4. On first run (or `--refresh-auth`), saves auth state to `.auth/auth.json` via `agent-browser --auto-connect state save`.
5. Closes any stale `oatmeal` session, opens the target path with `--state`, waits for `networkidle`, and prints a snapshot.

## First-Run Flow

No need to quit your main Chrome. The script launches a second Chrome with an isolated profile.

1. Run `bun run browser` — a new Chrome window opens.
2. Sign in at `${BASE_URL}/home` in that window once.
3. Press Enter in the terminal. The script saves auth state and opens the target path.
4. Future runs reuse the profile automatically — no sign-in needed.

## When to Fall Back to Raw Commands

Use raw `agent-browser` calls when the wrapper doesn't fit:

- Different session name (the wrapper always uses `oatmeal`)
- Non-localhost URL (override with `OATMEAL_BASE_URL=...` env var for a single run, or call `agent-browser` directly)
- Cloud provider (`-p agentcore`, etc.)
- Commands after launch (`snapshot`, `click`, `screenshot`) — use `agent-browser --session oatmeal <cmd>`

## Environment Overrides

| Var | Default | Purpose |
|-----|---------|---------|
| `OATMEAL_BASE_URL` | `http://localhost:3000` | Change the base URL (e.g., preview deploy) |
| `CHROME_DEBUG_PORT` | `9222` | Run the side Chrome on a different debug port |
| `CHROME_APP` | `/Applications/Google Chrome.app` | Path to Chrome.app if installed elsewhere |
| `CHROME_PROFILE_DIR` | `$PWD/.auth/chrome-profile` | Location of the dedicated profile dir |

## Testing `/manage` Routes — Active Clerk Organization Matters

Oatmeal's `/e/<slug>/manage` route returns **404** if the signed-in user's active Clerk organization doesn't match the hackathon's organizer tenant. The check (in `lib/services/manage-hackathon.ts`) is:

- If `orgId !== null` (user has an active org), the hackathon's `tenant.clerk_org_id` must equal `orgId`.
- If `orgId === null` (Personal Workspace), the hackathon's `tenant.clerk_user_id` must equal `userId`.

So even if the user owns the event under their personal account, manage will 404 while they're switched into an org context — and vice versa.

### Verify the active context before navigating to `/manage`

```bash
agent-browser --session oatmeal eval 'JSON.stringify({user: window.Clerk?.user?.id, org: window.Clerk?.organization?.id ?? null})'
```

Then look up the event's organizer in Supabase to compare:

```bash
bun -e 'import {createClient} from "@supabase/supabase-js"; const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); const {data} = await s.from("hackathons").select("slug, organizer:tenants!tenant_id(name, clerk_user_id, clerk_org_id)").eq("slug", "<slug>").single(); console.log(JSON.stringify(data, null, 2))'
```

### Switch the active org programmatically

If the active org doesn't match, switch via Clerk's JS API rather than clicking through the UI:

```bash
# Switch to a specific org (use the clerk_org_id from the query above)
agent-browser --session oatmeal eval 'window.Clerk.setActive({organization: "org_your_local_test_org"})'

# Switch to Personal Workspace
agent-browser --session oatmeal eval 'window.Clerk.setActive({organization: null})'

# Re-open the manage page after switching
bun run browser "/e/<slug>/manage?tab=judging"
```

`setActive` updates the session cookie that Next.js's `auth()` reads on the server, so the next page navigation sees the new org context.

### Quick path: seed a scenario tied to your account

`scripts/test-scenario.ts` seeds hackathons under the tenant identified by `SCENARIO_DEV_USER_ID` / `SCENARIO_ORG_ID` in `.env.local`. If you're signed in as that user and switched to that org (or Personal Workspace, if `SCENARIO_ORG_ID` is unset), `/manage` will work without any context switching.

## Auth File & Profile Security

- `.auth/chrome-profile/` holds the full signed-in Chrome profile (cookies, session, extensions).
- `.auth/auth.json` is a plaintext export of cookies/storage used by `--state`.
- `.auth/` is in `.gitignore` — never commit it.
- Delete `.auth/` when you're done to fully clear the saved session.
- Set `AGENT_BROWSER_ENCRYPTION_KEY` if you want `.auth/auth.json` encrypted at rest.
