import { Resend } from "resend"
import { renderEmail } from "./utils"
import AgentNotificationEmail from "@/emails/agent-notification"

let resendClient: Resend | null = null

export function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is required")
    }
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
  idempotencyKey?: string
}

export interface SendEmailResult {
  id: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult | null> {
  let client: Resend
  try {
    client = getResendClient()
  } catch (err) {
    console.warn("[email] Resend client unavailable — email not sent:", err instanceof Error ? err.message : err)
    return null
  }
  const fromEmail = input.from ?? process.env.RESEND_FROM_EMAIL
  if (!fromEmail) {
    console.error(
      "RESEND_FROM_EMAIL environment variable is not set. Add it to .env.local (e.g. RESEND_FROM_EMAIL=noreply@hackathon.new)"
    )
    return null
  }

  try {
    // Build email options - Resend SDK has complex union types requiring html, text, or template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailOptions: any = {
      from: fromEmail,
      to: input.to,
      subject: input.subject,
    }

    if (input.html) emailOptions.html = input.html
    if (input.text) emailOptions.text = input.text
    if (input.replyTo) emailOptions.replyTo = input.replyTo
    if (input.headers) emailOptions.headers = input.headers
    if (input.tags) emailOptions.tags = input.tags

    const { data, error } = await client.emails.send(
      emailOptions,
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    )

    if (error) {
      console.error("Failed to send email:", error)
      return null
    }

    return { id: data?.id ?? "" }
  } catch (err) {
    console.error("Failed to send email:", err)
    return null
  }
}

export async function getReceivedEmail(
  emailId: string
): Promise<ReceivedEmailContent | null> {
  const client = getResendClient()

  try {
    const { data, error } = await client.emails.get(emailId)

    if (error || !data) {
      console.error("Failed to get email:", error)
      return null
    }

    return {
      id: data.id,
      from: data.from,
      to: data.to,
      subject: data.subject,
      html: data.html ?? undefined,
      text: data.text ?? undefined,
      createdAt: data.created_at,
    }
  } catch (err) {
    console.error("Failed to get email:", err)
    return null
  }
}

export interface ReceivedEmailContent {
  id: string
  from: string
  to: string[]
  subject: string
  html?: string
  text?: string
  createdAt: string
}

export interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    cc?: string[]
    bcc?: string[]
    message_id?: string
    attachments?: Array<{
      id: string
      filename: string
      content_type: string
    }>
  }
}

export function verifyResendWebhook(
  payload: string,
  headers: {
    svixId: string
    svixTimestamp: string
    svixSignature: string
  }
): boolean {
  const client = getResendClient()
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET not configured")
    return false
  }

  try {
    client.webhooks.verify({
      payload,
      headers: {
        id: headers.svixId,
        timestamp: headers.svixTimestamp,
        signature: headers.svixSignature,
      },
      webhookSecret: secret,
    })
    return true
  } catch {
    return false
  }
}

export type AgentNotificationType = "started" | "completed" | "failed"

export async function sendAgentNotification(
  email: string,
  agentName: string,
  runId: string,
  type: AgentNotificationType,
  details?: { output?: string; error?: string }
): Promise<SendEmailResult | null> {
  const subjects: Record<AgentNotificationType, string> = {
    started: `Agent "${agentName}" has started`,
    completed: `Agent "${agentName}" completed successfully`,
    failed: `Agent "${agentName}" failed`,
  }

  const { html, text } = await renderEmail(
    AgentNotificationEmail({
      agentName,
      runId,
      type,
      output: details?.output,
      error: details?.error,
    })
  )

  return sendEmail({
    to: email,
    subject: subjects[type],
    html,
    text,
  })
}
