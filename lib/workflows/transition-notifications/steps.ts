"use step"

import type { TransitionEvent } from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"

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

  if (error || !participants || participants.length === 0) {
    return []
  }

  const clerkUserIds = participants.map(
    (p: { clerk_user_id: string }) => p.clerk_user_id
  )
  const emails: string[] = []

  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()

  for (let i = 0; i < clerkUserIds.length; i += 100) {
    const batch = clerkUserIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch })
    for (const user of users.data) {
      const email = user.emailAddresses[0]?.emailAddress
      if (email) emails.push(email)
    }
  }

  return emails
}

export type ChallengeSummary = {
  title: string
  description: string | null
}

export type SendTransitionEmailInput = {
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
    tags: [
      {
        name: "type",
        value: hasChallenges
          ? `transition_${input.event}_with_challenges`
          : `transition_${input.event}`,
      },
      { name: "hackathon", value: tag },
    ],
  })

  if (!result) {
    throw new Error(`Failed to send transition email to ${input.to}`)
  }
}
