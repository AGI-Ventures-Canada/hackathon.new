import { randomBytes } from "crypto"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/db/types"
import type { PrizeFulfillment, PrizeFulfillmentStatus } from "@/lib/db/hackathon-types"

const CLAIM_TOKEN_EXPIRY_DAYS = 30

export type FulfillmentWithDetails = PrizeFulfillment & {
  prizeName: string
  prizeValue: string | null
  prizeKind: string
  submissionTitle: string
  teamName: string | null
}

export type FulfillmentSummary = Record<PrizeFulfillmentStatus, number>

// Forward flow: assigned → contacted → claimed → shipped
// claimed→shipped: winner claims first (fills in details), then sponsor ships/fulfills.
// assigned→shipped: allows sponsors to mark fulfillment without a winner claim (e.g. digital codes sent directly).
// Used by markSponsorFulfilled in sponsor-fulfillments.ts.
const VALID_TRANSITIONS: Record<PrizeFulfillmentStatus, PrizeFulfillmentStatus[]> = {
  assigned: ["contacted", "shipped", "claimed"],
  contacted: ["shipped", "claimed"],
  shipped: ["claimed"],
  claimed: ["shipped"],
}

export async function initializeFulfillments(hackathonId: string): Promise<number> {
  const client = getSupabase()

  const { data: prizes } = await client
    .from("prizes")
    .select("id")
    .eq("hackathon_id", hackathonId)

  if (!prizes || prizes.length === 0) return 0

  const prizeIds = prizes.map((p) => p.id)

  const { data: assignments } = await client
    .from("prize_assignments")
    .select("id")
    .in("prize_id", prizeIds)

  if (!assignments || assignments.length === 0) return 0

  const { data: existing } = await client
    .from("prize_fulfillments")
    .select("prize_assignment_id")
    .eq("hackathon_id", hackathonId)

  const existingSet = new Set((existing ?? []).map((e) => e.prize_assignment_id))
  const newAssignments = assignments.filter((a) => !existingSet.has(a.id))

  if (newAssignments.length === 0) return 0

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS)

  const rows = newAssignments.map((a) => ({
    prize_assignment_id: a.id,
    hackathon_id: hackathonId,
    status: "assigned" as const,
    claim_token: randomBytes(32).toString("base64url"),
    claim_token_expires_at: expiresAt.toISOString(),
  }))

  const { error } = await client.from("prize_fulfillments").insert(rows)

  if (error) {
    console.error("Failed to initialize fulfillments:", error)
    return 0
  }

  return newAssignments.length
}

export async function listFulfillments(hackathonId: string): Promise<FulfillmentWithDetails[]> {
  const client = getSupabase()

  const { data: fulfillments, error } = await client
    .from("prize_fulfillments")
    .select(`
      *,
      prize_assignment:prize_assignments!prize_assignment_id(
        prize:prizes!prize_id(name, value, kind),
        submission:submissions!submission_id(title, team_id)
      )
    `)
    .eq("hackathon_id", hackathonId)
    .order("created_at")

  if (error || !fulfillments) {
    console.error("Failed to list fulfillments:", error)
    return []
  }

  const teamIds = fulfillments
    .map((f: Record<string, unknown>) => {
      const pa = f.prize_assignment as { submission: { team_id: string | null } } | null
      return pa?.submission?.team_id
    })
    .filter((id): id is string => id !== null)

  let teamsMap: Record<string, string> = {}
  if (teamIds.length > 0) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .in("id", [...new Set(teamIds)])
    teamsMap = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]))
  }

  return fulfillments.map((f: Record<string, unknown>) => {
    const pa = f.prize_assignment as {
      prize: { name: string; value: string | null; kind: string | null }
      submission: { title: string; team_id: string | null }
    }
    const fulfillment = f as unknown as PrizeFulfillment
    return {
      ...fulfillment,
      prizeName: pa.prize.name,
      prizeValue: pa.prize.value,
      prizeKind: pa.prize.kind ?? "other",
      submissionTitle: pa.submission.title,
      teamName: pa.submission.team_id ? teamsMap[pa.submission.team_id] ?? null : null,
    }
  })
}

export async function updateFulfillmentStatus(
  fulfillmentId: string,
  hackathonId: string,
  status: PrizeFulfillmentStatus,
  updates?: {
    notes?: string
    trackingNumber?: string
    shippingAddress?: string
    recipientEmail?: string
    recipientName?: string
  }
): Promise<PrizeFulfillment | null> {
  const client = getSupabase()

  const { data: existing } = await client
    .from("prize_fulfillments")
    .select("status")
    .eq("id", fulfillmentId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!existing) return null

  const currentStatus = existing.status as PrizeFulfillmentStatus
  if (!VALID_TRANSITIONS[currentStatus].includes(status)) {
    return null
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    status,
    updated_at: now,
  }

  if (status === "contacted") updateData.contacted_at = now
  if (status === "shipped") updateData.shipped_at = now
  if (status === "claimed") updateData.claimed_at = now

  if (updates?.notes !== undefined) updateData.notes = updates.notes
  if (updates?.trackingNumber !== undefined) updateData.tracking_number = updates.trackingNumber
  if (updates?.shippingAddress !== undefined) updateData.shipping_address = updates.shippingAddress
  if (updates?.recipientEmail !== undefined) updateData.recipient_email = updates.recipientEmail
  if (updates?.recipientName !== undefined) updateData.recipient_name = updates.recipientName

  const { data, error } = await client
    .from("prize_fulfillments")
    .update(updateData)
    .eq("id", fulfillmentId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to update fulfillment:", error)
    return null
  }

  const fulfillment = data as unknown as PrizeFulfillment

  if (status === "shipped" && fulfillment.recipient_email && fulfillment.tracking_number) {
    void notifyWinnerOfShipment(fulfillment, hackathonId, client).catch(console.error)
  }

  return fulfillment
}

async function notifyWinnerOfShipment(
  fulfillment: PrizeFulfillment,
  hackathonId: string,
  client: SupabaseClient<Database>
): Promise<void> {
  const { data: assignment } = await client
    .from("prize_assignments")
    .select("prize:prizes!prize_id(name)")
    .eq("id", fulfillment.prize_assignment_id)
    .single()

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name")
    .eq("id", hackathonId)
    .single()

  if (!assignment || !hackathon) return

  const pa = assignment as unknown as { prize: { name: string } }
  const { sendPrizeShippedEmail } = await import("@/lib/email/prize-shipped")
  await sendPrizeShippedEmail({
    recipientEmail: fulfillment.recipient_email!,
    recipientName: fulfillment.recipient_name ?? "Winner",
    prizeName: pa.prize.name,
    hackathonName: hackathon.name,
    trackingNumber: fulfillment.tracking_number,
  })
}

export type ClaimWithDetails = {
  fulfillmentId: string
  status: PrizeFulfillmentStatus
  prizeName: string
  prizeValue: string | null
  prizeKind: string
  distributionMethod: string | null
  hackathonName: string
  hackathonSlug: string
  submissionTitle: string
  teamName: string | null
  recipientName: string | null
  recipientEmail: string | null
  shippingAddress: string | null
  claimedAt: string | null
  expiresAt: string | null
}

export async function getClaimByToken(token: string): Promise<ClaimWithDetails | null> {
  const client = getSupabase()

  const { data: fulfillment, error } = await client
    .from("prize_fulfillments")
    .select(`
      id, status, recipient_name, recipient_email, shipping_address, claimed_at, claim_token_expires_at,
      prize_assignment:prize_assignments!prize_assignment_id(
        prize:prizes!prize_id(name, value, kind, distribution_method),
        submission:submissions!submission_id(title, team_id, hackathon_id)
      )
    `)
    .eq("claim_token", token)
    .single()

  if (error || !fulfillment) return null

  const pa = (fulfillment as Record<string, unknown>).prize_assignment as {
    prize: { name: string; value: string | null; kind: string; distribution_method: string | null }
    submission: { title: string; team_id: string | null; hackathon_id: string }
  }

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug")
    .eq("id", pa.submission.hackathon_id)
    .single()

  let teamName: string | null = null
  if (pa.submission.team_id) {
    const { data: team } = await client
      .from("teams")
      .select("name")
      .eq("id", pa.submission.team_id)
      .single()
    teamName = team?.name ?? null
  }

  return {
    fulfillmentId: fulfillment.id,
    status: fulfillment.status as PrizeFulfillmentStatus,
    prizeName: pa.prize.name,
    prizeValue: pa.prize.value,
    prizeKind: pa.prize.kind ?? "other",
    distributionMethod: pa.prize.distribution_method,
    hackathonName: hackathon?.name ?? "Hackathon",
    hackathonSlug: hackathon?.slug ?? "",
    submissionTitle: pa.submission.title,
    teamName,
    recipientName: fulfillment.recipient_name,
    recipientEmail: fulfillment.recipient_email,
    shippingAddress: fulfillment.shipping_address,
    claimedAt: fulfillment.claimed_at,
    expiresAt: fulfillment.claim_token_expires_at,
  }
}

export type SiblingClaim = {
  token: string
  fulfillmentId: string
  status: PrizeFulfillmentStatus
  prizeName: string
  prizeValue: string | null
  prizeKind: string
  distributionMethod: string | null
  recipientName: string | null
  recipientEmail: string | null
  shippingAddress: string | null
  isExpired: boolean
}

/**
 * Public projection of SiblingClaim for client-side use.
 * `recipientName` is intentionally kept — siblings are teammates who claimed
 * prizes for the same submission, so names are not sensitive in this context.
 * Any teammate opening a prize link can see names entered by other teammates;
 * this is acceptable because the claim page is scoped to a single submission's
 * team and names are already visible on the public results page.
 * `recipientEmail` and `shippingAddress` are stripped as PII.
 *
 * `token` is intentionally kept — it enables the multi-prize claim queue
 * where a single team member can claim all of their submission's prizes in
 * one session. All tokens belong to the same submission's prize assignments,
 * so cross-member token access is by design (any team member may claim on
 * behalf of the team).
 */
export type SiblingClaimPublic = Omit<SiblingClaim, "recipientEmail" | "shippingAddress">

export async function getSiblingClaims(token: string): Promise<SiblingClaim[]> {
  const client = getSupabase()

  const { data: fulfillment } = await client
    .from("prize_fulfillments")
    .select(`
      prize_assignment:prize_assignments!prize_assignment_id(
        submission_id
      )
    `)
    .eq("claim_token", token)
    .single()

  if (!fulfillment) return []

  const pa = (fulfillment as Record<string, unknown>).prize_assignment as { submission_id: string } | null
  if (!pa?.submission_id) return []

  const { data: assignments } = await client
    .from("prize_assignments")
    .select("id")
    .eq("submission_id", pa.submission_id)

  if (!assignments || assignments.length === 0) return []

  const assignmentIds = assignments.map((a) => a.id)

  const { data: siblings } = await client
    .from("prize_fulfillments")
    .select(`
      id, status, claim_token, claim_token_expires_at, recipient_name, recipient_email, shipping_address,
      prize_assignment:prize_assignments!prize_assignment_id(
        prize:prizes!prize_id(name, value, kind, distribution_method)
      )
    `)
    .in("prize_assignment_id", assignmentIds)
    .not("claim_token", "is", null)
    .order("created_at")

  if (!siblings) return []

  const now = new Date()

  return siblings.map((s: Record<string, unknown>) => {
    const spa = s.prize_assignment as {
      prize: { name: string; value: string | null; kind: string; distribution_method: string | null }
    }
    return {
      token: s.claim_token as string,
      fulfillmentId: s.id as string,
      status: s.status as PrizeFulfillmentStatus,
      prizeName: spa.prize.name,
      prizeValue: spa.prize.value,
      prizeKind: spa.prize.kind ?? "other",
      distributionMethod: spa.prize.distribution_method,
      recipientName: s.recipient_name as string | null,
      recipientEmail: s.recipient_email as string | null,
      shippingAddress: s.shipping_address as string | null,
      isExpired: s.claim_token_expires_at
        ? new Date(s.claim_token_expires_at as string) < now
        : false,
    }
  })
}

export type ClaimPrizeResult =
  | { success: true }
  | { success: false; error: string; code: string }

export async function claimPrize(
  token: string,
  data: {
    recipientName: string
    recipientEmail: string
    shippingAddress?: string
    paymentMethod?: string
    paymentDetail?: string
  }
): Promise<ClaimPrizeResult> {
  const client = getSupabase()

  const { data: fulfillment, error } = await client
    .from("prize_fulfillments")
    .select(`
      id, status, hackathon_id, prize_assignment_id, claim_token_expires_at,
      recipient_email,
      prize_assignment:prize_assignments!prize_assignment_id(
        prize:prizes!prize_id(
          name, kind, value,
          prize_track:prize_tracks!prize_track_id(
            sponsor:hackathon_sponsors!sponsor_id(
              sponsor_tenant_id
            )
          )
        )
      )
    `)
    .eq("claim_token", token)
    .single()

  if (error || !fulfillment) {
    return { success: false, error: "Prize claim not found", code: "not_found" }
  }

  if (fulfillment.claim_token_expires_at && new Date(fulfillment.claim_token_expires_at) < new Date()) {
    return { success: false, error: "This claim link has expired. Contact the organizer for a new one.", code: "expired" }
  }

  type ClaimPrizeAssignment = {
    prize: {
      name: string
      kind: string
      value: string | null
      prize_track: { sponsor: { sponsor_tenant_id: string | null } } | null
    }
  }
  const pa = (fulfillment as Record<string, unknown>).prize_assignment as ClaimPrizeAssignment | null

  if (fulfillment.status === "claimed") {
    const isCash = pa?.prize?.kind === "cash"

    if (!isCash) {
      return { success: false, error: "This prize has already been claimed", code: "already_claimed" }
    }
    if (fulfillment.recipient_email && fulfillment.recipient_email !== data.recipientEmail) {
      return { success: false, error: "This cash prize has already been claimed by another recipient", code: "already_claimed" }
    }

    return updateCashPrizePayment(fulfillment.id, data, client)
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    status: "claimed",
    claimed_at: now,
    updated_at: now,
    recipient_name: data.recipientName,
    recipient_email: data.recipientEmail,
  }
  if (data.shippingAddress) {
    updateData.shipping_address = data.shippingAddress
  }
  const hasPaymentMethod = !!data.paymentMethod
  const hasPaymentDetail = !!data.paymentDetail
  if (hasPaymentMethod !== hasPaymentDetail) {
    return { success: false, error: "Payment method and payment detail must both be provided", code: "invalid_payment" }
  }

  if (data.paymentMethod) {
    updateData.payment_method = data.paymentMethod
  }
  if (data.paymentDetail) {
    try {
      const { encryptToken } = await import("@/lib/services/encryption")
      updateData.payment_detail = encryptToken(data.paymentDetail)
    } catch (err) {
      console.error("[claimPrize] Failed to encrypt payment_detail:", err)
      return { success: false, error: "Unable to securely store payment details. Please try again.", code: "encryption_failed" }
    }
  }

  let query = client
    .from("prize_fulfillments")
    .update(updateData)
    .eq("id", fulfillment.id)
    .neq("status", "claimed")

  if (fulfillment.claim_token_expires_at) {
    query = query.gt("claim_token_expires_at", new Date().toISOString())
  }

  const { data: updated, error: updateError } = await query.select("id")

  if (updateError) {
    console.error("Failed to claim prize:", updateError)
    return { success: false, error: "Failed to claim prize", code: "update_failed" }
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: "This prize has already been claimed", code: "already_claimed" }
  }

  void sendClaimNotifications({
    prizeName: pa?.prize?.name ?? "Prize",
    prizeValue: pa?.prize?.value ?? null,
    sponsorTenantId: pa?.prize?.prize_track?.sponsor?.sponsor_tenant_id ?? null,
    winnerName: data.recipientName,
    hackathonId: fulfillment.hackathon_id,
    client,
  }).catch(console.error)

  return { success: true }
}

async function updateCashPrizePayment(
  fulfillmentId: string,
  data: {
    recipientName: string
    paymentMethod?: string
    paymentDetail?: string
  },
  client: SupabaseClient<Database>
): Promise<ClaimPrizeResult> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    recipient_name: data.recipientName,
  }

  const hasPaymentMethod = !!data.paymentMethod
  const hasPaymentDetail = !!data.paymentDetail
  if (hasPaymentMethod !== hasPaymentDetail) {
    return { success: false, error: "Payment method and payment detail must both be provided", code: "invalid_payment" }
  }

  if (data.paymentMethod) {
    updateData.payment_method = data.paymentMethod
  }
  if (data.paymentDetail) {
    try {
      const { encryptToken } = await import("@/lib/services/encryption")
      updateData.payment_detail = encryptToken(data.paymentDetail)
    } catch (err) {
      console.error("[claimPrize] Failed to encrypt payment_detail:", err)
      return { success: false, error: "Unable to securely store payment details. Please try again.", code: "encryption_failed" }
    }
  }

  const { data: updated, error: updateError } = await client
    .from("prize_fulfillments")
    .update(updateData)
    .eq("id", fulfillmentId)
    .eq("status", "claimed")
    .select("id")

  if (updateError) {
    console.error("Failed to update cash prize claim:", updateError)
    return { success: false, error: "Failed to update claim details", code: "update_failed" }
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: "This prize has already been claimed", code: "already_claimed" }
  }

  return { success: true }
}

async function sendClaimNotifications(params: {
  prizeName: string
  prizeValue: string | null
  sponsorTenantId: string | null
  winnerName: string
  hackathonId: string
  client: SupabaseClient<Database>
}): Promise<void> {
  const { data: hackathon } = await params.client
    .from("hackathons")
    .select("name, slug")
    .eq("id", params.hackathonId)
    .single()

  if (!hackathon) return

  const promises: Promise<unknown>[] = []

  if (params.sponsorTenantId) {
    const { sendSponsorClaimNotification } = await import("@/lib/email/sponsor-notifications")
    promises.push(sendSponsorClaimNotification({
      prizeName: params.prizeName,
      hackathonName: hackathon.name,
      winnerName: params.winnerName,
      sponsorTenantId: params.sponsorTenantId,
      hackathonSlug: hackathon.slug,
      prizeValue: params.prizeValue,
    }))
  }

  const { sendOrganizerClaimNotification } = await import("@/lib/email/organizer-notifications")
  promises.push(sendOrganizerClaimNotification({
    prizeName: params.prizeName,
    hackathonName: hackathon.name,
    hackathonSlug: hackathon.slug,
    winnerName: params.winnerName,
    hackathonId: params.hackathonId,
    prizeValue: params.prizeValue,
  }))

  await Promise.allSettled(promises)
}

export async function getClaimTokensForHackathon(
  hackathonId: string
): Promise<Record<string, string>> {
  const client = getSupabase()

  const { data, error } = await client
    .from("prize_fulfillments")
    .select("prize_assignment_id, claim_token")
    .eq("hackathon_id", hackathonId)
    .not("claim_token", "is", null)

  if (error || !data) return {}

  return Object.fromEntries(
    data.map((d) => [d.prize_assignment_id, d.claim_token as string])
  )
}

export async function getFulfillmentSummary(hackathonId: string): Promise<FulfillmentSummary> {
  const client = getSupabase()

  const { data, error } = await client
    .from("prize_fulfillments")
    .select("status")
    .eq("hackathon_id", hackathonId)

  const summary: FulfillmentSummary = { assigned: 0, contacted: 0, shipped: 0, claimed: 0 }

  if (error || !data) return summary

  for (const row of data) {
    const s = row.status as PrizeFulfillmentStatus
    if (s in summary) summary[s]++
  }

  return summary
}
