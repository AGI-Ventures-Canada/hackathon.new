# Judging experience implementation register

Approved scope: prizes-first organizer setup, dedicated judging pages, contextual action editors, fast Clerk invitations, assigned project queues, recoverable review drafts, separate judging dates, email/in-app cadence, and app/WebMCP/CLI parity.

UI verification uses the exact PR Vercel preview. Do not start a local app server: the user reported local memory exhaustion. Local database reset/type generation is authorized.

| Finding / acceptance | Implementation | Verification |
| --- | --- | --- |
| Review drafts survive navigation, refresh, offline and conflicts | `use-judging-review`, versioned draft API, browser recovery, SQL revision checks | Autosave/service regressions pass; hosted Skip, reload, notes-only drafts, and submitted-edit separation pass |
| Submitted reviews and prefetch remain consistent | Atomic publication preserves submitted answer until explicit submission; stale acknowledgments retain newer edits | Autosave and legacy mounted scoring API regressions pass |
| Keyboard controls and out-of-order project loads are safe | Review state keyed by assignment/ballot; request cancellation and response guards; text/slider key isolation | Judge workspace and review regressions pass; hosted keyboard journey pending |
| Criteria changes preserve scores; incompatible edits freeze | Preserve criterion/bucket IDs; SQL freezes scored configuration and eligibility | Scoring service/editor regressions and isolated preview migration replay pass |
| Prize setup works after publication before scoring locks | Canonical prize service permits setup until submitted scoring/publication locks | Prize service and mounted API tests pass |
| Scoped weighted assignments and balanced distribution | Shared scope resolver, constrained-first balanced planner, atomic revision/idempotency apply, explicit manual scope/project controls | Planner, service, mounted API, CLI and component regressions pass; SQL replay pending |
| Event dates, project cutoff and judging window are separate | Event dates + inherited round overrides, boundary checks in SQL/API/cron, manual null-time compatibility | Window/DST/schedule/email/legacy API regressions pass |
| Dedicated overview/judges/settings/results routes | Server routes, matching loading shells, legacy redirects, visible shadcn tabs and retained results publication UI | Route/parity tests and hosted desktop/375px navigation pass; arrow keys move focus, Enter changes route |
| Contextual Action Items use the same setup editors | Shared task sheet, targeted prize editors, failed invitation details, persistent organizer forms | Mounted task-sheet, recovery and readiness tests pass |
| Invitations handle all three identity states and batches | Preview/send, duplicate handling, personal message, room/prize scope, failed-only retry, identity/terms recovery | Regressions pass; hosted duplicate/invalid preview, draft queue, publication flush, terms acceptance, and provider acceptance pass |
| Judge dashboard shows pending invitations and actionable work | Invitations, Ready to review, Coming up, and Finished use shared scope/window/readiness facts; ballots counted once | Page boundary, persona and queue tests pass; hosted direct workspace link and 2/3 progress verified |
| Persistent inbox, preferences, coordinated cadence and retries | Email/in-app state, quiet hours, schedule/version and role recheck, milestone coalescing, manual cooldowns | Notification, mounted inbox, optimistic component and email regressions pass |
| WebMCP direct task tools and modern CLI contracts | Canonical setup, categories, rounds, invites, distribution, manual scope/project tools; modern CLI aliases/docs/registry | Tool/CLI/parity regressions pass; hosted tool registration pending |
| Legacy scores, advanced rounds and all methods preserved | Frozen legacy prize coverage, shared atomic legacy submission adapters, explicit finalist advancement | Scoring/legacy API tests pass; mixed-method SQL/results replay pending |
| Desktop/375px preview, keyboard and full role journeys | Pending preview | Pending |

## Release checks

- [x] All six migrations applied on the isolated PR database; database types regenerated
- [ ] Local migration replay (Docker unavailable; hosted replay used)
- [x] Focused regression tests
- [x] Local full test suite: 5,666 passing tests, zero failures; final coverage guard service/API regressions also pass
- [x] Source TypeScript and CLI build
- [x] Local PR review with critical issues resolved
- [x] Hosted production build (local build deferred due memory/disk limits)
- [x] PR #557 to staging with Parity section
- [x] Exact preview basic organizer and judge browser journeys, desktop and 375px
- [x] Synthetic email provider acceptance verification (not a claim of inbox delivery)

Release through a staging PR, green checks, and a separate main promotion PR.

## Hosted verification

PR: https://github.com/AGI-Ventures-Canada/hackathon.new/pull/557

Initial source revision `51feffaaa9567704cfc492f38aa7b0c5eaaeb68d` built successfully at `oatmeal-e6n9s0w17-agi-ventures-canada.vercel.app`. GitHub lint, tests/type check, and CodeQL passed. The isolated Supabase preview (`vvlzsfbzxjsyuuzwlijk`) applied all four migrations. Seed replay exposed old judging fixtures with ineligible project statuses; the modular and combined seeds now keep active projects submitted and explicitly preserve finished historical reviews. A complete corrected seed replay passed in a rolled-back transaction.

Rollback-only SQL checks passed for inclusive opening/exclusive closing, judging after event end, inherited and overridden round windows, completed-round and published-result locks, manual null-time behavior, paired dates, notification preferences and quiet-hour bounds, notice deduplication, read/resolved/retry states, actor-scoped invitation batches, and service/anonymous grants. Verification confirmed no synthetic SQL audit records remained.

Authenticated Chrome verified the empty judge dashboard at desktop and 375px with no document overflow. The separate agent-browser runner reached Vercel protection, so authenticated Chrome is the working hosted UI surface. Google sign-in exposed a same-origin absolute return URL being discarded; the auth pages now normalize that return path safely. The corrected OAuth return to `/home/judging` passed on the PR alias.

The PR alias `https://oatmeal-git-feature-judging-experien-c496ba-agi-ventures-canada.vercel.app` was verified against deployment `dpl_GWqVkt2orzPGz9PpdhUwKJ8esc7w`, source `18a0bbf53122197974449e9f90db093ea50091dd`. Both synthetic events were created or configured through the organizer UI. A prize saved with zero criteria, and applying the starter immediately showed four categories totaling 100%. The main journey covered Action Items, event publication, required invitation terms, acceptance, balanced distribution with one eligible judge, project review, Skip, refresh recovery, atomic submission, and progress advancing from zero to one of three reviews. Editing a published score from 8 to 6 kept the result at 8 while displaying “Changes not submitted”; only Save changes updated the result to 6. The synthetic event had already ended, while its separate judging window remained open.

Further hosted checks passed for wrong-account guidance, already-accepted recovery, expired/cancelled recovery, direct dashboard links with two of three reviews complete, and a long-title project at 375px. Score and notes arrow keys kept the same review URL. The scorecard editor displayed “Reviews have started. Add a new round to change scoring” and preserved its four saved categories.

Hosted checks found and fixed an admin invitation actor mismatch, ambiguous PostgREST prize joins, stale starter totals, first-prize validation, and disagreement between effective event status and the SQL judging window. The forward window migration `20260905235451` is present in the preview ledger. Readiness gating and immediate inbox updates are receiving an additional implementation pass before final acceptance.

User feedback that the judging destinations looked like plain text links is addressed by the standard shadcn tab bar. Settings and Results show a visible selected state; all four destinations fit at 375px, with document width equal to the viewport. Keyboard ArrowRight moves focus without changing the current route, and Enter opens the focused destination.

Synthetic invitation delivery used only Resend’s simulator address `delivered+judging-pr557@resend.dev`. The draft showed “Will send when the event is live”; publishing the synthetic event flushed it. The exact preview runtime recorded `email_delivery` outcome `provider_accepted`, attempt 1, duration 125ms, and the invitation recorded `emailed_at=2026-09-05T23:46:26.594Z`, zero failures. This verifies provider acceptance, not arrival in a real inbox. The signed-in judge’s routine email preference is disabled during subsequent review tests.

Local `bun db:sync` was authorized and attempted, but Docker hung before migration replay started. The task-owned command was stopped; no reset or generated type update completed. The user requested exact PR preview UI verification because the local machine exhausted memory. Disk pressure also blocked writes temporarily; only generated `.next` output was removed. Hosted build and preview database checks remain required and must not be reported as passed until observed.

Automatic notification delivery remains bounded and best effort under provider failures. Five failed automatic attempts stop retrying; failed invitation retries are available in the organizer UI. A separate retry control for exhausted non-invitation notices is not included.

Configured judging windows use continuous readiness: valid effective scorecards and at least one eligible assigned judge for every eligible project/prize. Losing the last eligible reviewer pauses scoring until coverage is restored. Missing the preferred three judges is a warning. Unscheduled legacy behavior stays unchanged, and already-reviewed legacy scorecards retain their historical weight normalization. Event-wide assignments and ranked picks follow the active finalist pool and inherited round window; direct SQL scoring and audience voting enforce the same boundary.

Local PR review included independent judge/organizer, SQL/scoring, invitation/delivery, and WebMCP/CLI passes. Fixed review findings covered stale revisions, wrong-project races, own-team ballots, scope timing, historical prize coverage, partial room assignment batches, and reminder rechecks at each provider attempt. No known source Critical or Warning findings remain. The remaining release evidence is the hosted preview database, build, UI journeys, and synthetic email acceptance.

Final local gates passed across 4,552 unit/component tests, 813 mounted integration tests, 100 email tests, and 288 CLI tests, followed by focused regressions for the final review fixes. Source checking uses the repository CI command `bunx tsc --noEmit -p tsconfig.build.json`; lint and CLI build also pass. Tab interaction tests run with the real primitives in an isolated process because unrelated link mocks remove ARIA props. Two older mounted-route tests now preserve unmocked timeline exports.

Browser coverage is the basic organizer-to-judge journey above. Offline/concurrent-tab behavior, mixed methods, advanced rounds, and cadence races have automated regression coverage; additional full mixed-method browser journeys were not run before the requested release cutoff. Final forward-migration assertions and one completion-inbox smoke remain part of the release checks.

The final readiness migration `20260906000836` applied on the isolated preview for `dc01ce74`. Rollback-only SQL assertions passed for missing coverage, invalid cards, direct and atomic score writes, post-event boundaries, round inheritance, explicit finalist pools, ranked picks, audience votes, and frozen legacy weight normalization. The script asserted that none of its synthetic event rows remained. Database types were regenerated from that preview.
