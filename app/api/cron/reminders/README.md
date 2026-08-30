# Reminders System

Automated, deadline-aware reminder emails for invitations and hackathon events. Reminders are scheduled when entities are created and processed by a Vercel cron job every minute.

## How it works

1. **Something with a deadline gets created** (team invite, judge invite, hackathon going live)
2. **Reminders are auto-scheduled** based on how far away the deadline is
3. **A cron job runs every minute**, loads a bounded pending batch, validates the source entity still needs a reminder, and sends the email with a stable idempotency key
4. **Reminders cancel themselves** when the entity is resolved (invite accepted, hackathon completed, dates changed)

## Scheduling tiers

`computeReminderSchedule()` picks how many reminders to send and when, based on the time window between creation and deadline:

| Window | Reminders | Urgency progression |
|--------|-----------|---------------------|
| < 2 days | Halfway, 2h before | medium, high |
| 2-7 days | 40% through, 1 day before, 3h before | low, medium, high |
| 7-30 days | 1 week, 2 days, 6h before | low, medium, high |
| 30+ days | 2 weeks, 1 week, 1 day, 3h before | low, low, medium, high |

Reminders closer than 4 hours apart are deduplicated. Past reminders are filtered out.

## Entity types

### Invitation reminders

Scheduled when a team or judge invitation is created. Cancelled when the invitation is accepted, declined, or cancelled. Manual "Send Reminder" cancels the next auto-reminder within 6 hours to avoid spam.

- Entity types: `team_invitation`, `judge_invitation`
- Reminder type: `invitation_reminder`
- Urgency affects email subject: low/medium = "Reminder: Join...", high = "Last chance -- expires soon"

### Pre-event reminders

Scheduled when a hackathon transitions to an active state or when dates change. Cancelled on completion/archival.

The same cron also retries database-backed attendee lifecycle emails. Registration confirmations and team approval or denial notices are queued by database triggers/RPCs, sent with stable idempotency keys, and only marked complete after the provider accepts them. Draft-event notices wait until go-live; stale notices are cancelled after attendee changes close.

It also retries lifecycle email workflows that could not start after an event stage change. The original notification ID and payload stay in `lifecycle_notification_dispatches`, so retrying does not duplicate provider delivery. A global lease prevents overlapping cron runs from starting the same queued work, and exponential backoff stops after five failed starts.

Direct judge-added emails use the same safeguards. Unsent rows in `judge_pending_notifications` keep a stable delivery key, retry with backoff, and stop after five attempts. Draft and test events remain queued, and a global lease prevents overlapping cron runs from sending the same row.

- Entity type: `hackathon_event`
- Reminder types: `registration_closing`, `event_starting`, `submission_due`
- Recipients: all registered participants (fetched from Clerk)

### Post-event reminders

Separate system using the `post_event_reminders` table. Scheduled after results are published. Handles prize claim nudges, organizer fulfillment reminders, and feedback survey follow-ups.

## Cron processing

The cron endpoint (`GET /api/cron/reminders`) calls `processPendingReminders()` which:

1. Loads pending reminders where `sent_at` and `cancelled_at` are null
2. Validates metadata fields before dispatching (throws on missing required fields)
3. Validates each reminder's source entity (is the invite still pending? is the hackathon still active?)
4. Dispatches the appropriate email via dynamic import
5. Marks `sent_at` only after every provider call is accepted
6. On failure: leaves `sent_at` null, increments `fail_count`, and records `last_error`
7. Returns `{ processed, sent, skipped, errors }`

Overlapping cron runs reuse the same per-reminder and per-recipient provider idempotency keys. Failed or uncertain deliveries stay pending and retry on the next run, up to 3 dispatch attempts. Database query and completion-write failures return a cron error instead of reporting success.

Each delivery worker may send up to 32 recipients per run. The shared scheduled-reminder worker can therefore reach 1,920 recipients per hour. The email wrapper serializes every provider attempt at least 250 ms apart within a process, including retries and work from different email loops. Bulk loops add a pause after each group of four.

## Cancellation triggers

| Event | What gets cancelled |
|-------|---------------------|
| Invitation accepted/declined/cancelled | All reminders for that invitation |
| Manual "Send Reminder" clicked | Next auto-reminder within 6 hours |
| Hackathon dates change | Old pre-event reminders cancelled, new ones scheduled |
| Hackathon completed/archived | All pre-event reminders |

## File map

| File | Purpose |
|------|---------|
| `app/api/cron/reminders/route.ts` | Cron endpoint (Vercel, every minute) |
| `lib/services/smart-reminders.ts` | Core engine: scheduling, cancellation, cron processing |
| `lib/services/pre-event-reminders.ts` | Pre-event reminder scheduling for hackathon deadlines |
| `lib/services/post-event-reminders.ts` | Post-event reminder scheduling and processing |
| `lib/email/pre-event-reminders.ts` | Pre-event email sending (fetches recipients from Clerk) |
| `lib/email/post-event-reminders.ts` | Post-event email content builders and sending |
| `emails/team-invitation-reminder.tsx` | React Email template for team invite reminders |
| `emails/judge-invitation-reminder.tsx` | React Email template for judge invite reminders |
| `emails/pre-event-reminder.tsx` | React Email template for pre-event deadline reminders |
| `emails/post-event-reminder.tsx` | React Email template for post-event follow-ups |

### Database

| Table | Purpose |
|-------|---------|
| `scheduled_reminders` | Smart reminders (invitations + pre-event). Completion via `sent_at`, retry via `fail_count`/`last_error` |
| `post_event_reminders` | Post-event reminders (prize claims, fulfillment, feedback) |
| `lifecycle_notification_dispatches` | Failed lifecycle workflow starts, with bounded backoff and the original notification ID |
| `judge_pending_notifications` | Direct judge-added emails, with a stable delivery key and bounded backoff |
| `team_invitations.reminded_at` | Tracks manual remind timestamp |
| `judge_invitations.reminded_at` | Tracks manual remind timestamp |

### Tests

| File | What it covers |
|------|----------------|
| `__tests__/services/smart-reminders.test.ts` | Scheduling tiers, deduplication, cancellation, cron processing |
| `__tests__/services/post-event-reminders.test.ts` | Post-event scheduling, processing, cancellation |
| `__tests__/integration/invitation-reminders.integration.test.ts` | End-to-end invitation reminder flow |
| `__tests__/integration/team-invitation-reminder-email.email.test.ts` | Team reminder email content |
| `__tests__/integration/judge-invitation-reminder-email.email.test.ts` | Judge reminder email content |

## Vercel cron config

In `vercel.json`:

```json
{
  "path": "/api/cron/reminders",
  "schedule": "* * * * *"
}
```

Authenticated via `CRON_SECRET` bearer token (set in Vercel environment).
