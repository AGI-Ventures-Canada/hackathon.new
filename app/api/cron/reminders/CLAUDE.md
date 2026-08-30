# Reminders System

Automated reminder emails for invitations and hackathon events, processed by a cron job every minute.

## Architecture

The reminders feature spans multiple directories. The cron route here is the entry point; the logic lives in services and email modules.

```
app/api/cron/reminders/route.ts       # Cron endpoint (this directory)
lib/services/smart-reminders.ts       # Core: schedule, cancel, process reminders
lib/services/pre-event-reminders.ts   # Schedule reminders for hackathon deadlines
lib/services/post-event-reminders.ts  # Post-event reminder scheduling + processing
lib/email/pre-event-reminders.ts      # Pre-event email sending (Clerk recipient lookup)
lib/email/post-event-reminders.ts     # Post-event email content builders
emails/team-invitation-reminder.tsx   # React Email template: team invite
emails/judge-invitation-reminder.tsx  # React Email template: judge invite
emails/pre-event-reminder.tsx         # React Email template: pre-event deadlines
emails/post-event-reminder.tsx        # React Email template: post-event follow-ups
```

### Database tables

- `scheduled_reminders` — smart reminders (invitations + pre-event). Loads a bounded pending batch, sends with stable provider idempotency keys, and writes `sent_at` only after provider acceptance. Failed dispatches leave `sent_at` null, increment `fail_count`, and record `last_error` for retry on the next cron run (max 3 attempts)
- `post_event_reminders` — post-event reminders (prize claims, fulfillment, feedback). Separate table, separate processing path
- `lifecycle_notification_dispatches` — failed lifecycle workflow starts. Retries keep the original notification ID, run under a global lease, back off, and stop after five failed starts
- `judge_pending_notifications` — direct judge-added emails. Retries keep the participant delivery identity, run under a global lease, back off, and stop after five failed sends
- `team_invitations.reminded_at` / `judge_invitations.reminded_at` — manual remind tracking

## Key functions

| Function | File | What it does |
|----------|------|--------------|
| `computeReminderSchedule()` | `smart-reminders.ts` | Computes reminder times from creation/deadline window |
| `scheduleReminders()` | `smart-reminders.ts` | Inserts rows into `scheduled_reminders` with upsert |
| `cancelRemindersForEntity()` | `smart-reminders.ts` | Cancels all pending reminders for an entity |
| `cancelUpcomingReminder()` | `smart-reminders.ts` | Cancels next reminder within N ms (manual remind dedup) |
| `processPendingReminders()` | `smart-reminders.ts` | Cron processor: load, validate, dispatch idempotently, then mark completion |
| `schedulePreEventReminders()` | `pre-event-reminders.ts` | Schedule reminders for hackathon deadlines |
| `reschedulePreEventReminders()` | `pre-event-reminders.ts` | Cancel + reschedule (called on date changes) |
| `processAllPendingReminders()` | `post-event-reminders.ts` | Post-event cron processor |
| `retryPendingLifecycleNotificationDispatches()` | `lifecycle-notification-retries.ts` | Restarts lifecycle email workflows with stable identities and bounded backoff |
| `retryPendingJudgeNotifications()` | `judge-invitations.ts` | Sends queued direct judge notices with stable identities and bounded backoff |

## How to modify

### Adding a new reminder type

1. Add the type to `ReminderType` in `smart-reminders.ts`
2. Add validation logic in `validateReminderEntity()` for the new entity type
3. Add dispatch logic in `dispatchReminderEmail()` to route to the correct email sender
4. Create the email template in `emails/` and send function in `lib/email/`
5. Call `scheduleReminders()` from wherever the entity is created
6. Call `cancelRemindersForEntity()` from wherever the entity is resolved
7. Add tests in `__tests__/services/` and `__tests__/integration/`

### Adding urgency-varied subjects

Email subjects escalate with urgency. Pattern used in invitation reminders:

```typescript
// In the email send function
const subject =
  urgency === "high"
    ? `Last chance — ${hackathonName} invite expires soon`
    : urgency === "medium"
      ? `Reminder: Join ${teamName} for ${hackathonName}`
      : `Reminder: You're invited to join ${teamName}`
```

### Changing schedule tiers

Edit `computeReminderSchedule()` in `smart-reminders.ts`. The function uses time window buckets (< 2 days, 2-7 days, 7-30 days, 30+ days) with a 4-hour minimum gap between reminders.

## Testing

```bash
bun run test -- __tests__/services/smart-reminders.test.ts
bun run test -- __tests__/services/post-event-reminders.test.ts
bun run test:email                    # Email template integration tests
bun run test:integration              # End-to-end reminder flow tests
```

## Cron configuration

The cron runs every minute via Vercel (`vercel.json`). Each email worker gets a 32-recipient budget. The shared email wrapper spaces provider attempts at least 250 ms apart within a process, and bulk loops add a pause after each group of four. Authenticated with `CRON_SECRET` bearer token. Concurrent invocations reuse stable provider idempotency keys and never use `sent_at` as a pre-delivery claim. Failed reminders retry up to 3 dispatch attempts across cron runs. Query `SELECT * FROM scheduled_reminders WHERE fail_count >= 3` to find rows that need manual investigation.
