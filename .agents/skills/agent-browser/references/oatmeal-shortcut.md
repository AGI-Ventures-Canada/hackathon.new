# Oatmeal Project Shortcut: `bun run browser`

For local Oatmeal dev work, prefer the wrapper script over raw `agent-browser` commands.

```bash
bun run browser                 # opens http://localhost:3000/home with your Chrome auth
bun run browser /hackathons     # any path
bun run browser --refresh-auth  # re-save auth from running Chrome
bun run browser --close         # close the oatmeal session
```

## What It Does

The script at [scripts/browser.sh](../../../../scripts/browser.sh) handles the full startup sequence:

1. Verifies `localhost:3000` is up (tells you to run `bun dev` if not).
2. Verifies Chrome is running with `--remote-debugging-port=9222` (prints the exact relaunch command if not).
3. On first run (or `--refresh-auth`), saves auth state from your real Chrome to `.auth/auth.json` via `agent-browser --auto-connect state save`.
4. Closes any stale `oatmeal` session, opens the target path with `--state`, waits for `networkidle`, and prints a snapshot.

## First-Run Prereq

Quit Chrome fully (⌘Q), then relaunch it with:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Sign in at `localhost:3000/home` once — the script imports that session.

## When to Fall Back to Raw Commands

Use raw `agent-browser` calls when the wrapper doesn't fit:

- Different session name (the wrapper always uses `oatmeal`)
- Non-localhost URL (override with `OATMEAL_BASE_URL=...` env var, or call `agent-browser` directly)
- Cloud provider (`-p agentcore`, etc.)
- Commands after launch (`snapshot`, `click`, `screenshot`) — use `agent-browser --session oatmeal <cmd>`

## Environment Overrides

| Var | Default | Purpose |
|-----|---------|---------|
| `OATMEAL_BASE_URL` | `http://localhost:3000` | Change the base URL (e.g., preview deploy) |
| `CHROME_DEBUG_PORT` | `9222` | If you run Chrome on a different debug port |

## Auth File Security

`.auth/auth.json` contains session tokens in plaintext. `.auth/` is in `.gitignore`. Delete the file when you're done, or set `AGENT_BROWSER_ENCRYPTION_KEY` for encryption at rest.
