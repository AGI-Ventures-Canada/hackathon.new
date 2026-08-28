# Email Service (Resend + React Email)

This directory contains the Resend SDK integration for sending and receiving emails. Email templates are built with React Email components.

> **Read [DELIVERABILITY.md](DELIVERABILITY.md) before adding any new email
> here.** It encodes the rules that keep mail out of spam folders (List-
> Unsubscribe headers, plain-text body, replyTo, subject phrasing,
> verified-domain From). Anything that ships from this directory must
> follow them — the team-invitation regression in PR #334 is exactly the
> kind of mistake the doc exists to prevent.

## Overview

Resend provides email sending with tracking, plus inbound email support via webhooks. Used for:
- Hackathon lifecycle notifications (invitations, results, reminders)
- Agent notifications (run started, completed, failed)
- Email-triggered agents (inbound emails trigger agent runs)

## Architecture

Email templates use React Email components rendered to HTML/text strings at send time.

```
emails/                              # React Email components
  _components/                       # Shared layout + primitives
    constants.ts                     # Color tokens, font family
    oatmeal-layout.tsx               # Shared dark header + white body + footer
    info-box.tsx                     # Gray info box
    cta-button.tsx                   # Primary/secondary CTA button
  team-invitation.tsx                # Team join invitation
  judge-invitation.tsx               # Judge invitation
  judge-added.tsx                    # Judge added notification
  winner-notification.tsx            # Winner placement + prizes
  results-announcement.tsx           # Results published (non-winners)
  feedback-survey.tsx                # Post-event feedback request
  transition-notification.tsx        # Lifecycle transitions
  post-event-reminder.tsx            # Generic reminder template
  agent-notification.tsx             # Agent run notification
lib/email/
  resend.ts                          # Resend SDK wrapper (sendEmail, webhooks)
  clerk-emails.ts                    # Forwards verified Clerk email events through Resend
  utils.ts                           # Shared sanitizeTag()
  team-invitations.ts                # Send logic + DB queries
  judge-invitations.ts               # Send logic for judge emails
  winner-notifications.ts            # Winner emails with prizes
  results-announcement.ts            # Results for non-winners
  feedback-survey.ts                 # Feedback survey emails
  transition-notifications.ts        # Lifecycle transition builder
  post-event-reminders.ts            # Reminder emails with content builders
```

## Adding a New Email Template

1. Create a React Email component in `emails/`:
```typescript
import { Text } from "@react-email/components"
import { OatmealLayout } from "./_components/oatmeal-layout"
import { CTAButton } from "./_components/cta-button"

interface MyEmailProps {
  name: string
  actionUrl: string
}

export default function MyEmail({ name, actionUrl }: MyEmailProps) {
  return (
    <OatmealLayout heading="Hello!" preview={`Hi ${name}`}>
      <Text style={{ fontSize: "16px", marginBottom: "24px" }}>
        Hi {name}, here is your action.
      </Text>
      <CTAButton href={actionUrl}>Take Action</CTAButton>
    </OatmealLayout>
  )
}

MyEmail.PreviewProps = {
  name: "Jane",
  actionUrl: "https://hackathon.new/action",
} satisfies MyEmailProps
```

2. Render and send in `lib/email/`:
```typescript
import { render } from "@react-email/components"
import { sendEmail } from "./resend"
import { sanitizeTag } from "./utils"
import MyEmail from "@/emails/my-email"

export async function sendMyEmail(to: string, name: string) {
  const html = await render(MyEmail({ name, actionUrl: "..." }))
  const text = await render(MyEmail({ name, actionUrl: "..." }), { plainText: true })

  return sendEmail({ to, subject: "Hello!", html, text })
}
```

3. Preview with `bun email:dev` (runs on port 3001)

## Shared Components

- **Shared email layout**: Wraps all emails. Props: `heading`, `preview?`, `children`, `footerText?`, `eventUrl?`, `hackathonName?`. When `eventUrl` is provided, renders a footer link to the event page.
- **InfoBox**: Neutral bordered highlight box. Props: `label`, `children`
- **EventDetailBox**: Multi-field hackathon info box. Props: `hackathonName`, `startsAt?`, `endsAt?`, `location?`. Use instead of InfoBox when showing hackathon details with dates.
- **CTAButton**: Primary (accent) or secondary (light) button. Props: `href`, `children`, `variant?`
- **constants.ts**: Color tokens (`colors`), font families (`fontFamily`, `monoFontFamily`), `fontSize`, and `spacing` — use these instead of hardcoding values

## Sending Email

### Basic Email

```typescript
import { sendEmail } from "@/lib/email/resend"

await sendEmail({
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Email content</p>",
  text: "Email content",
})
```

### Agent Notifications

```typescript
import { sendAgentNotification } from "@/lib/email/resend"

await sendAgentNotification(
  "user@example.com",
  "My Agent",
  "run_123",
  "completed",
  { output: "Task completed successfully" }
)
```

## Dev Server

```bash
bun email:dev    # Preview all templates at http://localhost:3001
```

## Receiving Email

### Webhook Setup

1. Configure Resend inbound domain
2. Set `RESEND_WEBHOOK_SECRET` for signature verification
3. Webhook endpoint: `POST /api/public/webhooks/resend`

### Inbound Email Flow

```
Email arrives → Resend webhook → Verify signature →
  Store email → Find linked agent → Trigger run
```

## Sending Clerk Emails Through Resend

Clerk owns authentication and organization invitation state, but hackathon.new owns delivery:

1. Configure `POST /api/webhooks/clerk` in the Clerk Dashboard and subscribe to `email.created`.
2. Set `CLERK_WEBHOOK_SIGNING_SECRET` from that endpoint in every deployed environment.
3. Send a Clerk test event and confirm the endpoint returns `200`.
4. Disable **Delivered by Clerk** for each email template that Resend should deliver.

Production builds run `bun run check:production-email-delivery`. The check requires the Resend and Clerk webhook secrets, reads every Clerk email template, and stops the deployment if any template is still delivered by Clerk. Run it locally against the configured Clerk instance with `bun run check:production-email-delivery --force`.

The webhook verifies Clerk's signature, ignores messages already delivered by Clerk, and forwards Clerk's rendered HTML, plain text, recipient, and subject through `sendEmail()`. The Clerk email ID is used as the Resend idempotency key so webhook retries do not create duplicate messages.

Do not disable Clerk delivery before the webhook and signing secret are live. Clerk configures delivery per template, so repeat the test for every template you move to Resend.

### Email Address Configuration

```typescript
import { createEmailAddress, generateInboundEmailAddress } from "@/lib/services/triggers"

// Auto-generate address
const address = generateInboundEmailAddress(tenantId)
// Returns: inbox-abc123@agents.resend.app

// Or use custom domain
await createEmailAddress({
  tenantId,
  address: "receipts@mycompany.com",
  domain: "mycompany.com",
  isCustomDomain: true,
  agentId: "...",  // Link to agent
})
```

### Webhook Verification

```typescript
import { verifyResendWebhook } from "@/lib/email/resend"

const isValid = verifyResendWebhook(rawBody, {
  svixId: headers["svix-id"],
  svixTimestamp: headers["svix-timestamp"],
  svixSignature: headers["svix-signature"],
})
```

## Failure Modes

`sendEmailWithResult` returns a typed provider acceptance or failure with a safe code, retryability, attempt count, and duration. Provider calls time out after 10 seconds by default. Retryable failures use bounded exponential backoff only when the caller supplies a stable Resend idempotency key. `sendEmail` remains the compatibility wrapper and returns `{ id }` on provider acceptance or `null` on failure.

Both HTML and plain text are required. Subjects are normalized to one line. Sender and reply-to values containing CR/LF are rejected before provider dispatch. A missing API key or sender returns `email_provider_not_configured` instead of throwing from the delivery wrapper.

Every retryable or bulk path must use a stable, privacy-safe idempotency key. Batch sends need a different key per recipient. Use `paceBulkSend(index)` to pause after each group of eight provider calls. Persist `sent_at`, `emailed_at`, or other completion state only after the provider returns an accepted message ID; a queued workflow or started request is not a completed delivery.

The reference implementation's `email_log` and email-preference tables were reviewed but intentionally not copied here. They require schema and product-policy work outside this PR.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key (required) |
| `RESEND_FROM_EMAIL` | Default from address |
| `RESEND_REPLY_TO_EMAIL` | Default reply-to address; falls back to the sender address |
| `RESEND_REQUEST_TIMEOUT_MS` | Optional provider timeout from 100 to 30,000 ms; defaults to 10,000 ms |
| `RESEND_WEBHOOK_SECRET` | For verifying inbound webhooks |
| `RESEND_RECEIVING_DOMAIN` | Domain for inbound email addresses |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Verifies Clerk `email.created` webhooks |

Deliverability references:
- Resend guidance on reply-friendly senders: https://resend.com/docs/dashboard/emails/deliverability-insights
- Resend guidance on sending subdomains: https://resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain

## Email-Triggered Agent Example

1. Create inbound email address:
```typescript
await createEmailAddress({
  tenantId,
  address: "receipts@org.resend.app",
  domain: "org.resend.app",
  agentId: receiptParserAgentId,
})
```

2. When email arrives, agent runs with input:
```json
{
  "trigger": "email",
  "from": "store@example.com",
  "subject": "Your Receipt",
  "body": "Receipt details...",
  "attachments": [...]
}
```

## Debugging React Email

### Common Issues

#### Build/Runtime Errors from Bundling

React Email components use Node.js APIs (`fs`, `path`, streams) that break when Next.js tries to bundle them for the Edge or client. Symptoms:

- `Module not found: Can't resolve 'fs'` or `'path'` during `next build`
- `TypeError: Cannot read properties of undefined` at runtime when rendering emails
- `Dynamic require of "..." is not supported` errors

**Fix:** Ensure all React Email packages are in `serverExternalPackages` in [next.config.ts](../../next.config.ts). When upgrading or adding new `@react-email/*` packages, add them here too:

```typescript
serverExternalPackages: [
  // ... other packages
  "@react-email/components",
  "@react-email/render",
]
```

**How to verify:** Run `bun run build` — if it passes without email-related module errors, bundling is correct.

#### `render()` Returns Empty or Broken HTML

- Check that the component is being called as a function, not passed as JSX to `render()`:
  ```typescript
  // CORRECT — call the component to get a React element
  const html = await render(MyEmail({ name: "Jane" }))

  // WRONG — don't pass JSX; render() expects a React element from a function call
  const html = await render(<MyEmail name="Jane" />)
  ```
- Check `PreviewProps` — if the component works in `bun email:dev` but fails at send time, the props you're passing at runtime may be missing required fields or have wrong types.

#### Styles Not Rendering in Email Clients

React Email uses inline styles, not Tailwind classes. If styles disappear in Gmail/Outlook:

- Use the `style` prop on React Email primitives (`<Text>`, `<Section>`, `<Row>`, etc.) — not `className`
- Use the color tokens from [emails/_components/constants.ts](../../emails/_components/constants.ts) instead of hardcoded hex values
- Test with `bun email:dev` (port 3001) to preview across email client rendering

#### Template Not Showing in Dev Preview

`bun email:dev` scans the `emails/` directory. If a new template doesn't appear:

- Verify the file is directly in `emails/` (not in a subdirectory like `emails/_components/`)
- Verify the file has a `default` export (named exports won't be picked up as templates)
- Restart the dev server — `email dev` doesn't always hot-reload new files

### Research Workflow

When debugging a React Email issue you haven't seen before:

1. **Check the dev preview first:** `bun email:dev` — does the template render at `http://localhost:3001`? If yes, the issue is in the send path or Next.js bundling, not the template itself.

2. **Isolate render vs. send:** Add a temporary log to see what `render()` produces:
   ```typescript
   const html = await render(MyEmail({ ...props }))
   console.log("[email debug] html length:", html.length)
   console.log("[email debug] html preview:", html.slice(0, 500))
   ```

3. **Check `serverExternalPackages`:** If the error is a module resolution or bundling failure, check [next.config.ts](../../next.config.ts). Run `bun run build` to reproduce — these errors only appear at build time or in production mode, not in dev.

4. **Check React Email changelogs:** When upgrading `@react-email/components` or `react-email`, breaking changes often involve the render API or component props. Check:
   - React Email releases: https://github.com/resend/react-email/releases
   - `@react-email/components` changelog: https://github.com/resend/react-email/blob/main/packages/components/CHANGELOG.md
   - `@react-email/render` changelog: https://github.com/resend/react-email/blob/main/packages/render/CHANGELOG.md

5. **Test the rendered output:** Email template tests (`bun run test:email`) assert on HTML content with `.toContain()`. If a template change breaks tests, inspect the actual HTML:
   ```typescript
   const call = mockSendEmail.mock.calls[0][0]
   console.log(call.html) // full rendered HTML
   ```

6. **Verify in actual email client:** The dev preview approximates rendering but doesn't match Gmail/Outlook exactly. For critical templates, send a real test email via Resend's dashboard or a temporary script and check it in the target client.

### Key Files

| File | Role |
|------|------|
| [next.config.ts](../../next.config.ts) | `serverExternalPackages` — must include all `@react-email/*` packages |
| [lib/email/utils.ts](utils.ts) | `renderEmail()` — shared render helper that produces both HTML and plain text |
| [lib/email/resend.ts](resend.ts) | `sendEmail()` — Resend SDK wrapper, handles missing API key gracefully |
| [emails/_components/](../../emails/_components/) | Shared layout, buttons, info boxes, color constants |
| [emails/](../../emails/) | All email templates (one default export per file) |
| [__tests__/lib/email-templates.test.ts](../../__tests__/lib/email-templates.test.ts) | Template smoke tests (render without error) |
| [__tests__/integration/*.email.test.ts](../../__tests__/integration/) | Email integration tests (mock `sendEmail`, assert on content) |

## Documentation Links

- Introduction: https://resend.com/docs/introduction
- Send with Node.js: https://resend.com/docs/send-with-nodejs
- Send with Next.js: https://resend.com/docs/send-with-nextjs
- API Reference: https://resend.com/docs/api-reference/emails/send-email
- Retrieve Email: https://resend.com/docs/api-reference/emails/retrieve-email
- Receiving Emails: https://resend.com/docs/dashboard/receiving/introduction
