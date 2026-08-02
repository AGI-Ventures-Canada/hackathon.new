# CLI Package

## Commands
```bash
bun cli <args>           # Run CLI from repo root (dev mode, TypeScript)
bun cli:test             # Run CLI tests
bun cli:build            # Build for npm distribution (must pass before pushing)
cd packages/cli && bun test --coverage  # Coverage report
```

## Local Development Flow

The CLI is a standalone HTTP client — it just talks to a URL. During development you run the TypeScript source directly (no build step needed):

```bash
# Terminal 1: Start the app + local Supabase
bun dev

# Terminal 2: Auth the CLI against local
bun cli login --base-url http://localhost:3000
# → Opens browser → sign in via Clerk → API key auto-created and saved

# Now run commands against your local instance
bun cli events list
bun cli prizes create <hackathon-id> --name "Best AI App"
bun cli judging judges list <hackathon-id>
```

When testing the CLI from an agent environment, use `agent-browser` to complete the browser-based Clerk sign-in flow if needed. Treat that as part of the real local login path, not as a fallback around the CLI.

The `--base-url` is saved in `~/.hackathon/config.json` after login — you only set it once. To switch back to production later, just `bun cli login` (no flag = default prod URL).

**Prerequisite:** The server must have `ENCRYPTION_KEY` set in `.env.local` (64 hex chars / 32 bytes). CLI login encrypts the generated API key before storing it in `cli_auth_sessions`. Without it, login fails with "Internal server error". Generate with `openssl rand -hex 32`.

Edit any `.ts` file in `packages/cli/src/` and re-run `bun cli` — changes are picked up instantly since Bun executes TypeScript directly.

### Testing with seeded data

```bash
bun run scripts/test-scenario.ts judging   # Seeds judges + submissions
bun cli judging judges list <hackathon-id>
bun cli judging auto-assign <hackathon-id> --per-judge 3
```

## Architecture
- `src/cli.ts` — argv dispatch → command handlers
- `src/client.ts` — HTTP client (no server imports)
- `src/config.ts` — `~/.hackathon/config.json` management
- All types are CLI-local (no imports from main app)

## App Parity

- When app behavior or API validation changes, check whether the CLI needs the same behavior
- CLI URL arguments should accept bare domains like `example.com/webhook` and normalize them before sending requests
- Changes that affect both app and CLI should include CLI tests, not just app tests

## Adding a Command
1. Create `src/commands/<resource>/<action>.ts`
2. Export `run<Action>(client, args)` function
3. Add dispatch case in `src/cli.ts`
4. Add tests in `__tests__/commands/<resource>.test.ts`
5. Update help text in `src/cli.ts`

## Environment Targets
- Local: `--base-url http://localhost:3000`
- Staging: `--base-url https://staging.hackathon.new`
- Production: default (`https://hackathon.new`)

## Build & Distribution

End users install via npm (`npx @agi-ventures-canada/hackathon-cli` or `npm install -g @agi-ventures-canada/hackathon-cli`). The build step (`bun cli:build`) uses `obuild` to bundle all TypeScript + dependencies into a single `dist/cli.mjs` file (~11 kB gzipped). Only Node.js builtins remain external — no Bun required at runtime.

```bash
bun cli:build                                    # Bundle → dist/cli.mjs
node packages/cli/bin/cli.mjs --version          # Verify built artifact
```

### Auto-publish on merge to main

The `publish-cli.yml` workflow runs on every push to `main`. It compares `packages/cli/` against the last `cli-v*` tag — if files changed, it auto-bumps the patch version, publishes to npm, and creates a new git tag. No manual tagging required.

Manual override: push a `cli-v*` tag to publish a specific version (e.g., for major/minor bumps):
```bash
# Edit packages/cli/package.json version manually first
git add packages/cli/package.json
git commit -m "chore(cli): bump version to 0.2.0"
git tag cli-v0.2.0
git push origin main --tags
```

### Authentication: Trusted Publishing (OIDC)

The workflow authenticates to npm via **Trusted Publishing** — GitHub mints a short-lived OIDC token per run, so there is **no `NPM_TOKEN` secret to manage and nothing to expire**. Publishes also get build provenance automatically.

Requirements (already configured):
- `permissions: id-token: write` on the job.
- Runner on **Node 22 + npm ≥ 11.5.1** (trusted publishing needs npm ≥ 11.5.1 / Node ≥ 22.14.0).
- A Trusted Publisher entry on the npm package (Settings → Trusted Publisher → GitHub Actions): org `AGI-Ventures-Canada`, repo `oatmeal`, workflow `publish-cli.yml`.

If the workflow filename ever changes, update the Trusted Publisher entry to match, or publishes will fail to authenticate.

## Related: Hackathon Skills

User-facing Claude Code skills for the CLI and API are maintained in the [hackathon-skills](https://github.com/AGI-Ventures-Canada/hackathon-skills) repo (not in this codebase).
