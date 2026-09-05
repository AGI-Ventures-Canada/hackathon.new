import { supabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getAssignmentDetail, verifyAssignmentOwnership, assertAssignmentWritable, recalculateForAssignment, calculatePrizeResults } from "@/lib/services/judging"
import { getAssignmentScoringScope } from "@/lib/services/judging-scope"
import { withEventMutationLease } from "@/lib/services/event-mutation-lease"
import { isValidUuid } from "@/lib/utils/uuid"
import { reviewResponseSchema, validateReviewResponse, type ReviewResponse, type ReviewSnapshot, type ReviewProject } from "@/lib/utils/judging-review"

export class JudgingReviewError extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message) }
}

type ReviewTarget = { assignmentId: string } | { prizeId: string }
type StoredDraft = { revision: number; response: ReviewResponse | null; criteria_version: string }
type ReviewContext = { snapshot: ReviewSnapshot; hackathonId: string; target: ReviewTarget }

async function readDraft(judgeId: string, target: ReviewTarget): Promise<StoredDraft | null> {
  const client = supabase() as unknown as SupabaseClient
  let query = client.from("judging_review_drafts").select("revision,response,criteria_version").eq("judge_participant_id", judgeId)
  query = "assignmentId" in target ? query.eq("assignment_id", target.assignmentId) : query.eq("prize_id", target.prizeId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new JudgingReviewError("We couldn't load your saved draft. Try again.", "draft_unavailable", 503)
  return data as StoredDraft | null
}

async function getReviewContext(slug: string, userId: string, target: ReviewTarget): Promise<ReviewContext> {
  const targetId = "assignmentId" in target ? target.assignmentId : target.prizeId
  if (!isValidUuid(targetId)) throw new JudgingReviewError("Review not found.", "not_found", 404)
  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!hackathon) throw new JudgingReviewError("Event not found.", "not_found", 404)
  const client = supabase() as unknown as SupabaseClient
  const { data: judge, error: judgeError } = await client.from("hackathon_participants").select("id,team_id").eq("hackathon_id", hackathon.id).eq("clerk_user_id", userId).eq("role", "judge").maybeSingle()
  if (judgeError) throw new JudgingReviewError("We couldn't load this review. Try again.", "unavailable", 503)
  if (!judge) throw new JudgingReviewError("Review not found.", "not_found", 404)
  const stored = await readDraft(judge.id, target)
  let snapshot: ReviewSnapshot
  if ("assignmentId" in target) {
    const ownership = await verifyAssignmentOwnership(target.assignmentId, userId)
    if (!ownership || ownership.hackathonId !== hackathon.id) throw new JudgingReviewError("Review not found.", "not_found", 404)
    const [detail, scope, writable, prizeResult] = await Promise.all([
      getAssignmentDetail(target.assignmentId, ownership),
      getAssignmentScoringScope(target.assignmentId, ownership),
      assertAssignmentWritable(target.assignmentId, userId, hackathon),
      ownership.prizeId ? client.from("prizes").select("name,judging_style").eq("id", ownership.prizeId).single() : Promise.resolve({ data: null, error: null }),
    ])
    if (!detail || prizeResult.error) throw new JudgingReviewError("Review not found.", "not_found", 404)
    const kind = prizeResult.data?.judging_style
    let submitted: ReviewResponse
    if (kind === "gate_check") submitted = { kind, gates: Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, detail.existingGateResponses.find((response) => response.criteriaId === criterion.id)?.passed ?? null])), notes: detail.notes }
    else if (kind === "bucket_sort") submitted = { kind, bucketId: detail.existingBucketId, ...(detail.criteria.length ? {gates:Object.fromEntries(detail.criteria.map((criterion) => [criterion.id,detail.existingGateResponses.find((response) => response.criteriaId === criterion.id)?.passed ?? null]))} : {}), notes: detail.notes }
    else submitted = { kind: "weighted_score", scores: Object.fromEntries(detail.criteria.map((criterion) => [criterion.id, criterion.currentScore])), notes: detail.notes }
    snapshot = { targetId, judgeId: judge.id, revision: Number(stored?.revision ?? 0), criteriaVersion: scope.criteriaVersion, response: stored?.response ?? submitted, submitted, hasDraft: Boolean(stored?.response), isComplete: detail.isComplete, canEdit: writable.ok && !hackathon.results_published_at, editReason: writable.ok ? hackathon.results_published_at ? "Results have been published. Your review is read-only." : null : writable.error, detail: hackathon.anonymous_judging ? { ...detail, teamName: null } : detail, projects: [], maxPicks: 0, prizeName: prizeResult.data?.name ?? null }
  } else {
    const [prizeResult, assignmentsResult, picksResult, versionResult] = await Promise.all([
      client.from("prizes").select("name,max_picks,round_id").eq("id", target.prizeId).eq("hackathon_id", hackathon.id).eq("judging_style", "judges_pick").maybeSingle(),
      client.from("judge_assignments").select("id,submission:submissions!submission_id(id,team_id,title,description,github_url,live_app_url,demo_video_url,screenshot_url)").eq("hackathon_id", hackathon.id).eq("judge_participant_id", judge.id).eq("prize_id", target.prizeId),
      client.from("judge_picks").select("submission_id,rank,reason").eq("hackathon_id", hackathon.id).eq("judge_participant_id", judge.id).eq("prize_id", target.prizeId).order("rank"),
      client.rpc("judging_pick_review_version", { p_prize_id: target.prizeId, p_judge_id: judge.id }),
    ])
    if ([prizeResult, assignmentsResult, picksResult, versionResult].some((result) => result.error)) throw new JudgingReviewError("We couldn't load your picks. Try again.", "unavailable", 503)
    if (!prizeResult.data || !assignmentsResult.data?.length) throw new JudgingReviewError("Review not found.", "not_found", 404)
    const eligibleAssignments = assignmentsResult.data.filter((row) => {
      const project = Array.isArray(row.submission) ? row.submission[0] : row.submission
      return project && (!judge.team_id || project.team_id !== judge.team_id)
    })
    if (!eligibleAssignments.length) throw new JudgingReviewError("No eligible projects are assigned to this review.", "not_found", 404)
    const projects: ReviewProject[] = eligibleAssignments.flatMap((row) => {
      const project = (Array.isArray(row.submission) ? row.submission[0] : row.submission) as { id: string; title: string; description: string | null; github_url: string | null; live_app_url: string | null; demo_video_url: string | null; screenshot_url: string | null } | null
      return project ? [{ submissionId: project.id, submissionTitle: project.title, submissionDescription: project.description, submissionGithubUrl: project.github_url, submissionLiveAppUrl: project.live_app_url, submissionDemoVideoUrl: project.demo_video_url, submissionScreenshotUrl: project.screenshot_url, teamName: null }] : []
    })
    const submitted: ReviewResponse = { kind: "judges_pick", rankedSubmissionIds: (picksResult.data ?? []).filter((pick) => projects.some((project) => project.submissionId === pick.submission_id)).map((pick) => pick.submission_id), notes: picksResult.data?.[0]?.reason ?? "" }
    const writable = await assertAssignmentWritable(eligibleAssignments[0].id, userId, hackathon)
    snapshot = { targetId, judgeId: judge.id, revision: Number(stored?.revision ?? 0), criteriaVersion: String(versionResult.data), response: stored?.response ?? submitted, submitted, hasDraft: Boolean(stored?.response), isComplete: submitted.rankedSubmissionIds.length > 0, canEdit: writable.ok && !hackathon.results_published_at, editReason: writable.ok ? hackathon.results_published_at ? "Results have been published. Your review is read-only." : null : writable.error, detail: null, projects, maxPicks: Math.max(1, prizeResult.data.max_picks ?? 1), prizeName: prizeResult.data.name }
  }
  snapshot.draftCriteriaVersion = stored?.response ? stored.criteria_version : null
  return { snapshot, hackathonId: hackathon.id, target }
}

export async function getJudgingReview(slug: string, userId: string, target: ReviewTarget): Promise<ReviewSnapshot> {
  return (await getReviewContext(slug, userId, target)).snapshot
}

export async function saveJudgingReview(slug: string, userId: string, target: ReviewTarget, input: { expectedRevision: number; criteriaVersion: string; response: ReviewResponse }, publish = false): Promise<ReviewSnapshot> {
  const { snapshot, hackathonId } = await getReviewContext(slug, userId, target)
  if (!snapshot.canEdit) throw new JudgingReviewError("Judging is closed. Your saved draft is still here.", "judging_closed", 409)
  if (input.expectedRevision !== snapshot.revision || input.criteriaVersion !== snapshot.criteriaVersion) throw new JudgingReviewError("This review changed. Reload it before saving. Your draft is safe on this device.", "review_changed", 409)
  const parsed = reviewResponseSchema.safeParse(input.response)
  if (!parsed.success) throw new JudgingReviewError("Check your answers and keep notes under 2,000 characters.", "invalid_response")
  const validation = validateReviewResponse(parsed.data, snapshot, publish)
  if (validation) throw new JudgingReviewError(validation, "invalid_response")
  const client = supabase() as unknown as SupabaseClient
  const { error } = await client.rpc("save_judging_review_atomic", {
    p_hackathon_id: hackathonId, p_judge_id: snapshot.judgeId, p_clerk_user_id: userId,
    p_assignment_id: "assignmentId" in target ? target.assignmentId : null,
    p_prize_id: "prizeId" in target ? target.prizeId : null,
    p_expected_revision: input.expectedRevision, p_criteria_version: input.criteriaVersion,
    p_response: parsed.data, p_publish: publish,
  })
  if (error) {
    if (/review_changed|scope_changed|scorecard_changed/.test(error.message)) throw new JudgingReviewError("This review changed. Reload it before saving. Your draft is safe on this device.", "review_changed", 409)
    if (/closed|not active|published|not writable|not_judging/.test(error.message)) throw new JudgingReviewError("Judging is closed. Your saved draft is still here.", "judging_closed", 409)
    throw new JudgingReviewError("Your review wasn't saved. Try again.", "save_failed", 503)
  }
  if (publish) {
    await withEventMutationLease(hackathonId, async () => {
      if ("assignmentId" in target) await recalculateForAssignment(target.assignmentId)
      else await calculatePrizeResults(hackathonId, target.prizeId)
    }).catch((error: unknown) => console.error("Review saved; results recalculation needs retry:", error))
  }
  return getJudgingReview(slug, userId, target)
}

type LegacyReviewResponse = { [Kind in ReviewResponse["kind"]]: Omit<Extract<ReviewResponse, {kind:Kind}>, "notes"> & {notes?:string} }[ReviewResponse["kind"]]

export async function publishLegacyJudgingReview(slug: string, userId: string, target: ReviewTarget, response: LegacyReviewResponse): Promise<ReviewSnapshot> {
  const snapshot = await getJudgingReview(slug, userId, target)
  if (snapshot.hasDraft) throw new JudgingReviewError("You have an unfinished draft. Open judging to review and submit it.", "review_changed", 409)
  return saveJudgingReview(slug, userId, target, { expectedRevision: snapshot.revision, criteriaVersion: snapshot.criteriaVersion, response: {...response, notes: response.notes ?? snapshot.submitted.notes} }, true)
}

export async function getJudgeDraftTargetIds(hackathonId: string, userId: string): Promise<string[]> {
  const client = supabase() as unknown as SupabaseClient
  const { data: judge } = await client.from("hackathon_participants").select("id").eq("hackathon_id", hackathonId).eq("clerk_user_id", userId).eq("role", "judge").maybeSingle()
  if (!judge) return []
  const { data, error } = await client.from("judging_review_drafts").select("assignment_id,prize_id").eq("hackathon_id", hackathonId).eq("judge_participant_id", judge.id).not("response", "is", null)
  if (error) throw new JudgingReviewError("We couldn't load your drafts. Try again.", "draft_unavailable", 503)
  return (data ?? []).map((row) => row.assignment_id ?? row.prize_id).filter((id): id is string => typeof id === "string")
}
