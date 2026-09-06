import { Elysia, t } from "elysia"
import { auth } from "@clerk/nextjs/server"
import { getJudgingReview, saveJudgingReview, JudgingReviewError } from "@/lib/services/judging-reviews"
import { reviewResponseSchema } from "@/lib/utils/judging-review"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"

const draftBody = t.Object({
  expectedRevision: t.Integer({ minimum: 0, description: "The last review revision returned by the server." }),
  criteriaVersion: t.String({ maxLength: 128, description: "The scorecard version returned with the review." }),
  response: t.Unknown({ description: "Partial or complete scores, checks, group, or ordered picks, with private notes." }),
})

async function handleReview(slug: string, target: { assignmentId: string } | { prizeId: string }, body?: { expectedRevision: number; criteriaVersion: string; response: unknown }, publish = false) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Sign in to open your review.", code: "not_authenticated" }, { status: 401 })
  try {
    if (!body) return await getJudgingReview(slug, userId, target)
    const parsed = reviewResponseSchema.safeParse(body.response)
    if (!parsed.success) return Response.json({ error: "Check your review answers.", code: "invalid_response" }, { status: 400 })
    const limit = await checkRateLimit(`judge_review:${userId}`, { maxRequests: 120, windowMs: 60_000 }, { failureMode: "closed" })
    if (!limit.allowed) throw new RateLimitError(limit.resetAt, limit.remaining)
    return await saveJudgingReview(slug, userId, target, { ...body, response: parsed.data }, publish)
  } catch (error) {
    if (error instanceof JudgingReviewError) return Response.json({ error: error.message, code: error.code }, { status: error.status })
    throw error
  }
}

export const judgingReviewRoutes = new Elysia()
  .get("/hackathons/:slug/judging/reviews/:assignmentId", ({ params }) => handleReview(params.slug, { assignmentId: params.assignmentId }), {
    detail: { summary: "Open your project review", description: "Returns your saved draft, submitted answers, scorecard version and edit permissions. Requires a judge session." },
  })
  .patch("/hackathons/:slug/judging/reviews/:assignmentId", ({ params, body }) => handleReview(params.slug, { assignmentId: params.assignmentId }, body), {
    body: draftBody, detail: { summary: "Save a private review draft", description: "Saves partial answers without changing results or marking the review complete." },
  })
  .post("/hackathons/:slug/judging/reviews/:assignmentId", ({ params, body }) => handleReview(params.slug, { assignmentId: params.assignmentId }, body, true), {
    body: draftBody, detail: { summary: "Submit your project review", description: "Atomically publishes a complete review after checking ownership, scorecard version, revision and judging window." },
  })
  .get("/hackathons/:slug/judging/pick-reviews/:prizeId", ({ params }) => handleReview(params.slug, { prizeId: params.prizeId }), {
    detail: { summary: "Open your prize picks", description: "Returns your assigned projects, saved pick-list draft and submitted choices." },
  })
  .patch("/hackathons/:slug/judging/pick-reviews/:prizeId", ({ params, body }) => handleReview(params.slug, { prizeId: params.prizeId }, body), {
    body: draftBody, detail: { summary: "Save a private pick-list draft", description: "Saves ranked choices without counting them in prize results." },
  })
  .post("/hackathons/:slug/judging/pick-reviews/:prizeId", ({ params, body }) => handleReview(params.slug, { prizeId: params.prizeId }, body, true), {
    body: draftBody, detail: { summary: "Submit your prize picks", description: "Publishes your ranked picks atomically while this prize's judging window is open." },
  })
