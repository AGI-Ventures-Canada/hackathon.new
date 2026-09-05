# Judging experience implementation register

Approved scope: prizes-first organizer setup, dedicated judging pages, contextual action editors, fast Clerk invitations, assigned project queues, recoverable review drafts, separate judging dates, email/in-app cadence, and app/WebMCP/CLI parity.

UI verification uses the exact PR Vercel preview. Do not start a local app server: the user reported local memory exhaustion. Local database reset/type generation is authorized.

| Finding / acceptance | Implementation | Verification |
| --- | --- | --- |
| Review drafts survive navigation, refresh, offline and conflicts | `use-judging-review`, versioned draft API, browser recovery, SQL revision checks | Autosave/service regressions pass; live replay pending |
| Submitted reviews and prefetch remain consistent | Atomic publication preserves submitted answer until explicit submission; stale acknowledgments retain newer edits | Autosave and legacy mounted scoring API regressions pass |
| Keyboard controls and out-of-order project loads are safe | Review state keyed by assignment/ballot; request cancellation and response guards; text/slider key isolation | Judge workspace and review regressions pass; hosted keyboard journey pending |
| Criteria changes preserve scores; incompatible edits freeze | Preserve criterion/bucket IDs; SQL freezes scored configuration and eligibility | Scoring service/editor regressions pass; migration replay pending |
| Prize setup works after publication before scoring locks | Canonical prize service permits setup until submitted scoring/publication locks | Prize service and mounted API tests pass |
| Scoped weighted assignments and balanced distribution | Shared scope resolver, constrained-first balanced planner, atomic revision/idempotency apply, explicit manual scope/project controls | Planner, service, mounted API, CLI and component regressions pass; SQL replay pending |
| Event dates, project cutoff and judging window are separate | Event dates + inherited round overrides, boundary checks in SQL/API/cron, manual null-time compatibility | Window/DST/schedule/email/legacy API regressions pass |
| Dedicated overview/judges/settings/results routes | Server routes, matching loading shells, legacy redirects, retained results publication UI | Route boundary and navigation parity tests pass; hosted geometry pending |
| Contextual Action Items use the same setup editors | Shared task sheet, targeted prize editors, failed invitation details, persistent organizer forms | Mounted task-sheet, recovery and readiness tests pass |
| Invitations handle all three identity states and batches | Preview/send, duplicate handling, personal message, room/prize scope, failed-only retry, identity/terms recovery | Invitation/service/API/composer/email regressions pass; live synthetic evidence pending |
| Judge dashboard shows pending invitations and actionable work | Pending invitation section, shared active/scope/window resolver, ballots counted once, read-only project browsing and history | Page boundary, persona and queue tests pass |
| Persistent inbox, preferences, coordinated cadence and retries | Email/in-app state, quiet hours, schedule/version and role recheck, milestone coalescing, manual cooldowns | Notification, mounted inbox, optimistic component and email regressions pass |
| WebMCP direct task tools and modern CLI contracts | Canonical setup, categories, rounds, invites, distribution, manual scope/project tools; modern CLI aliases/docs/registry | Tool/CLI/parity regressions pass; hosted tool registration pending |
| Legacy scores, advanced rounds and all methods preserved | Frozen legacy prize coverage, shared atomic legacy submission adapters, explicit finalist advancement | Scoring/legacy API tests pass; mixed-method SQL/results replay pending |
| Desktop/375px preview, keyboard and full role journeys | Pending preview | Pending |

## Release checks

- [x] All four migrations applied on the isolated PR database; generated database types pass TypeScript
- [ ] Local migration replay (Docker unavailable; hosted replay used)
- [x] Focused regression tests
- [x] Local full test suite: 5,666 passing tests, zero failures; final coverage guard service/API regressions also pass
- [x] Source TypeScript and CLI build
- [x] Local PR review with critical issues resolved
- [x] Hosted production build (local build deferred due memory/disk limits)
- [x] PR #557 to staging with Parity section
- [ ] Exact preview organizer and judge browser verification
- [ ] Synthetic email delivery verification

Production promotion requires separate authorization.

## Hosted verification

PR: https://github.com/AGI-Ventures-Canada/hackathon.new/pull/557

Initial source revision `51feffaaa9567704cfc492f38aa7b0c5eaaeb68d` built successfully at `oatmeal-e6n9s0w17-agi-ventures-canada.vercel.app`. GitHub lint, tests/type check, and CodeQL passed. The isolated Supabase preview (`vvlzsfbzxjsyuuzwlijk`) applied all four migrations. Seed replay exposed old judging fixtures with ineligible project statuses; the modular and combined seeds now keep active projects submitted and explicitly preserve finished historical reviews. A complete corrected seed replay passed in a rolled-back transaction.

Rollback-only SQL checks passed for inclusive opening/exclusive closing, judging after event end, inherited and overridden round windows, completed-round and published-result locks, manual null-time behavior, paired dates, notification preferences and quiet-hour bounds, notice deduplication, read/resolved/retry states, actor-scoped invitation batches, and service/anonymous grants. Verification confirmed no synthetic SQL audit records remained.

Authenticated Chrome verified the empty judge dashboard at desktop and 375px with no document overflow. The separate agent-browser runner reached Vercel protection, so authenticated Chrome is the working hosted UI surface. Google sign-in exposed a same-origin absolute return URL being discarded; the auth pages now normalize that return path safely. Populated organizer/judge journeys and synthetic provider acceptance remain pending the refreshed preview.

Local `bun db:sync` was authorized and attempted, but Docker hung before migration replay started. The task-owned command was stopped; no reset or generated type update completed. The user requested exact PR preview UI verification because the local machine exhausted memory. Disk pressure also blocked writes temporarily; only generated `.next` output was removed. Hosted build and preview database checks remain required and must not be reported as passed until observed.

Automatic notification delivery remains bounded and best effort under provider failures. Five failed automatic attempts stop retrying; failed invitation retries are available in the organizer UI. A separate retry control for exhausted non-invitation notices is not included.

Local PR review included independent judge/organizer, SQL/scoring, invitation/delivery, and WebMCP/CLI passes. Fixed review findings covered stale revisions, wrong-project races, own-team ballots, scope timing, historical prize coverage, partial room assignment batches, and reminder rechecks at each provider attempt. No known source Critical or Warning findings remain. The remaining release evidence is the hosted preview database, build, UI journeys, and synthetic email acceptance.
