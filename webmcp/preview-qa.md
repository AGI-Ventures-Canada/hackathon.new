# WebMCP hosted preview QA

Use only the ready Vercel deployment for PR #468:

`https://oatmeal-git-feature-webmcp-organizer-tools-agi-ventures-canada.vercel.app`

Do not run the app, Supabase, scenarios, or localhost browser checks for this delivery. Use synthetic preview data on the ready deployment only. Verify the matrix once in Codex's built-in browser and once in a dedicated Chrome profile so Chrome's native WebMCP connection is covered without touching a personal browsing session.

## Private judging access

Do not commit passwords or session links here. Put the following synthetic access details in Devpost's private judging instructions after the preview accounts are verified:

| Role | Private value needed |
|---|---|
| Organizer | Event URL, synthetic email, one-time or rotated password |
| Attendee captain | Event URL, synthetic email, one-time or rotated password |
| Judge | Judge URL, synthetic email, one-time or rotated password |
| Mentor | Mentor URL, synthetic email, one-time or rotated password |

Record the handoff owner and rotation date in the private submission record. Rotate these credentials after judging. Never use a customer, contact, or team member's normal account.

## Matrix

| Surface | States to prove | Required evidence |
|---|---|---|
| Create/import | Signed out, refresh, two tabs, sign-in/sign-up/SSO continuation, organization setup, full review, one human create click, failed navigation recovery | Tool list, visible field changes, no lost draft, safe conflict/retry link, one create request, no duplicate child records |
| Public event | Visitor, unregistered attendee, captain, pending team, submitted project | Dynamic tool list, published-only guide, invitation/project preparation, human final actions |
| Organizer | Draft, registration, active, judging, completed, stale event version | Correct tool appearance/removal, optimistic visible edits, server `409 event_changed`, no email or publish side effect |
| Judge | Weighted score, judges' picks, bucket sort, gate checks, anonymous mode | Only the matching prepare tool, opaque refs, no hidden identity, zero prepare requests, one human save request |
| Mentor | Public counts, verified queue, open, claimed by me, claimed by someone else, claim race | No public request text, exact role check, human claim/finish, stable conflict codes |
| Sponsor | Signed out, verified sponsor, assigned prize, pending claim, fulfilled claim | Published-only data, exact sponsor access, no other sponsor details, human claim/fulfillment actions |
| Email and cron | Draft queue, go-live flush, provider failure, retry, ended event, duplicate cron invocation, bad cron auth | Accurate queued/sent copy, no draft or ended-event send, stable provider key, bounded retry, partial failure surfaced |
| Browser lifecycle | Navigation, role change, event lifecycle change, refresh, 375px viewport | Exact-host `Origin-Trial` response header, origin isolation, tool unregistration, no stale execution, visible UI match, no console errors, expected network only |

## Network rules

- Project, judge, mentor, invitation, and event-create preparation makes zero requests.
- One human final click makes exactly one request.
- Never send a real invitation, publish real results, or load customer/contact data.
- Capture the URL, deployment commit, role, lifecycle, tool call/result, visible UI, console, and network result for each row.
- In native Chrome, evaluate `await document.modelContext.getTools()` and then `await document.modelContext.executeTool(tool, JSON.stringify(args))`. If a wrapper times out, repeat through raw DevTools evaluation with `awaitPromise: true` before treating it as an app failure.
