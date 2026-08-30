import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { HackathonStatus, ParticipantRole } from "@/lib/db/hackathon-types"
import { clerkClient } from "@clerk/nextjs/server"
import { sendEmail } from "@/lib/email/resend"
import {
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  sanitizeTag,
  htmlToPlainText,
  paceBulkSend,
} from "@/lib/email/utils"
import { createHash } from "node:crypto"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24)
}

export type BulkEmailResult = {
  sent: number
  failed: number
}

export async function sendBulkEmail(
  hackathonId: string,
  input: {
    subject: string
    html: string
    recipientFilter?: ParticipantRole[]
    deliveryId: string
  }
): Promise<BulkEmailResult> {
  const subject = input.subject.trim()
  if (!subject) throw new Error("Add a subject before sending this email.")

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("name, status, starts_at, ends_at, is_test_event")
    .eq("id", hackathonId)
    .single()

  if (hackathonError || !hackathon) {
    throw new Error(
      `Failed to load the event for its email: ${hackathonError?.message ?? "not found"}`,
    )
  }
  const disposition = getNotificationDisposition({
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
    is_test_event: hackathon.is_test_event,
  })
  if (disposition === "queue") {
    throw new Error("Go live before sending an email blast.")
  }
  if (disposition === "reject") {
    throw new Error("This event has ended.")
  }

  let query = client
    .from("hackathon_participants")
    .select("clerk_user_id, role")
    .eq("hackathon_id", hackathonId)

  if (input.recipientFilter && input.recipientFilter.length > 0) {
    query = query.in("role", input.recipientFilter)
  }

  const { data: participants, error } = await query

  if (error) {
    throw new Error(`Failed to load email recipients: ${error.message}`)
  }
  if (!participants || participants.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const clerkUserIds = [...new Set(
    participants.map((p: { clerk_user_id: string }) => p.clerk_user_id),
  )]
  const emails: string[] = []
  let unresolved = 0

  try {
    const clerk = await clerkClient()
    for (let i = 0; i < clerkUserIds.length; i += 100) {
      const batch = clerkUserIds.slice(i, i + 100)
      const users = await clerk.users.getUserList({ userId: batch, limit: 100 })
      const usersById = new Map(users.data.map((user) => [user.id, user]))
      for (const userId of batch) {
        const user = usersById.get(userId)
        if (!user) {
          unresolved++
          continue
        }
        const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress
        if (email) emails.push(email)
        else unresolved++
      }
    }
  } catch {
    return { sent: 0, failed: participants.length }
  }

  let sent = 0
  let failed = unresolved

  const uniqueEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()))]
  const text = htmlToPlainText(input.html)
  if (!text) throw new Error("Add some readable text before sending this email.")
  const replyTo = getReplyToAddress()
  const headers = buildMailtoUnsubscribeHeaders()
  const tags = [
    { name: "type", value: "participant_broadcast" },
    ...(hackathon?.name
      ? [{ name: "hackathon", value: sanitizeTag(hackathon.name) }]
      : []),
  ]
  const operationKey = fingerprint(input.deliveryId)

  for (let index = 0; index < uniqueEmails.length; index += 1) {
    const email = uniqueEmails[index]
    await paceBulkSend(index)
    const result = await sendEmail({
      to: email,
      subject,
      html: input.html,
      text,
      replyTo,
      headers,
      tags,
      idempotencyKey: `participant-broadcast/${hackathonId}/${operationKey}/${fingerprint(email)}`,
    })
    if (result) {
      sent++
    } else {
      failed++
    }
  }

  return { sent, failed }
}
