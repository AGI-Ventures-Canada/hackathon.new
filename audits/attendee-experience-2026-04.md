# Attendee Experience Audit — April 2026

**Scope:** every attendee-facing flow — registration, team formation, invites, event resources, sponsor credits, announcements, schedule, project submission, emails, judging visibility, prizes.

**Base revision:** `origin/staging` @ `c2f5ab8` (2026-04-17). Verified after PR #238 (email redesign) and PR #237 (judging scoring endpoints).

**Method:** code-only static analysis. No browser/runtime verification.

**Status:** findings inventory. No code fixes in this pass.

---

## How to use this doc

Each finding lists:

- **Severity** — Critical / High / Medium / Low
- **Location** — `file:line` on `origin/staging`
- **Edge case** — one-sentence description
- **Repro** — name of the seed scenario that reproduces the state, or `manual` if no automated repro is practical

Run a scenario with `bun run scripts/test-scenario.ts <name>` (requires `bun dev`).

## Severity legend

| Severity | Meaning |
|---|---|
| **Critical** | Silent failure, auth bypass, data loss, or a core flow is broken for normal users |
| **High** | Known edge case that breaks UX or data integrity; easy to repro |
| **Medium** | Uncommon edge case, secondary flow regression, or paper-cut that an attendee will notice |
| **Low** | Theoretical, race-only, or cosmetic |

---

## 1. Registration

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 1.1 | High | `lib/api/routes/public.ts:222` + `register_for_hackathon` RPC | Capacity race — two concurrent registrations can both pass `max_participants` check before either commits. The RPC uses `FOR UPDATE` on the hackathon row but the participant-count check isn't inside the lock's scope. | `manual` (race) |
| 1.2 | Medium | `lib/api/routes/public.ts:222` | If only one of `registration_opens_at` / `registration_closes_at` is NULL, the window logic is ambiguous — users may register outside the intended window. | `manual` |
| 1.3 | Low | `lib/api/routes/public.ts:208-220` | Clerk user fetch for display-name is wrapped in try/catch and falls back to "My Team" on failure — silent loss of personalized team name. | `manual` |
| 1.4 | Low | `supabase/migrations/20260211000002_auto_create_team_on_registration.sql` | Auto-created team name has no uniqueness check — two users named "Alex" both get "Alex's Team". | `attendee-captain-pending-invite` (check the seeded team name) |

## 2. Team formation

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 2.1 | High | `accept_team_invitation` RPC: `supabase/migrations/20260216000002_accept_invitation_email_check.sql:111-115` | Capacity race across sibling invitations — `FOR UPDATE OF ti` locks the invitation row but not the team. Two users accepting different invitations to the same full team can both succeed. | `attendee-team-at-capacity` + manual race |
| 2.2 | High | `lib/api/routes/public.ts:905` + `acceptTeamInvitation` | Accept only compares Clerk `primaryEmailAddress`. An invite sent to a user's secondary email will fail to accept even though the user owns that email. | `manual` (requires Clerk user with multiple emails) |
| 2.3 | High | Missing endpoint | No "leave team" endpoint. If a member wants to leave, only the captain (via dashboard `modifyTeamMembers`) can remove them. | `attendee-submitted-then-left` shows the post-state |
| 2.4 | High | Missing endpoint | No "transfer captaincy" endpoint. If a captain is removed, the team has no captain and cannot accept/invite further. | `manual` |
| 2.5 | Medium | `lib/services/team-invitations.ts:14-136` | Expired invitations are never cleaned up — they sit `pending` in the DB forever. UI relies on client-side `expires_at` check. | `attendee-invite-expired` |
| 2.6 | Medium | `lib/services/team-invitations.ts:29-136` | Invite can be sent after registration window closes (as long as hackathon status is still `active`). Intent unclear — is late team formation allowed? | `manual` |
| 2.7 | Medium | `lib/services/team-invitations.ts:91-96` | Pending-invite deduplication is per-team only. Same email can be invited to multiple teams in the same hackathon simultaneously. | `manual` |
| 2.8 | Medium | `lib/api/routes/dashboard.ts:2137-2148` | Rate limit is 10 invites / 60 s per team — sends to 10 different emails in rapid succession are allowed with no throttle past that. | `manual` |
| 2.9 | Low | Anywhere team name is rendered | Team name has no length cap and no HTML escape — very long or Unicode-heavy names break list layouts; raw `<script>` is not filtered (assume React escapes on render, but HTML-ish attribute contexts may leak). | `manual` |
| 2.10 | Low | `lib/services/team-invitations.ts:91,102` | Email normalization uses `toLowerCase()` for dedup (line 91) but Clerk lookup uses the raw input (line 102). Mixed-case invites can skip the dedup. | `manual` |

**Resolved on staging (historical note):**
- `POST /public/invitations/:token/decline` now requires Clerk auth and compares the signed-in user's email to the invite email (`lib/api/routes/public.ts:937-973`). Earlier concern about unauthenticated decline is no longer valid.

## 3. Project submission

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 3.1 | Critical | `lib/api/routes/public.ts:319-452` | **No confirmation email sent on submit.** Webhook `submission.created` fires but the attendee receives no acknowledgement. No template for this exists in `emails/`. | `attendee-solo-submitted` (observe that mailbox stays empty) |
| 3.2 | High | Missing endpoint | No `DELETE` / unsubmit / withdraw endpoint. Once a submission exists, it cannot be removed. | `manual` |
| 3.3 | High | `lib/api/routes/public.ts:454-567` (PATCH) | Edit permission is re-derived from `getParticipantWithTeam` at each edit. If a submission was created as solo (`participant.teamId: null`) and the participant later joined a team, the old `team_id: null` submission still belongs to them but won't be visible to their new team. | `attendee-submitted-then-left` |
| 3.4 | High | `lib/api/routes/public.ts:340` | Submission cutoff is a status flip (`active → judging`), not a timestamp. There is no event timezone column on `hackathons`, so the cutoff moment depends on when someone (or cron) triggers the transition. Attendees in different timezones have no clear deadline. | `manual` |
| 3.5 | Medium | `lib/api/routes/public.ts:387-398` | GitHub URL is hostname-checked (`github.com` / `www.github.com`). `liveAppUrl` is validated as a URL string only — no hostname, no liveness probe, no safe-redirect check. | `manual` |
| 3.6 | Medium | `lib/api/routes/public.ts:401` | `challengeIds` are UUID-validated but their existence is not — deleted or unrelated challenge IDs can be attached silently. | `manual` |
| 3.7 | Medium | `lib/api/routes/public.ts:379-380` | Solo submission gated by `hackathon.allow_solo`. UI should surface "solo submissions allowed/not allowed" pre-attempt — currently the attendee only finds out on submit. | `manual` |
| 3.8 | Low | Missing | Submissions are not versioned. An edit overwrites silently; there's no history if a team member clobbers another's changes. | `manual` |

## 4. Emails to attendees

PR #238 (2026-04-17) redesigned all 12 templates and wired several previously dormant senders. The inventory below reflects the post-#238 state.

### Template inventory

| Template | Sender | Trigger | Status |
|---|---|---|---|
| `team-invitation.tsx` | `sendTeamInvitationEmail` | dashboard invite → workflow | wired |
| `judge-invitation.tsx` | `sendJudgeInvitationEmail` | dashboard judge invite | wired |
| `judge-added.tsx` | `sendJudgeAddedNotification` | dashboard add-judge | wired |
| `transition-notification.tsx` | `dispatchTransitionNotifications` | lifecycle auto-transition | wired |
| `winner-notification.tsx` | `sendWinnerEmails` | manual publish-winners | wired |
| `results-announcement.tsx` | `sendResultsAnnouncementEmails` | manual publish-results | wired |
| `feedback-survey.tsx` | `sendFeedbackSurveyEmails` | manual survey send | wired |
| `post-event-reminder.tsx` | `sendPostEventReminders` | cron | wired |
| `prize-shipped.tsx` | `sendPrizeShippedEmail` (`lib/services/prize-fulfillment.ts:219`) | sponsor marks shipped | wired (previously orphaned; fixed in #238) |
| `sponsor-claim-notification.tsx` | `sendSponsorClaimNotification` (`lib/services/prize-fulfillment.ts:601`) | winner claims | wired (previously orphaned; fixed in #238) |
| `organizer-claim-notification.tsx` | `sendOrganizerClaimNotification` (`lib/services/prize-fulfillment.ts:612`) | winner claims | wired (previously orphaned; fixed in #238) |
| `agent-notification.tsx` | `sendAgentNotification` (`lib/email/resend.ts:167`) | — | **orphaned — no production caller** |

### Findings

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 4.1 | Critical | `lib/api/routes/public.ts:319-452` (submit) | No submission-received email template, no sender, no call site. See 3.1. | `attendee-solo-submitted` |
| 4.2 | High | `lib/email/resend.ts:167` | `sendAgentNotification` is defined and documented but has no real caller. Either wire it or delete the template + sender. | `manual` |
| 4.3 | High | `lib/email/resend.ts:32-71` | `sendEmail()` returns `null` on any failure (`RESEND_API_KEY` missing → warn only; Resend API error → `console.error`). No alerting, no retry, no requeue. If the key rotates silently, all emails stop and no one notices. | `manual` |
| 4.4 | High | `lib/email/winner-notifications.ts`, `lib/email/results-announcement.ts`, `lib/email/feedback-survey.ts` | Winner / results / survey senders fetch recipient emails from Clerk. If a Clerk user was deleted, the recipient is silently skipped with no log — participant still in `hackathon_participants` but gets nothing. | `manual` |
| 4.5 | High | `lib/email/results-announcement.ts`, `lib/email/feedback-survey.ts` | Idempotency is enforced via DB flags (`results_announcement_sent_at`, `feedback_survey_sent_at`). A partially-failed batch (some recipients errored) flips the flag anyway — re-running the send is a no-op. | `manual` |
| 4.6 | Medium | `lib/api/routes/public.ts:893-931` (accept) + `/judge-invite/:token` | Invite-token links have no recipient binding. A forwarded email lets anyone with a Clerk account and a matching email accept or decline the invite. (Email match is now enforced on decline, so the risk is reduced but not zero.) | `manual` |
| 4.7 | Medium | `emails/_components/event-detail-box.tsx:formatDateRange` (added #238) | Email dates pinned to UTC — good. But the underlying `hackathon.starts_at` / `ends_at` have no stored timezone, so "Apr 20" may not match the local event day in, say, Honolulu (UTC-10). Email says Apr 20, event starts Apr 21 local. | `manual` |
| 4.8 | Medium | `lib/email/transition-notifications.ts` | Transition emails respect per-user `email_on_*` settings. No guardrail against double-send on manual re-trigger. | `manual` |
| 4.9 | Low | `emails/_components/event-detail-box.tsx` | #238 commit log references several "wire missing `hackathonStartsAt/EndsAt`" fixups during the redesign. Worth spot-checking every sender call site to verify the props are actually passed through. | `manual` |

## 5. Announcements

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 5.1 | **Critical** | `lib/services/announcements.ts:48-63` (`listPublishedAnnouncements`) and `components/hackathon/preview/hackathon-preview-client.tsx:572-587` (render) | **The `audience` column is ignored.** The service query has no `.eq("audience", …)` and the consumer has no client-side filter. Every attendee sees every published announcement regardless of `organizers/judges/mentors/attendees/submitted/not_submitted` targeting. Silent failure of a documented feature. | `attendee-announcements-audiences` |
| 5.2 | High | `lib/services/announcements.ts:48-63` | Attendee who registers after an announcement was published still sees it. There's no "delivered" mark per user, so no way to target "new registrations from today". | `attendee-announcements-audiences` |
| 5.3 | Medium | `lib/services/announcements.ts:142-157` | Scheduled publish time is stored as UTC without a hackathon timezone; "publish at 9 AM PT" becomes whatever UTC the organizer's browser converted it to. If their browser is on a different TZ than the event, the schedule drifts. | `manual` |
| 5.4 | Medium | Missing | No email sent when an announcement is published. Attendees must visit the page to see them. | `manual` |

## 6. Event resources

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 6.1 | Medium | `components/hackathon/preview/hackathon-preview-client.tsx:451-483` | Community link is gated behind `isRegistered` — early-bird users can't join Discord/Slack before they register, suppressing pre-event conversations. | `manual` |
| 6.2 | Medium | `components/hackathon/preview/hackathon-preview-client.tsx:550-680` | Resources (schedule, perks, challenges, community, prizes) are scattered across tabs. No single "What do I need?" landing surface for a registered attendee. | `manual` |
| 6.3 | Low | `components/hackathon/preview/hackathon-preview-client.tsx:555-557` | Challenges tab renders whenever `challenges.length > 0`, but `ChallengeSection` filters unreleased ones — tab appears with empty content before release. Confusing. | `manual` |

## 7. Schedule + timezone

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 7.1 | High | `hackathon-preview-client.tsx:620-655` | Schedule times rendered via `new Date(x).toLocaleTimeString()` — browser timezone, not event timezone. No `timezone` column on `hackathons` or `schedule_items`. Remote attendees see wrong times. | `manual` |
| 7.2 | High | Same | "Now" live badge compares `new Date()` (browser) to `starts_at` (UTC) — for remote attendees the badge appears at the wrong moment. | `manual` |
| 7.3 | Medium | `lib/services/schedule-items.ts:147-162` | `buildDefaultAgendaItems()` uses server local time for defaults — if server TZ differs from event TZ, seeded agenda times drift. | `manual` |
| 7.4 | Low | `hackathon-preview-client.tsx:620-655` | No pagination or virtualization — a 50-item schedule is a long mobile scroll. | `manual` |

## 8. Sponsor credits / perks

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 8.1 | High | `components/hackathon/perks-section.tsx:32-37` | No claim-tracking record is created when an attendee copies a perk code. No per-attendee limit, no exhaustion signal, no audit trail. | `attendee-perks-mixed` |
| 8.2 | High | `lib/services/sponsor-fulfillments.ts:21-103` | Sponsor prize fulfillment has no inventory cap. If a sponsor promises 50 credits and 100 teams try, the first 50 claims win silently — the remaining 50 see an unlabeled failure. | `manual` |
| 8.3 | Medium | `components/hackathon/perks-section.tsx:58-65` | No "claimed"/"exhausted" badge on perk tiles. Attendees assume code is valid until redemption fails externally. | `attendee-perks-mixed` |
| 8.4 | Medium | `lib/services/perks.ts` (`isPerkReleased`) | Release gating falls back to `hackathon.starts_at` if no explicit release time — fine for `active` hackathons, but pre-event attendees see "coming soon" with no countdown. | `attendee-perks-mixed` |

## 9. Judging visibility (attendee-side)

PR #237 (2026-04-17) added `GET /assignments/:id` and `POST /assignments/:id/scores` for the judge side. Attendee-side visibility is unchanged.

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 9.1 | Medium | `hackathon-preview-client.tsx:109-130` | Judge list is fetched only when `participantRole === "judge"` — attendees never see who judged them, even after results. Intentional? Worth confirming. | `manual` |
| 9.2 | Medium | `lib/services/results.ts:392-408` | Results gated on `results_published_at` being non-null. If the organizer forgets to publish, attendees never see scores. No auto-publish on judging completion. | `manual` |
| 9.3 | Medium | `lib/services/results.ts:418-424` | Public results only include team member names for ranks 1-3. 4th place onwards gets no placement info at all — attendee literally cannot find themselves. | `manual` |
| 9.4 | Low | `hackathon-preview-client.tsx:113-115` | "Anonymous judging" strips judge names but retains org / title. Anonymity is cosmetic when a submission from Acme is judged by someone from Acme. | `manual` |

## 10. Prizes + claims

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 10.1 | **Critical** | `app/(public)/e/[slug]/winners/page.tsx` | Winners page has **no auth gate**. Anyone with the URL sees all winners the moment `results_published_at` is set. Embargoed results leak via indexed URLs, social shares, etc. | `attendee-winner-pending-claim` |
| 10.2 | High | `components/hackathon/prize-section.tsx` | No "how to claim" UI anywhere. Attendee wins, email arrives with a claim token, but on the event page there's no prize-claim flow or status. | `attendee-winner-pending-claim` |
| 10.3 | Medium | `components/hackathon/prize-section.tsx:26-31` | Crowd-vote CTA is gated on `status in (active, judging)`. If the organizer transitions to `completed` before crowd voting closes, the button disappears mid-vote. | `manual` |
| 10.4 | Medium | Missing | No expiration on prize claims. An unclaimed prize sits forever with no "you have 30 days to claim" nudge. | `manual` |

## 11. Cross-cutting risks

| # | Severity | Location | Edge case | Repro |
|---|---|---|---|---|
| 11.1 | High | `lib/email/resend.ts:32-71` | Silent-failure pattern on email send. See 4.3. Applies to every sender. | `manual` |
| 11.2 | Medium | `lib/services/webhooks.ts` (callers use `.catch(console.error)`) | Every webhook trigger in `lib/api/routes/public.ts` (register, submission.created, submission.updated) fire-and-forgets with only a console.error on failure. No retry, no DLQ. | `manual` |
| 11.3 | Medium | Empty states in `components/hackathon/**` | Empty states (no schedule, no sponsors, no prizes, no perks) are attendee-facing. Organizers never see them because they render in the same component, but they also never get a "you haven't added any X yet" nudge to fix it. | `manual` |
| 11.4 | Low | Multiple | Copy on several components uses jargon ("Advancement", "Promote", "Submissions") — check against the 5th-grade rule in `CLAUDE.md`. | `manual` |

---

## Repro scenario index

Each of these is a one-command seed — `bun run scripts/test-scenario.ts <name>`.

| Scenario | State after seeding |
|---|---|
| `attendee-captain-pending-invite` | Dev user is captain of a team with 1 pending invite to a Clerk-unknown email |
| `attendee-invite-expired` | Dev user is captain with an invite whose `expires_at` is 8 days ago |
| `attendee-invite-declined` | Dev user is captain with an invitation that was previously declined |
| `attendee-team-at-capacity` | Dev user is captain of a team at `max_team_size`, with an additional pending invite |
| `attendee-invited-to-team` | Dev user has a pending invite from a different captain |
| `attendee-solo-submitted` | `allow_solo=true`, dev user submitted a solo project |
| `attendee-submitted-then-left` | Dev user submitted, then was removed from the team; team still has other members |
| `attendee-announcements-audiences` | 7 announcements — one for each audience enum value |
| `attendee-perks-mixed` | Hackathon with released, future-scheduled, and hidden perks |
| `attendee-winner-pending-claim` | Results published, dev user's team won 1st, claim not yet made |

---

## What this audit did NOT cover

- Runtime / browser verification (code-only per audit scope)
- Performance under load, concurrency tests beyond static analysis of locks
- Third-party dependency risks (Clerk session invalidation, Supabase RLS edge cases, Resend deliverability)
- Accessibility audit (alt text, keyboard nav, screen reader)
- Mobile visual regression (flagged in a few places but not exhaustive)
- Security (XSS/CSRF) beyond the few obvious spots called out
