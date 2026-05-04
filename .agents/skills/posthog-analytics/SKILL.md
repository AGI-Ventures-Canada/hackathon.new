---
name: posthog-analytics
description: PostHog analytics setup, patterns, and troubleshooting for the Oatmeal platform. Use when debugging missing PostHog events, adding new tracked events, modifying the /t proxy, or troubleshooting analytics on production.
allowed-tools: Read Glob Grep Bash(curl:*) Bash(vercel:*) Bash(git:*) Bash(bun:*) Write Edit
metadata:
  internal: true
---

# PostHog Analytics

## Architecture

PostHog is integrated at three levels:

1. **Client-side (browser)** — `instrumentation-client.ts` initializes `posthog-js` using the Next.js 15.3+ pattern. Auto-captures pageviews, clicks, and page leaves.
2. **User identification** — `components/posthog-provider.tsx` links Clerk auth to PostHog via `posthog.identify()` on sign-in and `posthog.reset()` on sign-out.
3. **Server-side** — `lib/analytics/posthog.ts` uses `posthog-node` to track conversion events (hackathon created, registration, submission) and API usage (CLI vs direct).

## Key Files

| File | Purpose |
|------|---------|
| `instrumentation-client.ts` | Client-side PostHog init (Next.js 15.3+ pattern) |
| `components/posthog-provider.tsx` | Clerk user identification + `PostHogProvider` wrapper |
| `lib/analytics/posthog.ts` | Server-side tracking (`trackEvent`, `identifyUser`, `isCliRequest`) |
| `next.config.ts` | `/t` rewrites to proxy PostHog through our domain |
| `proxy.ts` | Excludes `/t` from Clerk middleware |

## Proxy Setup

PostHog requests are proxied through `/t/*` to bypass ad blockers:

```
/t/static/*  →  https://us-assets.i.posthog.com/static/*
/t/*         →  https://us.i.posthog.com/*
```

Configured in `next.config.ts` rewrites. The `/t` path is excluded from Clerk middleware in `proxy.ts`.

**Critical: `skipTrailingSlashRedirect: true`** must be set in `next.config.ts`. Without it, Vercel 308-redirects `/t/e/` → `/t/e`, which drops the POST body and silently loses all events.

## Environment Variables

| Variable | Where | Value |
|----------|-------|-------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Vercel Production only | `phc_aqn8c...` (from PostHog dashboard) |

**Do NOT set in `.env.local`** — local dev should not track. Do NOT set for Preview/Staging.

The host is not needed as an env var — the `/t` proxy path is hardcoded.

## CLI Tracking

The CLI sends `User-Agent: hackathon-cli/<version>` on all requests. Server-side v1 routes detect this via `isCliRequest(request)` from `lib/analytics/posthog.ts` and tag events with `source: "cli"` vs `source: "api"`.

No PostHog SDK or env vars are needed in the CLI package.

## Troubleshooting

### No events showing in PostHog dashboard

1. **Check the env var is set on Vercel Production (no trailing newline!):**
   ```bash
   vercel env ls | grep POSTHOG
   # Verify no trailing \n:
   vercel env pull /tmp/check --environment production && grep POSTHOG /tmp/check && rm /tmp/check
   ```
   **CRITICAL: When setting env vars via `vercel env add`, always pipe with `printf` not `echo`.**
   `echo` adds a trailing newline that gets baked into the JS bundle, making the API key invalid.
   ```bash
   # GOOD
   printf "phc_abc123" | vercel env add NEXT_PUBLIC_POSTHOG_KEY production
   # BAD — adds \n to the key
   echo "phc_abc123" | vercel env add NEXT_PUBLIC_POSTHOG_KEY production
   ```

2. **Check the key is baked into the client JS bundle:**
   ```bash
   curl -sL https://www.getoatmeal.com | grep -o '/_next/static/chunks/[^"]*\.js[^"]*' | while read chunk; do
     result=$(curl -sL "https://www.getoatmeal.com${chunk}" 2>&1 | grep -c 'phc_')
     if [ "$result" -gt "0" ]; then echo "Key found in $chunk"; break; fi
   done
   ```
   If not found, the env var was added after the last build. Trigger a redeploy: `vercel --prod`

3. **Check the /t proxy returns 200:**
   ```bash
   curl -s "https://www.getoatmeal.com/t/decide" | head -20
   ```
   Should return JSON from PostHog, not a redirect or error.

4. **Test sending an event directly:**
   ```bash
   curl -s -X POST "https://www.getoatmeal.com/t/e" \
     -H "Content-Type: application/json" \
     -d '{"api_key":"YOUR_KEY","event":"test","properties":{"distinct_id":"debug"}}'
   ```
   Should return `{"status":"Ok"}`. If you get `Redirecting...`, the trailing slash redirect fix is missing.

5. **Check for trailing slash redirects:**
   ```bash
   curl -sI -X POST "https://www.getoatmeal.com/t/e/" | grep -i "HTTP\|location"
   ```
   If you see a 308 redirect, `skipTrailingSlashRedirect: true` is missing from `next.config.ts`.

6. **Ad blockers** — Even with the proxy, some aggressive blockers detect PostHog by JS patterns. Test in incognito with extensions disabled.

### Events show but no user identification

- Check that Clerk is loaded and the user is signed in
- `PostHogIdentifier` in the provider watches `useAuth()` / `useUser()` and calls `posthog.identify(userId)` on sign-in
- Verify in browser console: `posthog.get_distinct_id()` should return the Clerk user ID after sign-in

### Server-side events not appearing

- `NEXT_PUBLIC_POSTHOG_KEY` must also be available server-side (it is, since Next.js exposes `NEXT_PUBLIC_*` to both)
- Server events include `environment` property from `VERCEL_ENV` — filter by this in PostHog
- Check that `trackEvent()` is being called (it's fire-and-forget, won't throw on failure)
