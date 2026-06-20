# Email deliverability rules

When you add a new transactional email here, follow these rules. They were
backfilled from PR #334 after team-invitation emails were landing in spam,
and are written so that future emails inherit the fix instead of repeating
the mistake.

## Always

1. **Send both HTML and plain text.** Mail providers downgrade HTML-only
   messages and Outlook strips many client-side renderers. Use
   `renderEmail()` from [`utils.ts`](utils.ts) — it returns `{ html, text }`
   from a single React Email component.

2. **Set a `replyTo`.** Use `getReplyToAddress()` from [`utils.ts`](utils.ts).
   It reads `RESEND_REPLY_TO_EMAIL` and falls back to `RESEND_FROM_EMAIL`.
   Don't hard-code an address — that leaks production into dev/staging.

3. **Set `List-Unsubscribe` + `List-Unsubscribe-Post` for any email a
   recipient might want to stop getting.** Use
   `buildUnsubscribeHeaders(unsubscribeUrl)` from [`utils.ts`](utils.ts).
   The headers it produces are RFC 8058 compliant — major mailbox providers
   (Gmail, Outlook, Yahoo) require them on bulk/transactional mail, and
   missing them is the single biggest spam-folder predictor we've seen.

4. **Point `List-Unsubscribe` at a *dedicated* unsubscribe URL when one
   exists.** It must stop the user receiving more of the same kind of email
   when POSTed (RFC 8058 one-click). It must not be the action URL of the
   email itself — pointing it at the invite-accept URL turns one-click
   unsubscribe into one-click *accept*. See
   `/api/public/invitations/:token/unsubscribe` for the right shape:
   auth-free, token-scoped, idempotent.

   **If the email type has no token-scoped unsubscribe endpoint** (most of
   them don't — the one-click flow is bespoke to team invitations), use
   `buildMailtoUnsubscribeHeaders()` from [`utils.ts`](utils.ts) instead. It
   emits a `mailto:`-only `List-Unsubscribe` header pointing at the reply
   address — RFC-valid, shows the Unsubscribe affordance in Gmail/Apple
   Mail, and never 404s. It deliberately omits `List-Unsubscribe-Post`,
   which is only valid alongside an `https` one-click endpoint. Do **not**
   point a one-click POST header at a route that doesn't exist — a 404 when
   a mailbox provider probes it is worse than no header at all.

5. **Include `tags` on every send.** They power Resend's delivery
   dashboards and let us slice deliverability by template + hackathon.
   Required tags:
   - `{ name: "type", value: "<template_name>" }`
   - `{ name: "hackathon", value: sanitizeTag(hackathonName) }` whenever
     the email is hackathon-scoped.

6. **Verify `RESEND_FROM_EMAIL` points at a domain set up in Resend with
   DKIM + SPF.** The default `onboarding@resend.dev` is shared across every
   Resend trial account and is heavily filtered. Production should send
   from `noreply@getoatmeal.com` (or another verified domain).

## Subject lines

7. **Lead with the human reason for the email, not a CTA.** "Alice invited
   you to \"Team\" for X" beats "Join \"Team\" for X". Personalised
   subjects measurably improve inbox rate.

8. **No spammy phrasing.** Avoid:
   - "Last chance", "URGENT", "Don't miss out", "Limited time" — all
     trigger commercial-mail filters.
   - ALL CAPS WORDS. More than one full-caps word in the subject is
     enough to drop a few deliverability points.
   - Emoji prefixes (🚀✨💸) — they don't help and tank more often than not.
   - More than one exclamation mark, ever.

9. **Keep it under ~60 characters.** Long subjects get truncated and
   look spammy in mobile previews. The reminder subject we shipped is
   `Your "${teamName}" invite expires soon` — short, factual, no panic.

   **Never interpolate a raw `hackathonName` into a subject.** Event names
   are long and often contain `|` (e.g. `Hackers & Healers | AI in
   Healthcare Co-Design Hackathon`), which both blows past 60 characters
   and reads as bulk/marketing mail. Wrap every name in a subject with
   `shortHackathonName()` from [`utils.ts`](utils.ts) — it drops everything
   after the first `|` and truncates on a word boundary. Bodies and event
   links keep the full name; only the subject is shortened.

   **Exception: organizer-authored broadcast subjects.** `sendBulkEmail`
   (`lib/services/participant-emails.ts`) sends a subject the organizer
   typed themselves — it is free text, not a `…for ${hackathonName}`
   template. Do **not** run `shortHackathonName()` over it: the helper would
   truncate at the first `|` or at 45 chars and mangle a legitimate subject
   like `Round 2 starts Monday | read this first`. Organizer-composed
   subjects are passed through verbatim by design.

## Body

10. **Don't repeat the link 5 times.** One primary CTA + one inline link is
    plenty. Excess link density is a strong spam signal.

11. **Match the visible text and the `href`.** "Click here" pointing at
    `https://getoatmeal.com/invite/<token>` is fine; "click here" pointing
    at a tracker that redirects to a third-party domain is not.

12. **Always include an unsubscribe line in the visible body for any
    recurring email** (reminders, announcements, surveys). The
    `List-Unsubscribe` header alone is not enough — many filters look for
    a visible footer link too. Single-shot transactional emails (single
    invite, password reset, receipt) are exempt.

13. **Avoid base64-encoded images and giant inline assets.** Reference
    public URLs with `<img src="...">` and rely on Resend's outbound
    proxy.

## Sending volume

14. **Don't send the same email to the same recipient twice without a
    cooldown.** Reminder emails should track `*_emailed_at` (see
    `team_invitations.emailed_at` for the pattern) and skip already-sent
    rows.

15. **Bulk sends fan out per recipient.** If you're sending to >50
    recipients in one operation, throttle with an interval between sends
    (Resend's API is happy at 10/s, but burst sends look bot-like).

## Code shape

A correct send call looks like this:

```ts
import { sendEmail } from "@/lib/email/resend"
import {
  renderEmail,
  buildUnsubscribeHeaders,
  getReplyToAddress,
  sanitizeTag,
} from "@/lib/email/utils"
import MyEmailTemplate from "@/emails/my-email"

const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/path/${token}`
const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/public/<resource>/${token}/unsubscribe`

const { html, text } = await renderEmail(
  MyEmailTemplate({ ... }),
)

await sendEmail({
  to,
  subject: `${inviterName} invited you to ${thing}`,
  html,
  text,
  replyTo: getReplyToAddress(),
  headers: buildUnsubscribeHeaders(unsubscribeUrl),
  tags: [
    { name: "type", value: "my_email" },
    { name: "hackathon", value: sanitizeTag(hackathonName) },
  ],
})
```

If your email omits any of `text`, `replyTo`, `headers`, or `tags`, that's
a deliverability bug — fix it before merging, not after the first
"my mail is in spam" report.

## Email link query params

When an email links the recipient to a sign-in / sign-up page with
`?email=` pre-filled (as the invite flow does), remember:

- The address ends up in browser history, server access logs, and any
  analytics that capture URL params (PostHog, etc.). Don't put anything
  more sensitive than the invitee's own email in there.
- Only honour the `?email=` param when a `?redirect_url=` is also
  present. A bare `/sign-in?email=victim@corp.com` URL is phishing-
  friendly — anyone can craft one. The signed-up form must come from a
  flow that also dictates where the user lands.
- Don't pass tokens, session IDs, or anything else that would let a
  reader of the log act on behalf of the user.
