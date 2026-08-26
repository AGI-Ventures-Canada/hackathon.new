import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Hackathon,
  HackathonResult,
  HackathonStatus,
  PrizeJudgingStyle,
  PrizeType,
} from "@/lib/db/hackathon-types"
import {
  calculateCoreOnlyResults,
  calculatePrizeResults,
} from "@/lib/services/judging"
import {
  EventMutationLeaseError,
  withEventMutationLease,
} from "@/lib/services/event-mutation-lease"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import {
  compensateResultPublication,
  readResultPublicationState,
  stageResultPublication,
} from "@/lib/services/result-publication"
import {
  hasDeliveryCapacity,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

export type ResultWithDetails = HackathonResult & {
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionScreenshotUrl: string | null
  submissionTeamId: string | null
  teamName: string | null
  prizes: { id: string; name: string; value: string | null }[]
}

export type PublicResultWithDetails = {
  rank: number
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionScreenshotUrl: string | null
  teamName: string | null
  members: string[]
  weightedScore: number | null
  judgeCount: number
  prizes: { id: string; name: string; value: string | null }[]
}

export type CalculateResultsResponse =
  | { success: true; count: number }
  | { success: false; error: string; code: string }

async function markResultsAnnouncementHandled(
  client: SupabaseClient,
  hackathonId: string,
  publicationVersion: string,
): Promise<void> {
  const { data, error } = await client
    .from("hackathons")
    .update({ results_announcement_sent_at: new Date().toISOString() })
    .eq("id", hackathonId)
    .eq("status", "completed")
    .eq("results_published_at", publicationVersion)
    .is("results_announcement_sent_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to save results email preference: ${error.message}`)
  }
  if (!data) throw new Error("The results publication changed before its email preference was saved.")
}

async function publishCompletedResultsGate(
  client: SupabaseClient,
  hackathonId: string,
  tenantId: string,
  publishedAt: string,
): Promise<
  | {
      success: true
      hackathon: Hackathon
      publicationVersion: string
    }
  | { success: false; error: string }
> {
  try {
    return await withEventMutationLease(hackathonId, async () => {
      const { data: current, error: currentError } = await client
        .from("hackathons")
        .select("*")
        .eq("id", hackathonId)
        .eq("tenant_id", tenantId)
        .maybeSingle()
      if (currentError) {
        return { success: false, error: "Failed to verify the event before publishing results" }
      }
      if (!current) return { success: false, error: "Hackathon not found" }

      const { data: currentResults, error: currentResultsError } = await client
        .from("hackathon_results")
        .select("id, published_at")
        .eq("hackathon_id", hackathonId)
      if (currentResultsError) {
        return { success: false, error: "Failed to verify calculated results" }
      }
      if (!currentResults || currentResults.length === 0) {
        return {
          success: false,
          error: "No results calculated yet. Calculate results first.",
        }
      }

      if (current.results_published_at) {
        const fullyCommitted =
          current.status === "completed" &&
          currentResults.every(
            (result) => result.published_at === current.results_published_at,
          )
        if (!fullyCommitted) {
          return {
            success: false,
            error: "Result publication could not be confirmed. Try again.",
          }
        }
        return {
          success: true,
          hackathon: current as Hackathon,
          publicationVersion: current.results_published_at,
        }
      }
      if (current.status !== "completed") {
        return {
          success: false,
          error: "The event changed. Refresh the page and try again.",
        }
      }

      const staged = await stageResultPublication(client, hackathonId, publishedAt)
      if (!staged.success) return staged

      let data: Hackathon | null = null
      let error: { message: string } | null = null
      let updateThrew = false
      try {
        const updateResult = await client
          .from("hackathons")
          .update({
            results_published_at: publishedAt,
            winner_emails_sent_at: null,
            results_announcement_sent_at: null,
            updated_at: publishedAt,
          })
          .eq("id", hackathonId)
          .eq("tenant_id", tenantId)
          .eq("status", "completed")
          .is("results_published_at", null)
          .select()
          .maybeSingle()
        data = updateResult.data as Hackathon | null
        error = updateResult.error
      } catch {
        updateThrew = true
      }

      if (updateThrew || error || !data) {
        const publicationState = await readResultPublicationState(
          client,
          hackathonId,
          tenantId,
          publishedAt,
        )
        if (publicationState.state === "committed") {
          return {
            success: true,
            hackathon: publicationState.hackathon,
            publicationVersion: publishedAt,
          }
        }
        if (publicationState.state === "not_committed") {
          try {
            await compensateResultPublication(client, hackathonId, publishedAt)
          } catch (compensationError) {
            console.error("Failed to reconcile result publication:", compensationError)
            return {
              success: false,
              error: "Result publication could not be confirmed. Try again.",
            }
          }
        }
        return {
          success: false,
          error: data
            ? "Failed to publish results"
            : "The event changed. Refresh the page and try again.",
        }
      }
      return {
        success: true,
        hackathon: data,
        publicationVersion: publishedAt,
      }
    })
  } catch (error) {
    if (error instanceof EventMutationLeaseError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

export async function calculateResults(
  hackathonId: string
): Promise<CalculateResultsResponse> {
  try {
    return await withEventMutationLease(hackathonId, () =>
      calculateResultsUnlocked(hackathonId),
    )
  } catch (error) {
    if (error instanceof EventMutationLeaseError) {
      return { success: false, error: error.message, code: error.code }
    }
    throw error
  }
}

async function calculateResultsUnlocked(
  hackathonId: string,
): Promise<CalculateResultsResponse> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("judging_mode, results_published_at")
    .eq("id", hackathonId)
    .single()

  if (hackathonError || !hackathon) {
    return { success: false, error: "Failed to load the event", code: "query_failed" }
  }
  if (hackathon?.results_published_at) {
    return { success: true, count: -1 }
  }

  const { data: styledPrizes, error: prizesError } = await client
    .from("prizes")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .not("judging_style", "is", null)

  if (prizesError) {
    console.error("Failed to load prizes for results:", prizesError)
    return { success: false, error: "Failed to load prizes", code: "query_failed" }
  }

  if (styledPrizes && styledPrizes.length > 0) {
    const { error: clearError } = await client
      .from("hackathon_results")
      .delete()
      .eq("hackathon_id", hackathonId)
      .is("prize_id", null)
      .eq("result_kind", "prize")

    if (clearError) {
      console.error("Failed to clear old results:", clearError)
      return { success: false, error: "Failed to clear old results", code: "delete_failed" }
    }

    const calculated = await Promise.all([
      calculateCoreOnlyResults(hackathonId),
      ...styledPrizes.map((prize) => calculatePrizeResults(hackathonId, prize.id)),
    ])

    if (calculated.some((result) => !result.success)) {
      return {
        success: false,
        error: "Failed to calculate prize results",
        code: "prize_calculation_failed",
      }
    }

    return {
      success: true,
      count: calculated.reduce((count, result) => count + result.count, 0),
    }
  }

  if (hackathon?.judging_mode === "subjective") {
    return calculateSubjectiveResults(hackathonId)
  }

  const { data, error } = await client.rpc("calculate_results", {
    p_hackathon_id: hackathonId,
  })

  if (error) {
    console.error("Failed to calculate results:", error)
    return { success: false, error: "Failed to calculate results", code: "rpc_failed" }
  }

  const result = data?.[0]
  if (!result?.success) {
    return {
      success: false,
      error: result?.error_message || "Failed to calculate results",
      code: result?.error_code || "unknown",
    }
  }

  return { success: true, count: result.results_count }
}

async function calculateSubjectiveResults(
  hackathonId: string
): Promise<CalculateResultsResponse> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: picks, error: picksError } = await client
    .from("judge_picks")
    .select("submission_id, prize_id, rank, judge_participant_id")
    .eq("hackathon_id", hackathonId)

  if (picksError) {
    console.error("Failed to get picks for results:", picksError)
    return { success: false, error: "Failed to get picks", code: "query_failed" }
  }

  if (!picks || picks.length === 0) {
    return { success: false, error: "No judge picks found", code: "no_picks" }
  }

  const submissionStats: Record<string, { totalPicks: number; firstPicks: number; totalRank: number }> = {}

  for (const pick of picks) {
    if (!submissionStats[pick.submission_id]) {
      submissionStats[pick.submission_id] = { totalPicks: 0, firstPicks: 0, totalRank: 0 }
    }
    submissionStats[pick.submission_id].totalPicks++
    if (pick.rank === 1) submissionStats[pick.submission_id].firstPicks++
    submissionStats[pick.submission_id].totalRank += pick.rank
  }

  const uniqueJudges = new Set(picks.map((p) => p.judge_participant_id)).size

  const ranked = Object.entries(submissionStats)
    .sort(([, a], [, b]) => {
      if (b.firstPicks !== a.firstPicks) return b.firstPicks - a.firstPicks
      const avgA = a.totalRank / a.totalPicks
      const avgB = b.totalRank / b.totalPicks
      return avgA - avgB
    })

  await client.from("hackathon_results").delete().eq("hackathon_id", hackathonId)

  const results = ranked.map(([submissionId, stats], index) => ({
    hackathon_id: hackathonId,
    submission_id: submissionId,
    rank: index + 1,
    total_score: stats.firstPicks,
    weighted_score: stats.totalPicks > 0 ? stats.firstPicks / stats.totalPicks : 0,
    judge_count: uniqueJudges,
  }))

  const { error: insertError } = await client
    .from("hackathon_results")
    .insert(results)

  if (insertError) {
    console.error("Failed to insert subjective results:", insertError)
    return { success: false, error: "Failed to save results", code: "insert_failed" }
  }

  return { success: true, count: results.length }
}

export async function getResults(hackathonId: string): Promise<ResultWithDetails[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: results, error } = await client
    .from("hackathon_results")
    .select(`
      *,
      submission:submissions!submission_id(title, description, github_url, live_app_url, screenshot_url, team_id)
    `)
    .eq("hackathon_id", hackathonId)
    .order("rank")

  if (error || !results) {
    console.error("Failed to get results:", error)
    return []
  }

  const teamIds = results
    .map((r: Record<string, unknown>) => {
      const sub = r.submission as unknown as { team_id: string | null } | null
      return sub?.team_id
    })
    .filter((id): id is string => id !== null)

  let teamsMap: Record<string, string> = {}
  if (teamIds.length > 0) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .in("id", teamIds)
    teamsMap = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]))
  }

  const submissionIds = results.map((r) => r.submission_id)
  const { data: prizeAssignments } = await client
    .from("prize_assignments")
    .select(`
      submission_id,
      prize:prizes!prize_id(id, name, value)
    `)
    .in("submission_id", submissionIds)

  const prizeMap: Record<string, { id: string; name: string; value: string | null }[]> = {}
  for (const pa of prizeAssignments ?? []) {
    const prize = (pa as Record<string, unknown>).prize as unknown as { id: string; name: string; value: string | null } | null
    if (!prize) continue
    if (!prizeMap[pa.submission_id]) prizeMap[pa.submission_id] = []
    prizeMap[pa.submission_id].push(prize)
  }

  return results.map((r: Record<string, unknown>) => {
    const sub = r.submission as unknown as {
      title: string
      description: string | null
      github_url: string | null
      live_app_url: string | null
      screenshot_url: string | null
      team_id: string | null
    }
    return {
      ...(r as unknown as HackathonResult),
      submissionTitle: sub.title,
      submissionDescription: sub.description,
      submissionGithubUrl: sub.github_url,
      submissionLiveAppUrl: sub.live_app_url,
      submissionScreenshotUrl: sub.screenshot_url,
      submissionTeamId: sub.team_id,
      teamName: sub.team_id ? teamsMap[sub.team_id] ?? null : null,
      prizes: prizeMap[r.submission_id as string] ?? [],
    }
  })
}

export async function publishResults(
  hackathonId: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("id, name, slug, status, tenant_id, results_published_at")
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .single()

  if (!hackathon) {
    return { success: false, error: "Hackathon not found" }
  }

  const { data: results } = await client
    .from("hackathon_results")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .limit(1)

  if (!results || results.length === 0) {
    return { success: false, error: "No results calculated yet. Calculate results first." }
  }

  const requestedPublicationVersion = new Date().toISOString()
  const currentStatus = hackathon.status as string
  let committedHackathon = hackathon as Hackathon
  let publicationVersion = requestedPublicationVersion
  if (currentStatus !== "completed" && !hackathon.results_published_at) {
    const { executeTransition } = await import("@/lib/services/lifecycle")
    const transitionResult = await executeTransition({
      hackathonId,
      tenantId,
      fromStatus: currentStatus as import("@/lib/db/hackathon-types").HackathonStatus,
      toStatus: "completed",
      trigger: "manual",
      triggeredBy: "system",
      resultsPublication: { publishedAt: requestedPublicationVersion },
    })
    if (!transitionResult.success) {
      return {
        success: false,
        error: transitionResult.error ?? "Failed to complete the event before publishing results",
      }
    }
    committedHackathon = transitionResult.hackathon ?? {
      ...committedHackathon,
      status: "completed",
      results_published_at: requestedPublicationVersion,
    }
  } else {
    const publication = await publishCompletedResultsGate(
      client,
      hackathonId,
      tenantId,
      hackathon.results_published_at ?? requestedPublicationVersion,
    )
    if (!publication.success) return publication
    committedHackathon = publication.hackathon
    publicationVersion = publication.publicationVersion
  }

  try {
    const { dispatchTransitionNotifications } = await import(
      "@/lib/services/notification-dispatcher"
    )
    await dispatchTransitionNotifications({
      type: "results_published",
      hackathonId,
      tenantId,
      hackathon: {
        name: committedHackathon.name,
        slug: committedHackathon.slug,
      },
      trigger: "manual",
      triggeredBy: "system",
      fromStatus: currentStatus,
      toStatus: "completed",
      sendEmail: false,
      idempotencyKey: `result-publication/${hackathonId}/${publicationVersion}`,
    })
  } catch (err) {
    console.error("Failed to dispatch results-published webhooks (non-blocking):", err)
  }

  try {
    const { autoAssignPrizes } = await import("@/lib/services/prizes")
    await autoAssignPrizes(hackathonId)
  } catch (err) {
    console.error("Failed to auto-assign prizes (non-blocking):", err)
  }

  try {
    const { initializeFulfillments } = await import("@/lib/services/prize-fulfillment")
    await initializeFulfillments(hackathonId)
  } catch (err) {
    console.error("Failed to initialize fulfillments (non-blocking):", err)
  }

  try {
    const claimed = await withDeliveryLease(`winner-results:${hackathonId}:${publicationVersion}`, async () => {
      const { sendWinnerEmailsWithResult } = await import("@/lib/email/winner-notifications")
      return sendWinnerEmailsWithResult(hackathonId)
    })
    if (claimed.acquired && claimed.value.failed === 0) {
      await client
        .from("hackathons")
        .update({ winner_emails_sent_at: new Date().toISOString() })
        .eq("id", hackathonId)
        .eq("results_published_at", publicationVersion)
        .is("winner_emails_sent_at", null)
    }
  } catch (err) {
    console.error("Failed to send winner emails (non-blocking):", err)
  }

  try {
    const { getNotificationSettings } = await import("@/lib/services/notification-settings")
    const settings = await getNotificationSettings(hackathonId)
    if (settings.email_on_results_published) {
      await withDeliveryLease(`results-announcement:${hackathonId}:${publicationVersion}`, async () => {
        const { sendResultsAnnouncementEmails } = await import("@/lib/email/results-announcement")
        return sendResultsAnnouncementEmails(hackathonId)
      })
    } else {
      await markResultsAnnouncementHandled(client, hackathonId, publicationVersion)
    }
  } catch (err) {
    console.error("Failed to send results announcement (non-blocking):", err)
  }

  try {
    const { schedulePostEventReminders } = await import("@/lib/services/post-event-reminders")
    await schedulePostEventReminders(hackathonId)
  } catch (err) {
    console.error("Failed to schedule post-event reminders (non-blocking):", err)
  }

  return { success: true }
}

export async function unpublishResults(
  hackathonId: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase() as unknown as SupabaseClient
  type UnpublishCommit =
    | {
        success: true
        transition?: {
          hackathon: Hackathon
          fromStatus: HackathonStatus
          toStatus: HackathonStatus
        }
      }
    | { success: false; error: string }

  let commit: UnpublishCommit
  try {
    commit = await withEventMutationLease(hackathonId, async () => {
      const { data: current, error: currentError } = await client
        .from("hackathons")
        .select("*")
        .eq("id", hackathonId)
        .eq("tenant_id", tenantId)
        .maybeSingle()
      if (currentError) {
        return { success: false, error: "Failed to load the event" }
      }
      if (!current) return { success: false, error: "Hackathon not found" }
      if (!current.results_published_at) return { success: true }

      const publicationVersion = current.results_published_at
      const fromStatus = current.status as HackathonStatus
      const toStatus = fromStatus === "completed" ? "judging" : fromStatus
      const { error: resultsError } = await client
        .from("hackathon_results")
        .update({ published_at: null })
        .eq("hackathon_id", hackathonId)
        .eq("published_at", publicationVersion)
      if (resultsError) {
        console.error("Failed to unpublish results:", resultsError)
        return { success: false, error: "Failed to unpublish results" }
      }

      let updated: Hackathon | null = null
      let updateError: { message: string } | null = null
      try {
        const updateResult = await client
          .from("hackathons")
          .update({
            status: toStatus,
            results_published_at: null,
            winner_emails_sent_at: null,
            results_announcement_sent_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", hackathonId)
          .eq("tenant_id", tenantId)
          .eq("results_published_at", publicationVersion)
          .select()
          .maybeSingle()
        updated = updateResult.data as Hackathon | null
        updateError = updateResult.error
      } catch {
        updateError = { message: "update response unavailable" }
      }

      if (updateError || !updated) {
        const [eventRead, resultsRead] = await Promise.all([
          client
            .from("hackathons")
            .select("*")
            .eq("id", hackathonId)
            .eq("tenant_id", tenantId)
            .maybeSingle(),
          client
            .from("hackathon_results")
            .select("id, published_at")
            .eq("hackathon_id", hackathonId),
        ])
        if (eventRead.error || resultsRead.error || !eventRead.data || !resultsRead.data) {
          return {
            success: false,
            error: "Result visibility could not be confirmed. Refresh and try again.",
          }
        }
        const resultRows = resultsRead.data as Array<{ published_at: string | null }>
        const unpublishCommitted =
          eventRead.data.results_published_at === null &&
          eventRead.data.status === toStatus &&
          resultRows.every((result) => result.published_at === null)
        if (unpublishCommitted) {
          updated = eventRead.data as Hackathon
        } else if (eventRead.data.results_published_at === publicationVersion) {
          const { error: restoreError } = await client
            .from("hackathon_results")
            .update({ published_at: publicationVersion })
            .eq("hackathon_id", hackathonId)
            .is("published_at", null)
          if (restoreError) {
            console.error("Failed to restore result visibility:", restoreError)
          }
          return { success: false, error: "Failed to update hackathon" }
        } else {
          return {
            success: false,
            error: "Result visibility could not be confirmed. Refresh and try again.",
          }
        }
      }

      if (fromStatus !== toStatus) {
        await client.from("hackathon_transitions").insert({
          hackathon_id: hackathonId,
          from_status: fromStatus,
          to_status: toStatus,
          trigger: "manual",
          triggered_by: "system",
        })
      }

      return {
        success: true,
        ...(fromStatus !== toStatus
          ? { transition: { hackathon: updated, fromStatus, toStatus } }
          : {}),
      }
    })
  } catch (error) {
    if (error instanceof EventMutationLeaseError) {
      return { success: false, error: error.message }
    }
    throw error
  }

  if (!commit.success) return commit

  if (commit.transition) {
    const { runTransitionSideEffects } = await import("@/lib/services/lifecycle")
    await runTransitionSideEffects(
      {
        hackathonId,
        tenantId,
        fromStatus: commit.transition.fromStatus,
        toStatus: commit.transition.toStatus,
        trigger: "manual",
        triggeredBy: "system",
      },
      commit.transition.hackathon,
      false,
    )
  }

  try {
    const { cancelPendingPostEventReminders } = await import(
      "@/lib/services/post-event-reminders"
    )
    await cancelPendingPostEventReminders(hackathonId)
  } catch (err) {
    console.error("Failed to cancel post-event reminders after unpublishing:", err)
  }

  return { success: true }
}

export async function retryPendingResultEmails(
  limit = 20,
  budget?: DeliveryBudget,
): Promise<{
  processed: number
  winnerEmailsSent: number
  resultEmailsSent: number
  errors: number
}> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: hackathons, error } = await client
    .from("hackathons")
    .select("id, results_published_at, winner_emails_sent_at, results_announcement_sent_at")
    .eq("status", "completed")
    .not("results_published_at", "is", null)
    .or("winner_emails_sent_at.is.null,results_announcement_sent_at.is.null")
    .order("results_published_at", { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load pending results emails: ${error.message}`)
  }

  const summary = {
    processed: 0,
    winnerEmailsSent: 0,
    resultEmailsSent: 0,
    errors: 0,
  }

  for (const hackathon of hackathons ?? []) {
    if (!hasDeliveryCapacity(budget)) break
    const publicationVersion = hackathon.results_published_at
    if (!publicationVersion) {
      summary.errors++
      continue
    }
    summary.processed++

    if (!hackathon.winner_emails_sent_at) {
      try {
        const claimed = await withDeliveryLease(
          `winner-results:${hackathon.id}:${publicationVersion}`,
          async () => {
            const { sendWinnerEmailsWithResult } = await import(
              "@/lib/email/winner-notifications"
            )
            return budget
              ? sendWinnerEmailsWithResult(hackathon.id, budget)
              : sendWinnerEmailsWithResult(hackathon.id)
          },
        )
        if (claimed.acquired) {
          const delivery = claimed.value
          summary.winnerEmailsSent += delivery.sent
          if (delivery.failed === 0 && !delivery.deferred) {
            const { data: stamped, error: stampError } = await client
              .from("hackathons")
              .update({ winner_emails_sent_at: new Date().toISOString() })
              .eq("id", hackathon.id)
              .eq("results_published_at", publicationVersion)
              .is("winner_emails_sent_at", null)
              .select("id")
              .maybeSingle()
            if (stampError) throw stampError
            if (!stamped) throw new Error("The results publication changed during winner delivery.")
          } else {
            if (delivery.failed > 0) summary.errors++
          }
          if (delivery.deferred) break
        }
      } catch (sendError) {
        console.error(`Failed to retry winner emails for ${hackathon.id}:`, sendError)
        summary.errors++
      }
    }

    if (!hackathon.results_announcement_sent_at) {
      if (!hasDeliveryCapacity(budget)) break
      try {
        const { getNotificationSettings } = await import(
          "@/lib/services/notification-settings"
        )
        const settings = await getNotificationSettings(hackathon.id)
        if (!settings.email_on_results_published) {
          await markResultsAnnouncementHandled(
            client,
            hackathon.id,
            publicationVersion,
          )
          continue
        }
        const claimed = await withDeliveryLease(
          `results-announcement:${hackathon.id}:${publicationVersion}`,
          async () => {
            const { sendResultsAnnouncementEmailsWithResult } = await import(
              "@/lib/email/results-announcement"
            )
            return budget
              ? sendResultsAnnouncementEmailsWithResult(hackathon.id, budget)
              : sendResultsAnnouncementEmailsWithResult(hackathon.id)
          },
        )
        if (!claimed.acquired) continue
        const delivery = claimed.value
        summary.resultEmailsSent += delivery.sent
        if (delivery.failed > 0) summary.errors++
        if (delivery.deferred) break
      } catch (sendError) {
        console.error(`Failed to retry results emails for ${hackathon.id}:`, sendError)
        summary.errors++
      }
    }
  }

  return summary
}

export async function getPublicResults(
  hackathonId: string
): Promise<ResultWithDetails[] | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("results_published_at, anonymous_judging")
    .eq("id", hackathonId)
    .single()

  if (!hackathon?.results_published_at) {
    return null
  }

  const results = await getResults(hackathonId)
  if (!hackathon.anonymous_judging) return results

  return results.map((result) => ({
    ...result,
    submissionTeamId: null,
    teamName: null,
  }))
}

export async function getPublicResultsWithDetails(
  hackathonId: string
): Promise<PublicResultWithDetails[] | null> {
  const results = await getPublicResults(hackathonId)
  if (!results) return null

  const client = getSupabase() as unknown as SupabaseClient

  const top3TeamIds = [
    ...new Set(
      results
        .filter((r) => r.rank <= 3 && r.submissionTeamId)
        .map((r) => r.submissionTeamId as string)
    ),
  ]

  const teamMembersMap: Record<string, string[]> = {}

  if (top3TeamIds.length > 0) {
    const { data: members } = await client
      .from("hackathon_participants")
      .select("team_id, clerk_user_id")
      .in("team_id", top3TeamIds)
      .eq("role", "participant")

    if (members?.length) {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server")
        const clerk = await clerkClient()
        const clerkUsers = await clerk.users.getUserList({
          userId: members.map((m) => m.clerk_user_id),
          limit: 100,
        })
        const nameMap = Object.fromEntries(
          clerkUsers.data.map((u) => [
            u.id,
            u.firstName
              ? `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`
              : u.username || "Anonymous",
          ])
        )
        for (const m of members) {
          if (!teamMembersMap[m.team_id as string]) teamMembersMap[m.team_id as string] = []
          teamMembersMap[m.team_id as string].push(nameMap[m.clerk_user_id] || "Anonymous")
        }
      } catch {
        // Member names unavailable - continue without them
      }
    }
  }

  return results.map((r) => ({
    rank: r.rank,
    submissionTitle: r.submissionTitle,
    submissionDescription: r.submissionDescription,
    submissionGithubUrl: r.submissionGithubUrl,
    submissionLiveAppUrl: r.submissionLiveAppUrl,
    submissionScreenshotUrl: r.submissionScreenshotUrl,
    teamName: r.teamName,
    members: r.submissionTeamId ? (teamMembersMap[r.submissionTeamId] ?? []) : [],
    weightedScore: r.weighted_score,
    judgeCount: r.judge_count,
    prizes: r.prizes,
  }))
}

export type PerPrizeTeamResult = {
  rank: number | null
  submissionId: string
  submissionTitle: string
  teamName: string | null
  totalScore: number | null
  weightedScore: number | null
  judgeCount: number
  isAssignedWinner: boolean
}

export type PrizeResultsGroup = {
  prizeId: string
  prizeName: string
  prizeType: PrizeType
  judgingStyle: PrizeJudgingStyle | null
  mode: "per_prize" | "unified" | "manual" | "calculated"
  results: PerPrizeTeamResult[]
}

type PrizeRow = {
  id: string
  name: string
  type: PrizeType
  judging_style: PrizeJudgingStyle | null
  display_order: number
  is_screening: boolean
}

type ScoreRow = {
  score: number
  criteria_id: string
  judge_assignment_id: string
}

type AssignmentRow = {
  id: string
  submission_id: string
  prize_id: string | null
  assignment_kind: "per_prize" | "unified_weighted_score"
  is_complete: boolean
}

type SubmissionMeta = {
  id: string
  title: string
  team_id: string | null
}

type StoredResultRow = {
  submission_id: string
  prize_id: string | null
  result_kind: "prize" | "core_only"
  total_score: number | null
  weighted_score: number | null
  judge_count: number
  rank: number
}

function rankResults(rows: PerPrizeTeamResult[]): PerPrizeTeamResult[] {
  const sorted = [...rows].sort((a, b) => {
    const aw = a.weightedScore ?? -Infinity
    const bw = b.weightedScore ?? -Infinity
    if (bw !== aw) return bw - aw
    const at = a.totalScore ?? -Infinity
    const bt = b.totalScore ?? -Infinity
    return bt - at
  })
  let lastWeighted: number | null = null
  let lastTotal: number | null = null
  let currentRank = 0
  let processed = 0
  for (const row of sorted) {
    processed += 1
    if (
      lastWeighted === null ||
      row.weightedScore !== lastWeighted ||
      row.totalScore !== lastTotal
    ) {
      currentRank = processed
      lastWeighted = row.weightedScore
      lastTotal = row.totalScore
    }
    row.rank = currentRank
  }
  return sorted
}

export async function getResultsByPrize(
  hackathonId: string
): Promise<PrizeResultsGroup[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prizesData } = await client
    .from("prizes")
    .select("id, name, type, judging_style, display_order, is_screening")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  const prizes = ((prizesData ?? []) as PrizeRow[]).filter((p) => !p.is_screening)
  if (prizes.length === 0) return []

  const { data: assignmentsData } = await client
    .from("judge_assignments")
    .select("id, submission_id, prize_id, assignment_kind, is_complete")
    .eq("hackathon_id", hackathonId)
    .eq("is_complete", true)

  const assignments = (assignmentsData ?? []) as AssignmentRow[]
  const assignmentIds = assignments.map((a) => a.id)

  let scores: ScoreRow[] = []
  if (assignmentIds.length > 0) {
    const { data: scoresData } = await client
      .from("scores")
      .select("score, criteria_id, judge_assignment_id")
      .in("judge_assignment_id", assignmentIds)
    scores = (scoresData ?? []) as ScoreRow[]
  }

  const { data: criteriaData } = await client
    .from("judging_criteria")
    .select("id, weight, prize_id")
    .eq("hackathon_id", hackathonId)

  const criteriaWeights = new Map<string, number>()
  const sharedCriteriaIds = new Set<string>()
  const criteriaByPrize = new Map<string, Set<string>>()
  for (const c of (criteriaData ?? []) as Array<{ id: string; weight: number; prize_id: string | null }>) {
    criteriaWeights.set(c.id, Number(c.weight) || 0)
    if (c.prize_id === null) {
      sharedCriteriaIds.add(c.id)
    } else {
      const set = criteriaByPrize.get(c.prize_id) ?? new Set<string>()
      set.add(c.id)
      criteriaByPrize.set(c.prize_id, set)
    }
  }

  const submissionIdSet = new Set<string>()
  for (const a of assignments) submissionIdSet.add(a.submission_id)

  const { data: prizeAssignmentsData } = await client
    .from("prize_assignments")
    .select("prize_id, submission_id, assigned_at")
    .in(
      "prize_id",
      prizes.map((p) => p.id)
    )
    .order("assigned_at", { ascending: true })

  const manualWinners = new Map<string, string[]>()
  for (const pa of (prizeAssignmentsData ?? []) as Array<{
    prize_id: string
    submission_id: string
    assigned_at: string | null
  }>) {
    submissionIdSet.add(pa.submission_id)
    const list = manualWinners.get(pa.prize_id) ?? []
    list.push(pa.submission_id)
    manualWinners.set(pa.prize_id, list)
  }

  const { data: overallResultsData } = await client
    .from("hackathon_results")
    .select("submission_id, prize_id, result_kind, total_score, weighted_score, judge_count, rank")
    .eq("hackathon_id", hackathonId)

  const storedResultsByPrize = new Map<string, StoredResultRow[]>()
  const overallBySubmission = new Map<
    string,
    { totalScore: number | null; weightedScore: number | null; judgeCount: number; rank: number }
  >()
  for (const r of (overallResultsData ?? []) as StoredResultRow[]) {
    submissionIdSet.add(r.submission_id)
    if (r.prize_id) {
      const rows = storedResultsByPrize.get(r.prize_id) ?? []
      rows.push(r)
      storedResultsByPrize.set(r.prize_id, rows)
      continue
    }
    overallBySubmission.set(r.submission_id, {
      totalScore: r.total_score,
      weightedScore: r.weighted_score,
      judgeCount: r.judge_count,
      rank: r.rank,
    })
  }

  const submissionIds = Array.from(submissionIdSet)
  let submissions: SubmissionMeta[] = []
  if (submissionIds.length > 0) {
    const { data: submissionsData } = await client
      .from("submissions")
      .select("id, title, team_id")
      .in("id", submissionIds)
    submissions = (submissionsData ?? []) as SubmissionMeta[]
  }
  const submissionsById = new Map(submissions.map((s) => [s.id, s]))

  const teamIds = submissions
    .map((s) => s.team_id)
    .filter((id): id is string => id !== null)

  const teamsById = new Map<string, string>()
  if (teamIds.length > 0) {
    const { data: teamsData } = await client
      .from("teams")
      .select("id, name")
      .in("id", teamIds)
    for (const t of (teamsData ?? []) as Array<{ id: string; name: string }>) {
      teamsById.set(t.id, t.name)
    }
  }

  function makeRow(submissionId: string, partial: Partial<PerPrizeTeamResult>): PerPrizeTeamResult | null {
    const sub = submissionsById.get(submissionId)
    if (!sub) return null
    return {
      rank: null,
      submissionId,
      submissionTitle: sub.title,
      teamName: sub.team_id ? teamsById.get(sub.team_id) ?? null : null,
      totalScore: null,
      weightedScore: null,
      judgeCount: 0,
      isAssignedWinner: false,
      ...partial,
    }
  }

  const scoresByAssignment = new Map<string, ScoreRow[]>()
  for (const s of scores) {
    const list = scoresByAssignment.get(s.judge_assignment_id) ?? []
    list.push(s)
    scoresByAssignment.set(s.judge_assignment_id, list)
  }

  const groups: PrizeResultsGroup[] = []

  for (const prize of prizes) {
    const winnerIds = new Set(manualWinners.get(prize.id) ?? [])
    const storedResults = storedResultsByPrize.get(prize.id) ?? []

    if (storedResults.length > 0) {
      const rows = storedResults
        .map((stored) =>
          makeRow(stored.submission_id, {
            rank: stored.rank,
            totalScore: stored.total_score,
            weightedScore: stored.weighted_score,
            judgeCount: stored.judge_count,
            isAssignedWinner: winnerIds.has(stored.submission_id),
          })
        )
        .filter((row): row is PerPrizeTeamResult => row !== null)

      const storedSubmissionIds = new Set(rows.map((row) => row.submissionId))
      for (const winnerId of winnerIds) {
        if (storedSubmissionIds.has(winnerId)) continue
        const winner = makeRow(winnerId, { isAssignedWinner: true })
        if (winner) rows.push(winner)
      }
      rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))

      groups.push({
        prizeId: prize.id,
        prizeName: prize.name,
        prizeType: prize.type,
        judgingStyle: prize.judging_style,
        mode: "calculated",
        results: rows,
      })
      continue
    }

    const isManual =
      prize.judging_style === "crowd_vote" || prize.judging_style === "judges_pick"

    if (isManual) {
      const rows = [...winnerIds]
        .map((sid) => makeRow(sid, { isAssignedWinner: true }))
        .filter((r): r is PerPrizeTeamResult => r !== null)
      groups.push({
        prizeId: prize.id,
        prizeName: prize.name,
        prizeType: prize.type,
        judgingStyle: prize.judging_style,
        mode: "manual",
        results: rows,
      })
      continue
    }

    const perPrizeAssignments = assignments.filter(
      (a) => a.assignment_kind === "per_prize" && a.prize_id === prize.id
    )

    if (perPrizeAssignments.length > 0) {
      const bySubmission = new Map<
        string,
        { totalScore: number; weightedSum: number; weightSum: number; judgeAssignmentIds: Set<string> }
      >()
      for (const a of perPrizeAssignments) {
        const assignmentScores = scoresByAssignment.get(a.id) ?? []
        if (assignmentScores.length === 0) continue
        const entry = bySubmission.get(a.submission_id) ?? {
          totalScore: 0,
          weightedSum: 0,
          weightSum: 0,
          judgeAssignmentIds: new Set<string>(),
        }
        entry.judgeAssignmentIds.add(a.id)
        for (const s of assignmentScores) {
          const w = criteriaWeights.get(s.criteria_id) ?? 0
          entry.totalScore += s.score
          entry.weightedSum += s.score * w
          entry.weightSum += w
        }
        bySubmission.set(a.submission_id, entry)
      }

      const rows: PerPrizeTeamResult[] = []
      for (const [submissionId, agg] of bySubmission.entries()) {
        const row = makeRow(submissionId, {
          totalScore: agg.totalScore,
          weightedScore:
            agg.weightSum > 0 ? agg.weightedSum / agg.weightSum : null,
          judgeCount: agg.judgeAssignmentIds.size,
        })
        if (row) rows.push(row)
      }

      groups.push({
        prizeId: prize.id,
        prizeName: prize.name,
        prizeType: prize.type,
        judgingStyle: prize.judging_style,
        mode: "per_prize",
        results: rankResults(rows),
      })
      continue
    }

    const unifiedAssignments = assignments.filter(
      (a) => a.assignment_kind === "unified_weighted_score"
    )

    if (unifiedAssignments.length > 0) {
      const prizeOwnCriteria = criteriaByPrize.get(prize.id) ?? new Set<string>()
      const relevantCriteria = new Set<string>(sharedCriteriaIds)
      for (const id of prizeOwnCriteria) relevantCriteria.add(id)

      const bySubmission = new Map<
        string,
        { totalScore: number; weightedSum: number; weightSum: number; judgeAssignmentIds: Set<string> }
      >()
      for (const a of unifiedAssignments) {
        const assignmentScores = (scoresByAssignment.get(a.id) ?? []).filter((s) =>
          relevantCriteria.has(s.criteria_id)
        )
        if (assignmentScores.length === 0) continue
        const entry = bySubmission.get(a.submission_id) ?? {
          totalScore: 0,
          weightedSum: 0,
          weightSum: 0,
          judgeAssignmentIds: new Set<string>(),
        }
        entry.judgeAssignmentIds.add(a.id)
        for (const s of assignmentScores) {
          const w = criteriaWeights.get(s.criteria_id) ?? 0
          entry.totalScore += s.score
          entry.weightedSum += s.score * w
          entry.weightSum += w
        }
        bySubmission.set(a.submission_id, entry)
      }

      const rows: PerPrizeTeamResult[] = []
      for (const [submissionId, agg] of bySubmission.entries()) {
        const row = makeRow(submissionId, {
          totalScore: agg.totalScore,
          weightedScore:
            agg.weightSum > 0 ? agg.weightedSum / agg.weightSum : null,
          judgeCount: agg.judgeAssignmentIds.size,
        })
        if (row) rows.push(row)
      }

      groups.push({
        prizeId: prize.id,
        prizeName: prize.name,
        prizeType: prize.type,
        judgingStyle: prize.judging_style,
        mode: "unified",
        results: rankResults(rows),
      })
      continue
    }

    const rows: PerPrizeTeamResult[] = []
    for (const [submissionId, overall] of overallBySubmission.entries()) {
      const row = makeRow(submissionId, {
        rank: overall.rank,
        totalScore: overall.totalScore,
        weightedScore: overall.weightedScore,
        judgeCount: overall.judgeCount,
      })
      if (row) rows.push(row)
    }
    rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    groups.push({
      prizeId: prize.id,
      prizeName: prize.name,
      prizeType: prize.type,
      judgingStyle: prize.judging_style,
      mode: "unified",
      results: rows,
    })
  }

  return groups
}
