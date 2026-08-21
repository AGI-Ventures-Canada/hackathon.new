import { verifyWebhook } from "@clerk/nextjs/webhooks"
import type { NextRequest } from "next/server"
import { forwardClerkEmail } from "@/lib/email/clerk-emails"

export async function POST(request: NextRequest): Promise<Response> {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
  if (!signingSecret) {
    console.error("[clerk webhook] CLERK_WEBHOOK_SIGNING_SECRET is not configured")
    return Response.json({ error: "Webhook is not configured." }, { status: 500 })
  }

  let event
  try {
    event = await verifyWebhook(request, { signingSecret })
  } catch (error) {
    console.error(
      "[clerk webhook] Signature verification failed:",
      error instanceof Error ? error.message : error
    )
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 })
  }

  if (event.type !== "email.created") {
    return new Response(null, { status: 204 })
  }

  const result = await forwardClerkEmail(event.data)
  if (result.status === "invalid") {
    console.error("[clerk webhook] Email payload is incomplete", {
      emailId: event.data.id,
      reason: result.reason,
      slug: event.data.slug,
    })
    return Response.json({ error: "Email payload is incomplete." }, { status: 422 })
  }

  if (result.status === "failed") {
    console.error("[clerk webhook] Resend did not accept the email", {
      emailId: event.data.id,
      slug: event.data.slug,
    })
    return Response.json({ error: "Email delivery failed." }, { status: 503 })
  }

  return Response.json({ received: true, status: result.status })
}
