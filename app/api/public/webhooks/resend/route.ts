import { getResendClient, verifyResendWebhook } from "@/lib/email/resend"
import { processReminderReply } from "@/lib/services/reminder-replies"
import { isValidUuid } from "@/lib/utils/uuid"
import { reminderReplyAddress } from "@/lib/services/reminder-delivery"

export async function POST(request: Request): Promise<Response> {
  if (!process.env.RESEND_WEBHOOK_SECRET || !process.env.RESEND_API_KEY || !reminderReplyAddress("0".repeat(24))) {
    return Response.json({ error: "Webhook is not configured." }, { status: 503 })
  }
  if (Number(request.headers.get("content-length")) > 256_000) return new Response(null, { status: 413 })
  const raw = await request.text()
  if (raw.length > 256_000) return new Response(null, { status: 413 })
  if (!verifyResendWebhook(raw, {
    svixId: request.headers.get("svix-id") ?? "",
    svixTimestamp: request.headers.get("svix-timestamp") ?? "",
    svixSignature: request.headers.get("svix-signature") ?? "",
  })) return Response.json({ error: "Invalid webhook signature." }, { status: 400 })
  let event: { type?: string; data?: { email_id?: string } }
  try {
    event = JSON.parse(raw)
    if (!event || typeof event !== "object" || Array.isArray(event)) return new Response(null, { status: 400 })
  } catch { return new Response(null, { status: 400 }) }
  if (event.type !== "email.received") return new Response(null, { status: 204 })
  if (!event.data?.email_id || !isValidUuid(event.data.email_id)) return new Response(null, { status: 400 })
  try {
    const received = await getResendClient().emails.receiving.get(event.data.email_id)
    if (received.error || !received.data || received.data.id !== event.data.email_id) throw new Error("Inbound email unavailable")
    const status = await processReminderReply({ ...received.data, to: received.data.received_for })
    return Response.json({ received: true, status })
  } catch {
    return Response.json({ error: "Could not process reply." }, { status: 503 })
  }
}
