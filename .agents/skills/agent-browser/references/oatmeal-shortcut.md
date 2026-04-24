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

## Auth File & Profile Security

- `.auth/chrome-profile/` holds the full signed-in Chrome profile (cookies, session, extensions).
- `.auth/auth.json` is a plaintext export of cookies/storage used by `--state`.
- `.auth/` is in `.gitignore` — never commit it.
- Delete `.auth/` when you're done to fully clear the saved session.
- Set `AGENT_BROWSER_ENCRYPTION_KEY` if you want `.auth/auth.json` encrypted at rest.
