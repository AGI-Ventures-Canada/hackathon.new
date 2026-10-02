import { z } from "zod"
import type { AssignmentDetail } from "@/lib/services/judging"

const notes = z.string().max(2_000)
export const reviewResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("weighted_score"), scores: z.record(z.string().uuid(), z.number().int().nullable()), notes }),
  z.object({ kind: z.literal("gate_check"), gates: z.record(z.string().uuid(), z.boolean().nullable()), notes }),
  z.object({ kind: z.literal("bucket_sort"), bucketId: z.string().uuid().nullable(), gates: z.record(z.string().uuid(), z.boolean().nullable()).optional(), notes }),
  z.object({ kind: z.literal("judges_pick"), rankedSubmissionIds: z.array(z.string().uuid()).max(100), notes }),
])

export type ReviewResponse = z.infer<typeof reviewResponseSchema>
export type ReviewProject = Pick<AssignmentDetail, "submissionId" | "submissionTitle" | "submissionDescription" | "submissionGithubUrl" | "submissionLiveAppUrl" | "submissionDemoVideoUrl" | "submissionScreenshotUrl" | "teamName">
export type ReviewSnapshot = {
  targetId: string
  judgeId: string
  revision: number
  criteriaVersion: string
  response: ReviewResponse
  submitted: ReviewResponse
  hasDraft: boolean
  draftCriteriaVersion?: string | null
  isComplete: boolean
  canEdit: boolean
  editReason?: string | null
  detail: AssignmentDetail | null
  projects: ReviewProject[]
  maxPicks: number
  prizeName: string | null
}

export function validateReviewResponse(response: ReviewResponse, snapshot: Pick<ReviewSnapshot, "response" | "detail" | "projects" | "maxPicks"> & Partial<Pick<ReviewSnapshot, "submitted">>, publishing: boolean): string | null {
  if (response.kind !== (snapshot.submitted?.kind ?? snapshot.response.kind)) return "This review uses a different way to judge. Reload your review."
  const criteria = snapshot.detail?.criteria ?? []
  if (response.kind === "weighted_score") {
    const allowed = new Map(criteria.map((criterion) => [criterion.id, criterion]))
    for (const [id, score] of Object.entries(response.scores)) {
      const criterion = allowed.get(id)
      if (!criterion) return "The score categories changed. Reload your review."
      if (score !== null && (!Number.isInteger(score) || score < criterion.min_score || score > criterion.max_score)) return `Choose a score from ${criterion.min_score} to ${criterion.max_score} for ${criterion.name}.`
      if (score !== null && criterion.rubricLevels.length > 0 && !criterion.rubricLevels.some((level) => level.level_number === score)) return `Choose one of the listed ratings for ${criterion.name}.`
    }
    if (publishing && (criteria.length === 0 || criteria.some((criterion) => response.scores[criterion.id] == null))) return "Choose a score for every category."
  } else if (response.kind === "gate_check") {
    const allowed = new Set(criteria.map((criterion) => criterion.id))
    if (Object.keys(response.gates).some((id) => !allowed.has(id))) return "The checks changed. Reload your review."
    if (publishing && (criteria.length === 0 || criteria.some((criterion) => response.gates[criterion.id] == null))) return "Answer every check before submitting."
  } else if (response.kind === "bucket_sort") {
    if (publishing && criteria.length && !response.gates) return "Answer every check before submitting."
    if (response.gates) {
      if (Object.keys(response.gates).some((id) => !criteria.some((criterion) => criterion.id === id))) return "The checks changed. Reload your review."
      if (publishing && criteria.some((criterion) => response.gates?.[criterion.id] == null)) return "Answer every check before submitting."
    }
    if (response.bucketId && !snapshot.detail?.buckets.some((bucket) => bucket.id === response.bucketId)) return "The groups changed. Reload your review."
    if (publishing && !response.bucketId) return "Choose a group before submitting."
  } else {
    const allowed = new Set(snapshot.projects.map((project) => project.submissionId))
    if (new Set(response.rankedSubmissionIds).size !== response.rankedSubmissionIds.length) return "Pick each project only once."
    if (response.rankedSubmissionIds.some((id) => !allowed.has(id))) return "One of these projects is no longer assigned to you. Reload your review."
    if (response.rankedSubmissionIds.length > snapshot.maxPicks) return `Pick up to ${snapshot.maxPicks} projects.`
    if (publishing && response.rankedSubmissionIds.length === 0) return "Pick at least one project."
  }
  return null
}

export function reviewHasAnswers(response: ReviewResponse): boolean {
  if (response.notes.trim()) return true
  if (response.kind === "weighted_score") return Object.values(response.scores).some((value) => value !== null)
  if (response.kind === "gate_check") return Object.values(response.gates).some((value) => value !== null)
  if (response.kind === "bucket_sort") return response.bucketId !== null
  return response.rankedSubmissionIds.length > 0
}

export function reconcileReviewResponse(response: ReviewResponse, snapshot: ReviewSnapshot): ReviewResponse {
  if (response.kind !== snapshot.submitted.kind) return { ...snapshot.submitted, notes: response.notes }
  const criteria = snapshot.detail?.criteria ?? []
  if (response.kind === "weighted_score") return { ...response, scores: Object.fromEntries(criteria.map((criterion) => {
    const score = response.scores[criterion.id] ?? null
    const valid = score === null || (Number.isInteger(score) && score >= criterion.min_score && score <= criterion.max_score && (!criterion.rubricLevels.length || criterion.rubricLevels.some((level) => level.level_number === score)))
    return [criterion.id, valid ? score : null]
  })) }
  if (response.kind === "gate_check") return { ...response, gates: Object.fromEntries(criteria.map((criterion) => [criterion.id, response.gates[criterion.id] ?? null])) }
  if (response.kind === "bucket_sort") return { ...response, bucketId: snapshot.detail?.buckets.some((bucket) => bucket.id === response.bucketId) ? response.bucketId : null, ...(response.gates ? {gates:Object.fromEntries(criteria.map((criterion) => [criterion.id,response.gates?.[criterion.id] ?? null]))} : {}) }
  return { ...response, rankedSubmissionIds: [...new Set(response.rankedSubmissionIds)].filter((id) => snapshot.projects.some((project) => project.submissionId === id)).slice(0, snapshot.maxPicks) }
}
