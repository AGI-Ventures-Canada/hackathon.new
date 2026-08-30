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

export type TransitionRecipient = {
  email: string
  role: string
}

const ROLE_PRIORITY: Record<string, number> = {
  judge: 2,
  participant: 1,
}

function preferredRole(current: string | undefined, candidate: string): string {
  if (!current) return candidate
  return (ROLE_PRIORITY[candidate] ?? 0) > (ROLE_PRIORITY[current] ?? 0)
    ? candidate
    : current
}

export async function fetchTransitionRecipients(
  hackathonId: string,
  roles: string[]
): Promise<TransitionRecipient[]> {
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("hackathon_participants")
    .select("clerk_user_id, role")
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

  const rolesByUserId = new Map<string, string>()
  for (const participant of participants as Array<{
    clerk_user_id: string
    role?: string | null
  }>) {
    const role = participant.role ?? "participant"
    rolesByUserId.set(
      participant.clerk_user_id,
      preferredRole(rolesByUserId.get(participant.clerk_user_id), role),
    )
  }
  const clerkUserIds = [...rolesByUserId.keys()]
  const recipientsByEmail = new Map<string, TransitionRecipient>()

  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()

  for (let i = 0; i < clerkUserIds.length; i += 100) {
    const batch = clerkUserIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch, limit: 100 })
    for (const user of users.data) {
      const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress
      if (!email || !user.id) continue
      const normalizedEmail = email.trim().toLowerCase()
      const role = rolesByUserId.get(user.id) ?? "participant"
      const current = recipientsByEmail.get(normalizedEmail)
      recipientsByEmail.set(normalizedEmail, {
        email: normalizedEmail,
        role: preferredRole(current?.role, role),
      })
    }
  }

  return [...recipientsByEmail.values()].sort((left, right) =>
    left.email.localeCompare(right.email),
  )
}

export async function fetchRecipientEmails(
  hackathonId: string,
  roles: string[],
): Promise<string[]> {
  return (await fetchTransitionRecipients(hackathonId, roles)).map(
    (recipient) => recipient.email,
  )
}

export type SendTransitionEmailInput = {
  notificationId: string
  to: string
  event: TransitionEvent
  recipientRole?: string
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
      recipientRole: input.recipientRole,
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
