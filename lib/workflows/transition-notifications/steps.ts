"use step"

import type {
  ChallengeSummary,
  TransitionEvent,
} from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export async function fetchRecipientEmails(
  hackathonId: string,
  roles: string[]
): Promise<string[]> {
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("hackathon_participants")
    .select("clerk_user_id")
    .eq("hackathon_id", hackathonId)

  if (roles.length > 0) {
    query = query.in("role", roles)
  }

  const { data: participants, error } = await query

  if (error) {
    throw new Error(`Failed to load notification recipients: ${error.message}`)
  }
  if (!participants || participants.length === 0) {
    return []
  }

  const clerkUserIds = [...new Set(participants.map(
    (p: { clerk_user_id: string }) => p.clerk_user_id
  ))]
  const emails: string[] = []

  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()

  for (let i = 0; i < clerkUserIds.length; i += 100) {
    const batch = clerkUserIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch, limit: 100 })
    for (const user of users.data) {
      const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress
      if (email) emails.push(email)
    }
  }

  return [...new Set(emails.map((email) => email.trim().toLowerCase()))]
}

export type SendTransitionEmailInput = {
  notificationId: string
  to: string
  event: TransitionEvent
  hackathonName: string
  hackathonSlug: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  challenges?: ChallengeSummary[]
}

export async function sendTransitionEmail(
  input: SendTransitionEmailInput
): Promise<void> {
  const { buildTransitionEmail } = await import(
    "@/lib/email/transition-notifications"
  )
  const { sendEmail } = await import("@/lib/email/resend")
  const { getReplyToAddress, buildMailtoUnsubscribeHeaders } = await import(
    "@/lib/email/utils"
  )

  const hasChallenges = !!input.challenges && input.challenges.length > 0
  const { subject, html, text, tag } = await buildTransitionEmail(
    input.event,
    input.hackathonName,
    input.hackathonSlug,
    {
      hackathonStartsAt: input.hackathonStartsAt,
      hackathonEndsAt: input.hackathonEndsAt,
      challenges: input.challenges,
    }
  )

  const result = await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      {
        name: "type",
        value: hasChallenges
          ? `transition_${input.event}_with_challenges`
          : `transition_${input.event}`,
      },
      { name: "hackathon", value: tag },
    ],
    idempotencyKey: `transition/${input.notificationId}/${recipientFingerprint(input.to)}`,
  })

  if (!result) {
    throw new Error(`Failed to send transition email to ${input.to}`)
  }
}
