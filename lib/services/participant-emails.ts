import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ParticipantRole } from "@/lib/db/hackathon-types"
import { clerkClient } from "@clerk/nextjs/server"
import { sendEmail } from "@/lib/email/resend"
import {
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  sanitizeTag,
} from "@/lib/email/utils"

export type BulkEmailResult = {
  sent: number
  failed: number
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "…",
  }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => codePointOr(m, parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => codePointOr(m, Number(dec)))
    .replace(/&[a-z]+;/gi, (m) => named[m.toLowerCase()] ?? m)
}

function codePointOr(original: string, code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return original
  try {
    return String.fromCodePoint(code)
  } catch {
    return original
  }
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

export async function sendBulkEmail(
  hackathonId: string,
  input: {
    subject: string
    html: string
    recipientFilter?: ParticipantRole[]
  }
): Promise<BulkEmailResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name")
    .eq("id", hackathonId)
    .single()

  let query = client
    .from("hackathon_participants")
    .select("clerk_user_id, role")
    .eq("hackathon_id", hackathonId)

  if (input.recipientFilter && input.recipientFilter.length > 0) {
    query = query.in("role", input.recipientFilter)
  }

  const { data: participants, error } = await query

  if (error || !participants || participants.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const clerkUserIds = participants.map((p: { clerk_user_id: string }) => p.clerk_user_id)
  const emails: string[] = []

  try {
    const clerk = await clerkClient()
    for (let i = 0; i < clerkUserIds.length; i += 100) {
      const batch = clerkUserIds.slice(i, i + 100)
      const users = await clerk.users.getUserList({ userId: batch })
      for (const user of users.data) {
        const email = user.emailAddresses[0]?.emailAddress
        if (email) emails.push(email)
      }
    }
  } catch {
    return { sent: 0, failed: participants.length }
  }

  let sent = 0
  let failed = 0

  const text = htmlToPlainText(input.html)
  const replyTo = getReplyToAddress()
  const headers = buildMailtoUnsubscribeHeaders()
  const tags = [
    { name: "type", value: "participant_broadcast" },
    ...(hackathon?.name
      ? [{ name: "hackathon", value: sanitizeTag(hackathon.name) }]
      : []),
  ]

  for (const email of emails) {
    const result = await sendEmail({
      to: email,
      subject: input.subject,
      html: input.html,
      text,
      replyTo,
      headers,
      tags,
    })
    if (result) {
      sent++
    } else {
      failed++
    }
  }

  return { sent, failed }
}
