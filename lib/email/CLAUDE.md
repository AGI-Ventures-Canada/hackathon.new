# Email Service (Resend + React Email)

This directory contains the Resend SDK integration for sending and receiving emails. Email templates are built with React Email components.

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
    oatmeal-layout.tsx               # Dark header + white body + footer
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
  actionUrl: "https://getoatmeal.com/action",
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

- **OatmealLayout**: Wraps all emails. Props: `heading`, `preview?`, `children`, `footerText?`
- **InfoBox**: Gray highlight box. Props: `label`, `children`
- **CTAButton**: Dark primary or outline secondary button. Props: `href`, `children`, `variant?`
- **constants.ts**: Color tokens and font family — use these instead of hardcoding hex values

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

`sendEmail` catches a missing `RESEND_API_KEY` (thrown by `getResendClient`) and returns `null` with a `console.warn` instead of propagating the exception. Callers already handle `null`, so this is intentional for local-dev resilience. **Production implication:** if `RESEND_API_KEY` is removed from the environment, emails will silently stop sending — there will be no uncaught exception or 5xx alert, only a `[email] Resend client unavailable` warn in the logs. Monitor for this warn in production rather than relying on exception alerting.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key (required) |
| `RESEND_FROM_EMAIL` | Default from address |
| `RESEND_WEBHOOK_SECRET` | For verifying inbound webhooks |
| `RESEND_RECEIVING_DOMAIN` | Domain for inbound email addresses |

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
