import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { resolveClerkUsers } from "@/lib/services/clerk-users"
import { supabase } from "@/lib/db/client"
import { canJudgePrize, planJudgingDistribution, type DistributionSnapshot, type JudgingDistributionPreview } from "@/lib/judging/distribution-planner"
import { reconcileJudgingAfterMutation } from "@/lib/services/judging-notification-events"

export type { JudgingDistributionPreview } from "@/lib/judging/distribution-planner"

export class JudgingCoverageError extends Error {
  readonly code = "judging_uncovered"
  constructor() { super("Some projects have no eligible judges. Invite judges or adjust their prizes and rooms, then preview again.") }
}

export async function getJudgingDistributionPreview(hackathonId: string, input: { targetReviewsPerProject?: number } = {}): Promise<JudgingDistributionPreview> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_judging_distribution_snapshot", { p_hackathon_id: hackathonId })
  if (error || !data) throw new Error(error?.message ?? "We couldn't load judging assignments.")
  const snapshot = data as DistributionSnapshot
  const identities = await resolveClerkUsers(snapshot.judges.map((judge) => judge.name))
  snapshot.judges = snapshot.judges.map((judge) => ({ ...judge, name: identities.displayNames[judge.name] ?? identities.emails[judge.name] ?? "Judge" }))
  return planJudgingDistribution(snapshot, input.targetReviewsPerProject)
}

export async function applyJudgingDistribution(hackathonId: string, input: { targetReviewsPerProject: number; expectedVersion: string; requestKey: string }): Promise<{ createdAssignments: number; createdCoverage: number; coverage: JudgingDistributionPreview["coverage"]; warnings: string[]; version: string }> {
  const client = supabase() as unknown as SupabaseClient
  const { data: receipt, error: receiptError } = await client.rpc("get_judging_distribution_receipt", { p_hackathon_id: hackathonId, p_request_key: input.requestKey, p_expected_version: input.expectedVersion, p_target: input.targetReviewsPerProject })
  if (receiptError) throw new Error(receiptError.message)
  if (receipt) {
    await reconcileJudgingAfterMutation(hackathonId)
    return receipt
  }
  const preview = await getJudgingDistributionPreview(hackathonId, input)
  if (preview.version !== input.expectedVersion) throw new Error("Judging changed. Review the assignments again.")
  if (preview.coverage.some((pair) => pair.assigned + pair.planned === 0)) throw new JudgingCoverageError()
  const { data, error } = await client.rpc("apply_judging_distribution", { p_hackathon_id: hackathonId, p_expected_version: input.expectedVersion, p_request_key: input.requestKey, p_target: input.targetReviewsPerProject, p_assignments: preview.assignments, p_summary: { coverage: preview.coverage, warnings: preview.warnings } })
  if (error || !data) throw new Error(error?.message ?? "We couldn't assign these projects.")
  await reconcileJudgingAfterMutation(hackathonId)
  return { ...(data as { createdAssignments: number; createdCoverage: number; version: string }), coverage: preview.coverage, warnings: preview.warnings }
}

export async function distributePrizeJudges(hackathonId: string, prizeId: string, maxProjectsPerJudge: number, roomId?: string | null): Promise<{ assignedCount: number }> {
  if (!Number.isInteger(maxProjectsPerJudge) || maxProjectsPerJudge < 1 || maxProjectsPerJudge > 1000) throw new Error("Choose between 1 and 1,000 projects per judge.")
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_judging_distribution_snapshot", { p_hackathon_id: hackathonId })
  if (error || !data) throw new Error(error?.message ?? "We couldn't load judging assignments.")
  const snapshot = data as DistributionSnapshot
  const prize = snapshot.prizes.find((prize) => prize.id === prizeId)
  if (!prize || prize.style === "crowd_vote") return { assignedCount: 0 }
  const projects = snapshot.projects.filter((project) => !roomId || (project.roomIds ?? [project.roomId]).includes(roomId))
  const target = Math.max(1, Math.min(20, snapshot.judges.length, Math.ceil(snapshot.judges.length * maxProjectsPerJudge / Math.max(1, projects.length))))
  const preview = planJudgingDistribution({ ...snapshot, projects, prizes: [prize] }, target)
  const counts = new Map(snapshot.judges.map((judge) => [judge.id, snapshot.assignments.filter((a) => a.judgeId === judge.id && (a.prizeId === prize.id || (a.kind === "unified_weighted_score" && a.roundId === prize.roundId && a.prizeIds.includes(prize.id)))).length]))
  const assignments = preview.assignments.filter((assignment) => {
    const count = counts.get(assignment.judgeId) ?? 0
    if (count >= maxProjectsPerJudge) return false
    counts.set(assignment.judgeId, count + 1)
    return true
  })
  if (!assignments.length) return { assignedCount: 0 }
  const applied = await client.rpc("apply_judging_distribution", { p_hackathon_id: hackathonId, p_expected_version: snapshot.version, p_request_key: randomUUID(), p_target: target, p_assignments: assignments, p_summary: { coverage: [], warnings: preview.warnings } })
  if (applied.error || !applied.data) throw new Error(applied.error?.message ?? "We couldn't assign these projects.")
  await reconcileJudgingAfterMutation(hackathonId)
  return { assignedCount: Number(applied.data.createdAssignments) }
}

export type ManualJudgingAssignment = { submissionId: string; projectTitle: string; teamId: string | null; teamName: string | null; isAssigned: boolean; isComplete: boolean; isOwnTeam: boolean; canAssign: boolean; prizeNames: string[]; blockedReason: string | null }

export async function filterRoomJudgingAssignments<T extends { judge_participant_id: string; submission_id: string; round_id: string | null }>(hackathonId: string, candidates: T[]): Promise<T[]> {
  if (!candidates.length) return []
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_judging_distribution_snapshot", { p_hackathon_id: hackathonId })
  if (error || !data) throw new Error("We couldn't check which room judges can review these prizes.")
  const snapshot = data as DistributionSnapshot
  if (snapshot.closed) return []
  const judges = new Map(snapshot.judges.map((judge) => [judge.id, judge]))
  const projects = new Map(snapshot.projects.map((project) => [project.id, project]))
  return candidates.filter((candidate) => {
    const judge = judges.get(candidate.judge_participant_id)
    const project = projects.get(candidate.submission_id)
    return !!judge && !!project && snapshot.prizes.some((prize) => prize.style === "weighted_score" && prize.roundId === candidate.round_id && canJudgePrize(judge, project, prize))
  })
}

export async function listManualJudgeSubmissionAssignments(hackathonId: string, judgeParticipantId: string, prizeId?: string): Promise<ManualJudgingAssignment[]> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_judging_distribution_snapshot", { p_hackathon_id: hackathonId })
  if (error || !data) throw new Error(error?.message ?? "We couldn't load the judge's projects.")
  const snapshot = data as DistributionSnapshot
  const judge = snapshot.judges.find((judge) => judge.id === judgeParticipantId)
  if (!judge) throw new Error("This judge's prizes and rooms are still being set up. Try again shortly.")
  const roundId = snapshot.activeRoundId ?? null
  const prizes = snapshot.prizes.filter((prize) => prizeId ? prize.id === prizeId && ["gate_check", "bucket_sort"].includes(prize.style ?? "") : prize.style === "weighted_score" && prize.roundId === roundId)
  return snapshot.projects.map((project) => {
    const assigned = snapshot.assignments.filter((assignment) => assignment.judgeId === judge.id && assignment.projectId === project.id && (prizeId ? assignment.prizeId === prizeId : assignment.kind === "unified_weighted_score" && assignment.roundId === roundId))
    const eligible = prizes.filter((prize) => canJudgePrize(judge, project, prize))
    const isComplete = assigned.some((assignment) => assignment.complete)
    const isOwnTeam = !!judge.teamId && judge.teamId === project.teamId
    const canAssign = !snapshot.closed && eligible.length > 0 && !isOwnTeam
    return { submissionId: project.id, projectTitle: project.title, teamId: project.teamId, teamName: null, isAssigned: assigned.length > 0, isComplete, isOwnTeam, canAssign, prizeNames: eligible.map((prize) => prize.name), blockedReason: isComplete ? "Review submitted" : snapshot.closed ? "Judging is closed" : isOwnTeam ? "Judge's own team" : !eligible.length ? "Outside this judge's prizes or rooms" : null }
  }).sort((a, b) => Number(b.isAssigned) - Number(a.isAssigned) || a.projectTitle.localeCompare(b.projectTitle))
}

export async function listJudgingAssignmentRows(hackathonId: string) {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_judging_distribution_snapshot", { p_hackathon_id: hackathonId })
  if (error || !data) throw new Error(error?.message ?? "We couldn't load judging assignments.")
  const snapshot = data as DistributionSnapshot
  const identities = await resolveClerkUsers(snapshot.judges.map((judge) => judge.name))
  const judges = new Map(snapshot.judges.map((judge) => [judge.id, identities.displayNames[judge.name] ?? identities.emails[judge.name] ?? "Judge"]))
  const projects = new Map(snapshot.projects.map((project) => [project.id, project.title]))
  return snapshot.assignments.map((assignment) => ({ id: assignment.id, judgeParticipantId: assignment.judgeId, submissionId: assignment.projectId, judgeName: judges.get(assignment.judgeId) ?? "Judge", submissionTitle: projects.get(assignment.projectId) ?? "Project", isComplete: assignment.complete, prizeId: assignment.prizeId, prizeIds: assignment.prizeIds, roundId: assignment.roundId }))
}

export async function deleteJudgingAssignment(hackathonId: string, assignmentId: string): Promise<{ removed: boolean }> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.from("judge_assignments").delete().eq("id", assignmentId).eq("hackathon_id", hackathonId).select("id")
  if (error) throw new Error(error.message.includes("judging_rules_locked") ? "This review has been submitted. Start a new round to change assignments." : "We couldn't remove this project.")
  if (data?.length) await reconcileJudgingAfterMutation(hackathonId)
  return { removed: !!data?.length }
}

export type JudgeAssignmentOptions = {
  version: string
  prizeScope: "all" | "selected"
  prizeIds: string[]
  roomIds: string[]
  prizes: { id: string; name: string; style: string | null }[]
  rooms: { id: string; name: string }[]
  locked: boolean
}

export async function getJudgeAssignmentOptions(hackathonId: string, judgeId: string): Promise<JudgeAssignmentOptions> {
  const client = supabase() as unknown as SupabaseClient
  const [snapshotResult, roomsResult, picksResult] = await Promise.all([
    client.rpc("get_judging_distribution_snapshot", { p_hackathon_id: hackathonId }),
    client.from("rooms").select("id,name").eq("hackathon_id", hackathonId).order("display_order"),
    client.from("judge_picks").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("judge_participant_id", judgeId),
  ])
  if (snapshotResult.error || !snapshotResult.data || roomsResult.error || picksResult.error) throw new Error("We couldn't load this judge's prizes and rooms.")
  const snapshot = snapshotResult.data as DistributionSnapshot
  const judge = snapshot.judges.find((judge) => judge.id === judgeId)
  if (!judge) throw new Error("This judge's invitation setup is still pending. Try again shortly.")
  return { version: snapshot.version, prizeScope: judge.prizeScope ?? "all", prizeIds: judge.prizeIds ?? [], roomIds: judge.roomIds ?? [], prizes: snapshot.prizes.filter((prize) => prize.style !== "crowd_vote").map(({ id, name, style }) => ({ id, name, style })), rooms: roomsResult.data ?? [], locked: snapshot.closed || snapshot.assignments.some((assignment) => assignment.judgeId === judgeId && assignment.complete) || (picksResult.count ?? 0) > 0 }
}

export async function saveJudgeAssignmentScope(hackathonId: string, judgeId: string, input: { expectedVersion: string; prizeScope: "all" | "selected"; prizeIds: string[]; roomIds: string[] }): Promise<JudgeAssignmentOptions> {
  const client = supabase() as unknown as SupabaseClient
  const { error } = await client.rpc("save_judging_judge_scope", { p_hackathon_id: hackathonId, p_judge_id: judgeId, p_expected_version: input.expectedVersion, p_prize_scope: input.prizeScope, p_prize_ids: input.prizeIds, p_room_ids: input.roomIds })
  if (error) throw new Error(error.message)
  await reconcileJudgingAfterMutation(hackathonId)
  return getJudgeAssignmentOptions(hackathonId, judgeId)
}

export async function assignJudgeToPrizeProject(hackathonId: string, judgeId: string, projectId: string, prizeId: string): Promise<{ success: boolean; alreadyAssigned?: boolean; error?: string }> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_judging_distribution_snapshot", { p_hackathon_id: hackathonId })
  if (error || !data) return { success: false, error: "We couldn't load judging assignments." }
  const snapshot = data as DistributionSnapshot
  const judge = snapshot.judges.find((judge) => judge.id === judgeId)
  const project = snapshot.projects.find((project) => project.id === projectId)
  const prize = snapshot.prizes.find((prize) => prize.id === prizeId)
  if (snapshot.closed || !judge || !project || !prize || !["gate_check", "bucket_sort"].includes(prize.style ?? "") || !canJudgePrize(judge, project, prize)) return { success: false, error: "This project isn't available for this judge and prize." }
  if (snapshot.assignments.some((assignment) => assignment.judgeId === judgeId && assignment.projectId === projectId && assignment.prizeId === prizeId)) return { success: true, alreadyAssigned: true }
  const result = await client.rpc("apply_judging_distribution", { p_hackathon_id: hackathonId, p_expected_version: snapshot.version, p_request_key: randomUUID(), p_target: 1, p_assignments: [{ judgeId, projectId, prizeId, roundId: prize.roundId, kind: "per_prize", prizeIds: [prizeId] }], p_summary: { coverage: [], warnings: [] } })
  if (!result.error) await reconcileJudgingAfterMutation(hackathonId)
  return result.error ? { success: false, error: result.error.message } : { success: true, alreadyAssigned: false }
}

export async function unassignJudgeFromPrizeProject(hackathonId: string, judgeId: string, projectId: string, prizeId: string): Promise<{ success: boolean; removed?: boolean; error?: string }> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.from("judge_assignments").delete().eq("hackathon_id", hackathonId).eq("judge_participant_id", judgeId).eq("submission_id", projectId).eq("prize_id", prizeId).select("id")
  if (!error && data?.length) await reconcileJudgingAfterMutation(hackathonId)
  return error ? { success: false, error: "Submitted reviews stay saved. Remove only projects that haven't been submitted." } : { success: true, removed: !!data?.length }
}
