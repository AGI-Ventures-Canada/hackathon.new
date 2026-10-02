import { Elysia, t } from "elysia"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { z } from "zod"
import { normalizeUrl } from "@/lib/utils/url"
import { isAllowedHttpsUrl } from "@/lib/utils/safe-fetch-url"
import { isValidUuid } from "@/lib/utils/uuid"
import { getPublicHackathon, listPublicHackathons } from "@/lib/services/public-hackathons"
import { registerForHackathon, getParticipantCount, isUserRegistered } from "@/lib/services/hackathons"
import { getPublicTenantWithEvents } from "@/lib/services/tenant-profiles"
import {
  getParticipantWithTeam,
  getSubmissionForParticipant,
  getExistingSubmission,
  createSubmission,
  updateSubmission,
  getHackathonSubmissions,
  getTeamMemberCount,
  notifySubmissionMembers,
  isSubmissionWindowOpen,
} from "@/lib/services/submissions"
import { getTeamSizeWarning } from "@/lib/utils/team-size"
import { currentTermsHash, recordTermsAcceptance } from "@/lib/services/hackathon-terms"
import {
  buildSubmissionScreenshotMetadata,
  getSubmissionScreenshots,
  getSubmissionScreenshotUrls,
  MAX_SUBMISSION_SCREENSHOTS,
  MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES,
  type SubmissionScreenshot,
  type SubmissionScreenshotSlot,
} from "@/lib/utils/submission-screenshots"
import type { Json } from "@/lib/db/types"
import { pendingTeamApprovalResponse } from "@/lib/api/responses"
import { getVerifiedUserEmails } from "@/lib/auth/verified-emails"
import {
  publicSubmitterName,
  publicTeamName,
} from "@/lib/utils/anonymous-judging"
import { syncSubmissionChallenges } from "@/lib/services/challenges"
import { RateLimitError } from "@/lib/services/rate-limit"
import { BoundedFormDataError, readBoundedFormData } from "@/lib/utils/bounded-form-data"

const aggregateSubmissionPayloadSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(280),
  githubUrl: z.string().trim().min(1).max(2_048),
  liveAppUrl: z.string().trim().max(2_048).nullable().optional(),
  demoVideoUrl: z.string().trim().max(2_048).nullable().optional(),
  challengeIds: z
    .array(z.string())
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  retainedScreenshotSlots: z
    .array(z.union([z.literal(0), z.literal(1)]))
    .max(MAX_SUBMISSION_SCREENSHOTS)
    .refine((slots) => new Set(slots).size === slots.length),
  requestId: z.uuid(),
})

const allowedSubmissionScreenshotTypes = new Set(["image/png", "image/jpeg", "image/webp"])
const aggregateScreenshotPathsKey = "submissionScreenshotPaths"
const aggregateScreenshotCleanupKey = "submissionScreenshotCleanup"
const aggregateSubmissionRequestKey = "submissionAggregateRequestId"

type AggregateScreenshot = SubmissionScreenshot & { path: string | null }

async function consumeJudgingWriteLimit(hackathonId: string, userId: string) {
  const { checkRateLimit } = await import("@/lib/services/rate-limit")
  const limit = await checkRateLimit(
    `judge_score:${hackathonId}:${userId}`,
    { maxRequests: 30, windowMs: 60_000 },
    { failureMode: "closed" },
  )
  if (!limit.allowed) throw new RateLimitError(limit.resetAt, limit.remaining)
}

async function recalculatePrizeWithLease(hackathonId: string, prizeId: string) {
  const [{ calculatePrizeResults }, { withEventMutationLease }] = await Promise.all([
    import("@/lib/services/judging"),
    import("@/lib/services/event-mutation-lease"),
  ])
  return withEventMutationLease(hackathonId, () => calculatePrizeResults(hackathonId, prizeId))
}


async function publishReviewFromLegacyRoute(...args: Parameters<typeof import("@/lib/services/judging-reviews").publishLegacyJudgingReview>): Promise<Response | null> {
  const {publishLegacyJudgingReview, JudgingReviewError} = await import("@/lib/services/judging-reviews")
  try { await publishLegacyJudgingReview(...args); return null }
  catch (error) {
    if (error instanceof JudgingReviewError) return Response.json({error:error.message,code:error.code},{status:error.status})
    throw error
  }
}

async function persistRequiredTermsAcceptance(
  hackathonId: string,
  userId: string,
  termsHash: string
): Promise<Response | null> {
  try {
    await recordTermsAcceptance(hackathonId, userId, termsHash)
    return null
  } catch (err) {
    console.error("Failed to record terms acceptance:", err)
    return new Response(
      JSON.stringify({
        error: "We couldn't save your terms acceptance. Please try again.",
        code: "terms_record_failed",
        retryable: true,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

function isUploadedFile(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number" &&
    typeof (value as File).type === "string"
  )
}

function metadataRecord(metadata: Json | null | undefined): Record<string, Json | undefined> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, Json | undefined>
    : {}
}

function getAggregateScreenshots(submission: {
  metadata?: Json | null
  screenshot_url?: string | null
}): AggregateScreenshot[] {
  const metadata = metadataRecord(submission.metadata)
  const rawPaths = metadataRecord(
    metadata[aggregateScreenshotPathsKey] as Json | null | undefined
  )
  return getSubmissionScreenshots(submission).map((screenshot) => ({
    ...screenshot,
    path: typeof rawPaths[String(screenshot.slot)] === "string"
      ? rawPaths[String(screenshot.slot)] as string
      : null,
  }))
}

function getAggregateCleanup(metadata: Json | null | undefined): string[] {
  const raw = metadataRecord(metadata)[aggregateScreenshotCleanupKey]
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string").slice(0, 20)
    : []
}

function getAggregateRequestId(metadata: Json | null | undefined): string | null {
  const value = metadataRecord(metadata)[aggregateSubmissionRequestKey]
  return typeof value === "string" ? value : null
}

function buildAggregateScreenshotMetadata(
  metadata: Json | null | undefined,
  screenshots: AggregateScreenshot[],
  cleanup: string[],
  requestId?: string,
) {
  const next = buildSubmissionScreenshotMetadata(metadata, screenshots)
  next[aggregateScreenshotPathsKey] = Object.fromEntries(
    screenshots.flatMap((screenshot) =>
      screenshot.path ? [[String(screenshot.slot), screenshot.path]] : []
    )
  )
  next[aggregateScreenshotCleanupKey] = cleanup.slice(0, 20)
  if (requestId) next[aggregateSubmissionRequestKey] = requestId
  return next
}

function submissionErrorResponse(
  error: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return new Response(JSON.stringify({ error, code, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function deleteSubmissionScreenshotTargets(
  submissionId: string,
  targets: string[],
): Promise<string[]> {
  const { deleteScreenshotVersion, deleteScreenshot } = await import("@/lib/services/storage")
  const failed: string[] = []
  for (const target of targets) {
    let deleted = false
    try {
      if (target.startsWith("slot:")) {
        const slot = Number(target.slice("slot:".length))
        deleted = Number.isInteger(slot) && slot >= 0 && slot < MAX_SUBMISSION_SCREENSHOTS
          ? await deleteScreenshot(submissionId, slot)
          : false
      } else {
        deleted = await deleteScreenshotVersion(submissionId, target)
      }
    } catch {
      deleted = false
    }
    if (!deleted) failed.push(target)
  }
  return failed
}

function validateSubmissionUrl(rawUrl: string | null | undefined): string | null | undefined {
  if (rawUrl === null || rawUrl === undefined || !rawUrl.trim()) return null
  const normalized = normalizeUrl(rawUrl)
  if (!isAllowedHttpsUrl(normalized)) throw new Error("invalid_url")
  return normalized
}

export const publicRoutes = new Elysia({ prefix: "/public" })
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }), {
    detail: {
      summary: "Health check",
      description: "Returns service health status and current timestamp.",
    },
  })
  .get("/hackathons/:slug", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    const termsHash = await currentTermsHash({
      require_terms_acceptance: hackathon.require_terms_acceptance ?? false,
      terms_content: hackathon.terms_content ?? null,
    })

    return {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      description: hackathon.description,
      rules: hackathon.rules,
      bannerUrl: hackathon.banner_url,
      status: hackathon.status,
      phase: hackathon.phase,
      startsAt: hackathon.starts_at,
      endsAt: hackathon.ends_at,
      registrationOpensAt: hackathon.registration_opens_at,
      registrationClosesAt: hackathon.registration_closes_at,
      allowLateRegistration: hackathon.allow_late_registration,
      requireTermsAcceptance: Boolean(termsHash),
      termsContent: termsHash ? hackathon.terms_content : null,
      termsHash,
      organizer: {
        id: hackathon.organizer.id,
        name: hackathon.organizer.name,
        slug: hackathon.organizer.slug,
        logoUrl: hackathon.organizer.logo_url,
      },
      sponsors: hackathon.sponsors.map((s) => ({
        id: s.id,
        name: s.name,
        logoUrl: s.logo_url,
        websiteUrl: s.website_url,
        tier: s.tier,
        useOrgAssets: s.use_org_assets,
        tenant: s.tenant
          ? {
              slug: s.tenant.slug,
              name: s.tenant.name,
              logoUrl: s.tenant.logo_url,
              logoUrlDark: s.tenant.logo_url_dark,
              websiteUrl: s.tenant.website_url,
              description: s.tenant.description,
            }
          : null,
      })),
    }
  }, {
    detail: {
      summary: "Get hackathon by slug",
      description: "Returns public hackathon details including sponsors.",
    },
  })
  .post("/hackathons/:slug/register", async ({ params, body }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    if (
      hackathon.require_location_verification &&
      hackathon.location_latitude != null &&
      hackathon.location_longitude != null
    ) {
      return new Response(
        JSON.stringify({
          error: "This event needs organizer check-in. Ask the organizer to add you.",
          code: "organizer_check_in_required",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    }

    const expectedTermsHash = await currentTermsHash({
      require_terms_acceptance: hackathon.require_terms_acceptance ?? false,
      terms_content: hackathon.terms_content ?? null,
    })
    if (expectedTermsHash && (!body?.terms_hash || body.terms_hash !== expectedTermsHash)) {
      return new Response(
        JSON.stringify({ error: "You must accept the terms and conditions to register.", code: "terms_required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    let teamName: string | undefined
    let userEmails: string[]
    try {
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      userEmails = getVerifiedUserEmails(user)
      const displayName = user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.username || user.emailAddresses?.[0]?.emailAddress?.split("@")[0]
      if (displayName) {
        teamName = `${displayName}'s Team`
      }
    } catch (err) {
      console.warn("Failed to fetch user for team name:", err)
      return new Response(
        JSON.stringify({ error: "We couldn't check your account. Please try again.", code: "account_check_failed" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      )
    }

    const { findPendingTeamInvitationForEmails } = await import("@/lib/services/team-invitations")
    const pendingInvitation = await findPendingTeamInvitationForEmails(
      hackathon.id,
      userEmails,
    )
    if (pendingInvitation) {
      return new Response(
        JSON.stringify({
          error: `You have an invite to join ${pendingInvitation.teamName}.`,
          code: "pending_team_invitation",
          inviteUrl: `/invite/${pendingInvitation.token}`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      )
    }

    if (expectedTermsHash) {
      const termsFailure = await persistRequiredTermsAcceptance(hackathon.id, userId, expectedTermsHash)
      if (termsFailure) return termsFailure
    }

    const result = await registerForHackathon(hackathon.id, userId, teamName, userEmails)

    if (!result.success) {
      const statusCode = ["already_registered", "pending_team_invitation"].includes(result.code) ? 409 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    const { triggerWebhooks } = await import("@/lib/services/webhooks")
    triggerWebhooks(hackathon.tenant_id, "participant.registered", {
      event: "participant.registered",
      timestamp: new Date().toISOString(),
      data: { hackathonId: hackathon.id, participantId: result.participantId, teamId: result.teamId },
    }).catch(console.error)

    const { deliverAttendeeLifecycleEmailsForUser } = await import(
      "@/lib/services/attendee-lifecycle-notifications"
    )
    await deliverAttendeeLifecycleEmailsForUser(hackathon.id, userId).catch((error) =>
      console.error("Failed to send registration confirmation:", error)
    )

    return {
      success: true,
      participantId: result.participantId,
      teamId: result.teamId,
    }
  }, {
    detail: {
      summary: "Register for hackathon",
      description: "Registers the authenticated user for a hackathon. Requires Clerk session. Optionally accepts latitude/longitude for location verification.",
    },
    body: t.Optional(t.Object({
      latitude: t.Optional(t.Number()),
      longitude: t.Optional(t.Number()),
      terms_hash: t.Optional(t.String({ description: "SHA-256 of accepted terms content. Required when the hackathon has terms acceptance enabled." })),
    })),
  })
  .get("/hackathons/:slug/submissions/me", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return { submission: null }
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return { submission: null }
    }

    const submission = await getSubmissionForParticipant(hackathon.id, userId)

    if (!submission) {
      return { submission: null }
    }

    return {
      submission: {
        id: submission.id,
        title: submission.title,
        description: submission.description,
        githubUrl: submission.github_url,
        liveAppUrl: submission.live_app_url,
        demoVideoUrl: submission.demo_video_url,
        screenshotUrl: submission.screenshot_url,
        screenshotUrls: getSubmissionScreenshotUrls(submission),
        status: submission.status,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
      },
    }
  }, {
    detail: {
      summary: "Get my submission",
      description: "Returns the authenticated user's submission for a hackathon.",
    },
  })
  .get("/hackathons/:slug/submissions", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const submissions = await getHackathonSubmissions(hackathon.id)

    return {
      submissions: submissions.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        githubUrl: s.github_url,
        liveAppUrl: s.live_app_url,
        demoVideoUrl: s.demo_video_url,
        screenshotUrl: s.screenshot_url,
        screenshotUrls: getSubmissionScreenshotUrls(s),
        status: s.status,
        createdAt: s.created_at,
        submitter: publicSubmitterName(hackathon, s.submitter_name),
      })),
    }
  }, {
    detail: {
      summary: "List submissions",
      description: "Lists all submissions for a hackathon.",
    },
  })
  .get("/hackathons/:slug/presenter-views/:viewId", async ({ params }) => {
    if (!isValidUuid(params.viewId)) {
      return new Response(
        JSON.stringify({ error: "Presenter view not found", code: "presenter_view_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }
    const { getPresenterView, resolvePresenterSubmissions } = await import("@/lib/services/presenter-views")
    const view = await getPresenterView(params.viewId)
    if (!view) {
      return new Response(
        JSON.stringify({ error: "Presenter view not found", code: "presenter_view_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }
    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }
    if (view.hackathon_id !== hackathon.id) {
      return new Response(
        JSON.stringify({ error: "Presenter view not found", code: "presenter_view_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }
    const submissions = await resolvePresenterSubmissions(view)
    return {
      view: { id: view.id, name: view.name, config: view.config },
      hackathon: { id: hackathon.id, name: hackathon.name, slug: hackathon.slug },
      submissions: submissions.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        githubUrl: s.github_url,
        liveAppUrl: s.live_app_url,
        demoVideoUrl: s.demo_video_url,
        screenshotUrl: s.screenshot_url,
        screenshotUrls: getSubmissionScreenshotUrls(s),
        submitter: publicSubmitterName(hackathon, s.submitter_name),
      })),
    }
  }, {
    detail: {
      summary: "Get presenter view (resolved)",
      description: "Public-facing endpoint that returns the hackathon, the view metadata, and the list of submissions to project on the showcase display. Auth-free so the /e/<slug>/display/showcase page works on a projector with no login.",
    },
  })
  .post(
    "/hackathons/:slug/submissions",
    async ({ params, body, set }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)

      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (
        hackathon.status !== "active" ||
        !(await isSubmissionWindowOpen(hackathon.id, hackathon.ends_at))
      ) {
        return new Response(
          JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const participant = await getParticipantWithTeam(hackathon.id, userId)

      if (!participant) {
        return new Response(
          JSON.stringify({ error: "You must register before submitting", code: "not_registered" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      if (participant.teamStatus === "pending_approval") {
        return pendingTeamApprovalResponse(set)
      }
      if (participant.teamStatus === "disbanded") {
        return submissionErrorResponse("Your team is no longer active", "team_not_active", 409)
      }

      const existing = await getExistingSubmission(
        hackathon.id,
        participant.participantId,
        participant.teamId
      )

      if (existing) {
        return new Response(
          JSON.stringify({ error: "You have already submitted a project", code: "already_submitted" }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      }

      let teamSizeWarning: string | null = null
      let teamMemberCount = 1
      if (participant.teamId) {
        teamMemberCount = await getTeamMemberCount(participant.teamId)
        const warning = getTeamSizeWarning({
          memberCount: teamMemberCount,
          minTeamSize: hackathon.min_team_size,
          allowSolo: hackathon.allow_solo,
        })
        if (warning) teamSizeWarning = warning.message
      } else if (!hackathon.allow_solo) {
        teamSizeWarning = `Solo participants are not allowed — this event requires teams of at least ${hackathon.min_team_size}.`
      }

      let githubUrl: string
      let liveAppUrl: string | null | undefined
      let demoVideoUrl: string | null | undefined
      try {
        githubUrl = validateSubmissionUrl(body.githubUrl) as string
        liveAppUrl = validateSubmissionUrl(body.liveAppUrl)
        demoVideoUrl = validateSubmissionUrl(body.demoVideoUrl)
        const url = new URL(githubUrl)
        if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
          return new Response(
            JSON.stringify({ error: "GitHub URL must be from github.com", code: "invalid_github_url" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Check the project links and try again", code: "invalid_url" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      if (body.challengeIds?.some((id) => !isValidUuid(id))) {
        return new Response(
          JSON.stringify({ error: "Invalid challenge ID", code: "invalid_challenge_id" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
      if (body.challengeIds && new Set(body.challengeIds).size !== body.challengeIds.length) {
        return new Response(
          JSON.stringify({ error: "Choose each challenge once", code: "duplicate_challenge_id" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      let submission
      try {
        submission = await createSubmission(
          hackathon.id,
          participant.participantId,
          participant.teamId,
          {
            title: body.title,
            description: body.description,
            githubUrl,
            liveAppUrl,
            demoVideoUrl,
            metadata: teamSizeWarning
              ? { teamSizeWarning, teamMemberCount }
              : undefined,
            challengeIds: body.challengeIds,
          }
        )
      } catch (error) {
        if (error instanceof Error && error.name === "SubmissionChallengeSyncError") {
          return submissionErrorResponse(
            "Your project was saved, but its challenges still need to sync. Try again.",
            "challenge_sync_failed",
            503,
          )
        }
        throw error
      }

      if (!submission) {
        const racedSubmission = await getExistingSubmission(
          hackathon.id,
          participant.participantId,
          participant.teamId,
        )
        if (racedSubmission) {
          return new Response(
            JSON.stringify({ error: "You have already submitted a project", code: "already_submitted" }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        }
        return new Response(
          JSON.stringify({ error: "Failed to create submission", code: "create_failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      }

      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      triggerWebhooks(hackathon.tenant_id, "submission.created", {
        event: "submission.created",
        timestamp: new Date().toISOString(),
        data: { hackathonId: hackathon.id, submissionId: submission.id, title: body.title },
      }).catch(console.error)

      notifySubmissionMembers({
        hackathonId: hackathon.id,
        submissionId: submission.id,
        participantId: participant.participantId,
        teamId: participant.teamId,
        projectTitle: body.title,
      }).catch(console.error)

      return { success: true, submissionId: submission.id, teamSizeWarning }
    },
    {
      detail: {
        summary: "Create submission",
        description: "Creates a new project submission. Requires registration and active hackathon.",
      },
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 100 }),
        description: t.String({ minLength: 1, maxLength: 280 }),
        githubUrl: t.String(),
        liveAppUrl: t.Optional(t.Union([t.String(), t.Null()])),
        demoVideoUrl: t.Optional(t.Union([t.String(), t.Null()])),
        challengeIds: t.Optional(t.Array(t.String())),
      }),
    }
  )
  .patch(
    "/hackathons/:slug/submissions",
    async ({ params, body, set }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)

      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (
        hackathon.status !== "active" ||
        !(await isSubmissionWindowOpen(hackathon.id, hackathon.ends_at))
      ) {
        return new Response(
          JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const participant = await getParticipantWithTeam(hackathon.id, userId)

      if (!participant) {
        return new Response(
          JSON.stringify({ error: "You must register before submitting", code: "not_registered" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      if (participant.teamStatus === "pending_approval") {
        return pendingTeamApprovalResponse(set)
      }
      if (participant.teamStatus === "disbanded") {
        return submissionErrorResponse("Your team is no longer active", "team_not_active", 409)
      }

      const existing = await getExistingSubmission(
        hackathon.id,
        participant.participantId,
        participant.teamId
      )

      if (!existing) {
        return new Response(
          JSON.stringify({ error: "No submission found to update", code: "no_submission" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      let normalizedGithubUrl: string | undefined
      let normalizedLiveAppUrl: string | null | undefined
      let normalizedDemoVideoUrl: string | null | undefined
      try {
        normalizedGithubUrl = validateSubmissionUrl(body.githubUrl) ?? undefined
        normalizedLiveAppUrl = validateSubmissionUrl(body.liveAppUrl)
        normalizedDemoVideoUrl = validateSubmissionUrl(body.demoVideoUrl)
        if (normalizedGithubUrl) {
          const url = new URL(normalizedGithubUrl)
          if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
            return new Response(
              JSON.stringify({ error: "GitHub URL must be from github.com", code: "invalid_github_url" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            )
          }
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Check the project links and try again", code: "invalid_url" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      if (body.challengeIds?.some((id) => !isValidUuid(id))) {
        return new Response(
          JSON.stringify({ error: "Invalid challenge ID", code: "invalid_challenge_id" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
      if (body.challengeIds && new Set(body.challengeIds).size !== body.challengeIds.length) {
        return new Response(
          JSON.stringify({ error: "Choose each challenge once", code: "duplicate_challenge_id" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      let submission
      try {
        submission = await updateSubmission(
          existing.id,
          participant.participantId,
          participant.teamId,
          {
            title: body.title,
            description: body.description,
            githubUrl: normalizedGithubUrl,
            liveAppUrl: normalizedLiveAppUrl,
            demoVideoUrl: normalizedDemoVideoUrl,
            challengeIds: body.challengeIds,
            expectedUpdatedAt: existing.updated_at,
          }
        )
      } catch (error) {
        if (error instanceof Error && error.name === "SubmissionChallengeSyncError") {
          return submissionErrorResponse(
            "Your project was saved, but its challenges still need to sync. Try again.",
            "challenge_sync_failed",
            503,
          )
        }
        throw error
      }

      if (!submission) {
        return new Response(
          JSON.stringify({
            error: "This project changed in another tab. Refresh and try again.",
            code: "stale_submission",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      }

      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      triggerWebhooks(hackathon.tenant_id, "submission.updated", {
        event: "submission.updated",
        timestamp: new Date().toISOString(),
        data: { hackathonId: hackathon.id, submissionId: submission.id },
      }).catch(console.error)

      return { success: true, submissionId: submission.id }
    },
    {
      detail: {
        summary: "Update submission",
        description: "Updates an existing submission. All fields optional.",
      },
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        description: t.Optional(t.String({ minLength: 1, maxLength: 280 })),
        githubUrl: t.Optional(t.String()),
        liveAppUrl: t.Optional(t.Union([t.String(), t.Null()])),
        demoVideoUrl: t.Optional(t.Union([t.String(), t.Null()])),
        challengeIds: t.Optional(t.Array(t.String())),
      }),
    }
  )
  .post("/hackathons/:slug/submissions/complete", async ({ params, request, set }) => {
    const { userId } = await auth()

    if (!userId) {
      return submissionErrorResponse("Sign in required", "not_authenticated", 401)
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return submissionErrorResponse("Hackathon not found", "hackathon_not_found", 404)
    }
    if (
      hackathon.status !== "active" ||
      !(await isSubmissionWindowOpen(hackathon.id, hackathon.ends_at))
    ) {
      return submissionErrorResponse(
        "Submissions are not currently open",
        "submissions_closed",
        400
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const registration = await getRegistrationInfo(hackathon.id, userId)
    if (registration.participantRole !== "participant") {
      return submissionErrorResponse(
        "Only attendees can save a project",
        "not_attendee",
        403,
      )
    }

    const participant = await getParticipantWithTeam(hackathon.id, userId)
    if (!participant) {
      return submissionErrorResponse(
        "You must register before submitting",
        "not_registered",
        403
      )
    }
    if (participant.teamStatus === "pending_approval") {
      return pendingTeamApprovalResponse(set)
    }
    if (participant.teamStatus === "disbanded") {
      return submissionErrorResponse("Your team is no longer active", "team_not_active", 409)
    }

    const { checkRateLimit } = await import("@/lib/services/rate-limit")
    const completionLimit = await checkRateLimit(
      `submission_complete:${hackathon.id}:${userId}`,
      { maxRequests: 10, windowMs: 60 * 60_000 },
      { failureMode: "closed" },
    )
    if (!completionLimit.allowed) {
      throw new RateLimitError(completionLimit.resetAt, completionLimit.remaining)
    }
    let formData: FormData
    try {
      formData = await readBoundedFormData(
        request,
        MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES + 256 * 1024,
      )
    } catch (error) {
      if (error instanceof BoundedFormDataError && error.code === "request_too_large") {
        return submissionErrorResponse("Project upload is too large", "request_too_large", 413)
      }
      return submissionErrorResponse("Invalid project form", "invalid_form", 400)
    }

    const rawPayload = formData.get("payload")
    if (typeof rawPayload !== "string") {
      return submissionErrorResponse("Project details are required", "invalid_form", 400)
    }

    let payload: z.infer<typeof aggregateSubmissionPayloadSchema>
    try {
      payload = aggregateSubmissionPayloadSchema.parse(JSON.parse(rawPayload))
    } catch {
      return submissionErrorResponse("Check the project details and try again", "invalid_form", 400)
    }

    if (payload.challengeIds?.some((id) => !isValidUuid(id))) {
      return submissionErrorResponse("Invalid challenge ID", "invalid_challenge_id", 400)
    }

    let githubUrl: string
    let liveAppUrl: string | null | undefined
    let demoVideoUrl: string | null | undefined
    try {
      githubUrl = validateSubmissionUrl(payload.githubUrl) as string
      const github = new URL(githubUrl)
      if (!["github.com", "www.github.com"].includes(github.hostname)) {
        return submissionErrorResponse(
          "GitHub URL must be from github.com",
          "invalid_github_url",
          400
        )
      }
      liveAppUrl = validateSubmissionUrl(payload.liveAppUrl)
      demoVideoUrl = validateSubmissionUrl(payload.demoVideoUrl)
    } catch {
      return submissionErrorResponse("Check the project links and try again", "invalid_url", 400)
    }

    const screenshotFiles = new Map<SubmissionScreenshotSlot, File>()
    let screenshotBytes = 0
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("screenshot_")) continue
      const slot = Number(key.slice("screenshot_".length))
      if (
        !Number.isInteger(slot) ||
        slot < 0 ||
        slot >= MAX_SUBMISSION_SCREENSHOTS ||
        !isUploadedFile(value) ||
        screenshotFiles.has(slot as SubmissionScreenshotSlot)
      ) {
        return submissionErrorResponse(
          "Invalid screenshot slot",
          "invalid_screenshot_slot",
          400
        )
      }
      if (!allowedSubmissionScreenshotTypes.has(value.type)) {
        return submissionErrorResponse(
          "Invalid file type. Use PNG, JPEG, or WebP",
          "invalid_file_type",
          400
        )
      }
      screenshotBytes += value.size
      if (screenshotBytes > MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES) {
        return submissionErrorResponse(
          "Screenshots must be 4MB or less in total",
          "file_too_large",
          400
        )
      }
      screenshotFiles.set(slot as SubmissionScreenshotSlot, value)
    }

    const retainedSlotSet = new Set(payload.retainedScreenshotSlots)
    for (const slot of screenshotFiles.keys()) {
      if (retainedSlotSet.has(slot)) {
        return submissionErrorResponse(
          "A screenshot slot cannot be kept and replaced at the same time",
          "invalid_screenshot_slot",
          400
        )
      }
    }

    const existing = await getExistingSubmission(
      hackathon.id,
      participant.participantId,
      participant.teamId
    )
    const existingScreenshots = existing ? getAggregateScreenshots(existing) : []
    const existingSlotSet = new Set(existingScreenshots.map((screenshot) => screenshot.slot))
    if ([...retainedSlotSet].some((slot) => !existingSlotSet.has(slot))) {
      return submissionErrorResponse(
        "A kept screenshot no longer exists",
        "stale_screenshot",
        409
      )
    }

    const { uploadScreenshotVersion } = await import("@/lib/services/storage")

    if (existing && getAggregateRequestId(existing.metadata) === payload.requestId) {
      if (!(await syncSubmissionChallenges(existing.id, payload.challengeIds ?? []))) {
        return submissionErrorResponse(
          "Your project was saved, but its challenges still need to sync. Try again.",
          "challenge_sync_failed",
          503,
        )
      }
      const cleanup = getAggregateCleanup(existing.metadata)
      const failedCleanup = await deleteSubmissionScreenshotTargets(existing.id, cleanup)
      return {
        success: true,
        submissionId: existing.id,
        teamSizeWarning: null,
        screenshots: existingScreenshots.map(({ slot, url }) => ({ slot, url })),
        cleanupPending: failedCleanup.length > 0,
      }
    }

    let teamSizeWarning: string | null = null
    let teamMemberCount = 1
    if (!existing) {
      if (participant.teamId) {
        teamMemberCount = await getTeamMemberCount(participant.teamId)
        const warning = getTeamSizeWarning({
          memberCount: teamMemberCount,
          minTeamSize: hackathon.min_team_size,
          allowSolo: hackathon.allow_solo,
        })
        if (warning) teamSizeWarning = warning.message
      } else if (!hackathon.allow_solo) {
        teamSizeWarning = `Solo participants are not allowed — this event requires teams of at least ${hackathon.min_team_size}.`
      }
    }

    const submissionId = existing?.id ?? payload.requestId
    const uploadAttemptId = crypto.randomUUID()
    const stagedScreenshots: AggregateScreenshot[] = []
    for (const [slot, file] of screenshotFiles) {
      const expectedPath = `${submissionId}/versions/${uploadAttemptId}-${slot}.webp`
      let uploadResult
      try {
        uploadResult = await uploadScreenshotVersion(
          submissionId,
          Buffer.from(await file.arrayBuffer()),
          slot,
          uploadAttemptId
        )
      } catch {
        uploadResult = null
      }
      if (!uploadResult) {
        await deleteSubmissionScreenshotTargets(
          submissionId,
          [
            ...stagedScreenshots.flatMap((screenshot) => screenshot.path ? [screenshot.path] : []),
            expectedPath,
          ]
        )
        return submissionErrorResponse(
          "Failed to upload screenshot",
          "upload_failed",
          500
        )
      }
      stagedScreenshots.push({ slot, url: uploadResult.url, path: uploadResult.path })
    }

    const desiredScreenshots = [
      ...existingScreenshots.filter((screenshot) => retainedSlotSet.has(screenshot.slot)),
      ...stagedScreenshots,
    ].sort((a, b) => a.slot - b.slot)
    const priorCleanup = existing ? getAggregateCleanup(existing.metadata) : []
    const newlyObsolete = existingScreenshots
      .filter((screenshot) => !retainedSlotSet.has(screenshot.slot))
      .map((screenshot) => screenshot.path ?? `slot:${screenshot.slot}`)
    const desiredPaths = new Set(
      desiredScreenshots.flatMap((screenshot) => screenshot.path ? [screenshot.path] : [])
    )
    const cleanupTargets = [...new Set([...priorCleanup, ...newlyObsolete])]
      .filter((target) => !desiredPaths.has(target))
    const baseMetadata = existing?.metadata ?? (
      teamSizeWarning ? { teamSizeWarning, teamMemberCount } : {}
    )
    const aggregateMetadata = buildAggregateScreenshotMetadata(
      baseMetadata,
      desiredScreenshots,
      cleanupTargets,
      payload.requestId
    )
    const saveInput = {
      title: payload.title,
      description: payload.description,
      githubUrl,
      liveAppUrl,
      demoVideoUrl,
      screenshotUrl: desiredScreenshots[0]?.url ?? null,
      metadata: aggregateMetadata,
      challengeIds: payload.challengeIds,
      ...(existing ? { expectedUpdatedAt: existing.updated_at } : {}),
    }
    let savedSubmission = null
    try {
      savedSubmission = existing
        ? await updateSubmission(existing.id, participant.participantId, participant.teamId, saveInput)
        : await createSubmission(
            hackathon.id,
            participant.participantId,
            participant.teamId,
            {
              submissionId,
              ...saveInput,
            }
          )
    } catch {
      savedSubmission = null
    }

    if (!savedSubmission) {
      const replayed = await getExistingSubmission(
        hackathon.id,
        participant.participantId,
        participant.teamId
      )
      if (replayed && getAggregateRequestId(replayed.metadata) === payload.requestId) {
        if (!(await syncSubmissionChallenges(replayed.id, payload.challengeIds ?? []))) {
          return submissionErrorResponse(
            "Your project was saved, but its challenges still need to sync. Try again.",
            "challenge_sync_failed",
            503,
          )
        }
        const replayedScreenshots = getAggregateScreenshots(replayed)
        const replayedPaths = new Set(
          replayedScreenshots.flatMap((screenshot) => screenshot.path ? [screenshot.path] : [])
        )
        await deleteSubmissionScreenshotTargets(
          submissionId,
          stagedScreenshots.flatMap((screenshot) =>
            screenshot.path && !replayedPaths.has(screenshot.path) ? [screenshot.path] : []
          )
        )
        const replayCleanup = getAggregateCleanup(replayed.metadata)
        const failedReplayCleanup = await deleteSubmissionScreenshotTargets(replayed.id, replayCleanup)
        return {
          success: true,
          submissionId: replayed.id,
          teamSizeWarning: null,
          screenshots: replayedScreenshots.map(({ slot, url }) => ({ slot, url })),
          cleanupPending: failedReplayCleanup.length > 0,
        }
      }
      await deleteSubmissionScreenshotTargets(
        submissionId,
        stagedScreenshots.flatMap((screenshot) =>
          screenshot.path && !getAggregateScreenshots(replayed ?? {})
            .some((current) => current.path === screenshot.path)
            ? [screenshot.path]
            : []
        )
      )
      if (replayed) {
        const currentScreenshots = getAggregateScreenshots(replayed)
        return submissionErrorResponse(
          "This project changed in another tab. Review the latest version and try again.",
          "stale_submission",
          409,
          { screenshots: currentScreenshots.map(({ slot, url }) => ({ slot, url })) },
        )
      }
      return submissionErrorResponse(
        existing ? "Failed to update submission" : "Failed to create submission",
        existing ? "update_failed" : "create_failed",
        500
      )
    }

    const failedCleanup = await deleteSubmissionScreenshotTargets(submissionId, cleanupTargets)

    const { triggerWebhooks } = await import("@/lib/services/webhooks")
    triggerWebhooks(
      hackathon.tenant_id,
      existing ? "submission.updated" : "submission.created",
      {
        event: existing ? "submission.updated" : "submission.created",
        timestamp: new Date().toISOString(),
        data: {
          hackathonId: hackathon.id,
          submissionId: savedSubmission.id,
          ...(existing ? {} : { title: payload.title }),
        },
      }
    ).catch(console.error)
    if (!existing) {
      notifySubmissionMembers({
        hackathonId: hackathon.id,
        submissionId: savedSubmission.id,
        participantId: participant.participantId,
        teamId: participant.teamId,
        projectTitle: payload.title,
      }).catch(console.error)
    }

    return {
      success: true,
      submissionId: savedSubmission.id,
      teamSizeWarning,
      screenshots: desiredScreenshots.map(({ slot, url }) => ({ slot, url })),
      cleanupPending: failedCleanup.length > 0,
    }
  }, {
    detail: {
      summary: "Complete submission",
      description: "Creates or updates a project and its screenshots in one request.",
    },
  })
  .post("/hackathons/:slug/submissions/screenshot", async ({ params, request, set }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    if (
      hackathon.status !== "active" ||
      !(await isSubmissionWindowOpen(hackathon.id, hackathon.ends_at))
    ) {
      return new Response(
        JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const participant = await getParticipantWithTeam(hackathon.id, userId)

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "You must register before uploading", code: "not_registered" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    if (participant.teamStatus === "pending_approval") {
      return pendingTeamApprovalResponse(set)
    }
    if (participant.teamStatus === "disbanded") {
      return submissionErrorResponse("Your team is no longer active", "team_not_active", 409)
    }

    const existing = await getExistingSubmission(
      hackathon.id,
      participant.participantId,
      participant.teamId
    )

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Create a submission first before uploading a screenshot", code: "no_submission" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { checkRateLimit } = await import("@/lib/services/rate-limit")
    const screenshotLimit = await checkRateLimit(
      `submission_screenshot:${hackathon.id}:${userId}`,
      { maxRequests: 30, windowMs: 60 * 60_000 },
      { failureMode: "closed" },
    )
    if (!screenshotLimit.allowed) throw new RateLimitError(screenshotLimit.resetAt, screenshotLimit.remaining)

    let formData: FormData
    try {
      formData = await readBoundedFormData(
        request,
        MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES + 256 * 1024,
      )
    } catch (error) {
      const tooLarge = error instanceof BoundedFormDataError && error.code === "request_too_large"
      return new Response(
        JSON.stringify({
          error: tooLarge ? "Request too large (max 4MB)" : "Invalid screenshot upload",
          code: tooLarge ? "request_too_large" : "invalid_form",
        }),
        { status: tooLarge ? 413 : 400, headers: { "Content-Type": "application/json" } },
      )
    }
    const file = formData.get("file") as File | null
    const rawSlot = formData.get("slot")
    const slot = typeof rawSlot === "string" ? Number(rawSlot) : 0

    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SUBMISSION_SCREENSHOTS) {
      return new Response(
        JSON.stringify({ error: "Invalid screenshot slot", code: "invalid_screenshot_slot" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided", code: "no_file" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: "Invalid file type. Use PNG, JPEG, or WebP", code: "invalid_file_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (file.size > MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES) {
      return new Response(
        JSON.stringify({ error: "File too large (max 4MB)", code: "file_too_large" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { uploadScreenshotVersion } = await import("@/lib/services/storage")
    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadAttemptId = crypto.randomUUID()
    const uploadResult = await uploadScreenshotVersion(
      existing.id,
      buffer,
      slot as SubmissionScreenshotSlot,
      uploadAttemptId,
    )

    if (!uploadResult) {
      return new Response(
        JSON.stringify({ error: "Failed to upload screenshot", code: "upload_failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const existingScreenshots = getAggregateScreenshots(existing)
    const replacedScreenshots = existingScreenshots.filter((screenshot) => screenshot.slot === slot)
    const screenshots: AggregateScreenshot[] = [
      ...existingScreenshots.filter((screenshot) => screenshot.slot !== slot),
      { slot: slot as SubmissionScreenshotSlot, url: uploadResult.url, path: uploadResult.path },
    ].sort((a, b) => a.slot - b.slot)
    const cleanupTargets = [...new Set([
      ...getAggregateCleanup(existing.metadata),
      ...replacedScreenshots.map((screenshot) => screenshot.path ?? `slot:${screenshot.slot}`),
    ])].filter((target) => target !== uploadResult.path)
    const metadata = buildAggregateScreenshotMetadata(
      existing.metadata,
      screenshots,
      cleanupTargets,
    )
    const updated = await updateSubmission(
      existing.id,
      participant.participantId,
      participant.teamId,
      {
        screenshotUrl: screenshots[0]?.url ?? null,
        metadata,
        expectedUpdatedAt: existing.updated_at,
      }
    )

    if (!updated) {
      await deleteSubmissionScreenshotTargets(existing.id, [uploadResult.path])
      return submissionErrorResponse(
        "This project changed in another tab. Refresh and try again.",
        "stale_submission",
        409,
      )
    }
    const failedCleanup = await deleteSubmissionScreenshotTargets(existing.id, cleanupTargets)

    return {
      success: true,
      screenshotUrl: uploadResult.url,
      screenshotUrls: getSubmissionScreenshotUrls(updated),
      cleanupPending: failedCleanup.length > 0,
    }
  }, {
    detail: {
      summary: "Upload submission screenshot",
      description: "Uploads a screenshot image for the user's submission. Accepts PNG, JPEG, or WebP (max 4MB).",
    },
  })
  .delete("/hackathons/:slug/submissions/screenshot", async ({ params, request, set }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    if (
      hackathon.status !== "active" ||
      !(await isSubmissionWindowOpen(hackathon.id, hackathon.ends_at))
    ) {
      return new Response(
        JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const participant = await getParticipantWithTeam(hackathon.id, userId)

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "Not registered", code: "not_registered" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    if (participant.teamStatus === "pending_approval") {
      return pendingTeamApprovalResponse(set)
    }
    if (participant.teamStatus === "disbanded") {
      return submissionErrorResponse("Your team is no longer active", "team_not_active", 409)
    }

    const existing = await getExistingSubmission(
      hackathon.id,
      participant.participantId,
      participant.teamId
    )

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "No submission found", code: "no_submission" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const slotParam = new URL(request.url).searchParams.get("slot")
    const slot = slotParam === null ? null : Number(slotParam)

    if (
      slot !== null &&
      (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SUBMISSION_SCREENSHOTS)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid screenshot slot", code: "invalid_screenshot_slot" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const existingScreenshots = getAggregateScreenshots(existing)
    const removedScreenshots = slot === null
      ? existingScreenshots
      : existingScreenshots.filter((screenshot) => screenshot.slot === slot)
    const screenshots = slot === null
      ? []
      : existingScreenshots.filter((screenshot) => screenshot.slot !== slot)
    const cleanupTargets = [...new Set([
      ...getAggregateCleanup(existing.metadata),
      ...removedScreenshots.map((screenshot) => screenshot.path ?? `slot:${screenshot.slot}`),
    ])]
    const metadata = buildAggregateScreenshotMetadata(
      existing.metadata,
      screenshots,
      cleanupTargets,
    )

    const updated = await updateSubmission(
      existing.id,
      participant.participantId,
      participant.teamId,
      {
        screenshotUrl: screenshots[0]?.url ?? null,
        metadata,
        expectedUpdatedAt: existing.updated_at,
      }
    )

    if (!updated) {
      return submissionErrorResponse(
        "This project changed in another tab. Refresh and try again.",
        "stale_submission",
        409,
      )
    }

    const failedCleanup = await deleteSubmissionScreenshotTargets(existing.id, cleanupTargets)
    return {
      success: true,
      screenshotUrls: getSubmissionScreenshotUrls(updated),
      cleanupPending: failedCleanup.length > 0,
    }
  }, {
    detail: {
      summary: "Delete submission screenshot",
      description: "Removes the screenshot from the user's submission.",
    },
  })
  .get("/hackathons", async ({ query }) => {
    const params = query as Record<string, string | undefined>
    const q = params.q
    const page = Math.max(1, parseInt(params.page || "1", 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(params.limit || "9", 10) || 9))

    const { hackathons, total } = await listPublicHackathons({
      search: q,
      page,
      limit,
    })

    return {
      hackathons: hackathons.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        bannerUrl: h.banner_url,
        status: h.status,
        phase: h.phase,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationOpensAt: h.registration_opens_at,
        registrationClosesAt: h.registration_closes_at,
        organizer: {
          id: h.organizer.id,
          name: h.organizer.name,
          slug: h.organizer.slug,
          logoUrl: h.organizer.logo_url,
        },
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }
  }, {
    detail: {
      summary: "List hackathons",
      description: "Lists public hackathons with pagination. Supports ?q= for search, ?page= and ?limit= for pagination (default 9 per page).",
    },
  })
  .get("/hackathons/:slug/registration", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { userId } = await auth()
    const [participantCount, registered] = await Promise.all([
      getParticipantCount(hackathon.id),
      userId ? isUserRegistered(hackathon.id, userId) : Promise.resolve(false),
    ])

    return {
      participantCount,
      isRegistered: userId ? registered : null,
    }
  }, {
    detail: {
      summary: "Get registration info",
      description: "Returns participant count and current user's registration status.",
    },
  })
  .get("/orgs/:slug", async ({ params }) => {
    const tenant = await getPublicTenantWithEvents(params.slug)

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logo_url,
      logoUrlDark: tenant.logo_url_dark,
      description: tenant.description,
      websiteUrl: tenant.website_url,
      organizedHackathons: tenant.organizedHackathons.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        bannerUrl: h.banner_url,
        status: h.status,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
      })),
      sponsoredHackathons: tenant.sponsoredHackathons.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        bannerUrl: h.banner_url,
        status: h.status,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        organizer: {
          id: h.organizer.id,
          name: h.organizer.name,
          slug: h.organizer.slug,
          logoUrl: h.organizer.logo_url,
        },
      })),
    }
  }, {
    detail: {
      summary: "Get organization profile",
      description: "Returns an organization's public profile with organized and sponsored hackathons.",
    },
  })
  .get("/invitations/:token", async ({ params }) => {
    const { getInvitationByToken } = await import("@/lib/services/team-invitations")
    const invitation = await getInvitationByToken(params.token)

    if (!invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const now = new Date()
    const isExpired = new Date(invitation.expires_at) < now

    const termsHash = await currentTermsHash({
      require_terms_acceptance: invitation.hackathon.require_terms_acceptance,
      terms_content: invitation.hackathon.terms_content,
    })

    return {
      id: invitation.id,
      status: isExpired && invitation.status === "pending" ? "expired" : invitation.status,
      teamName: invitation.team.name,
      hackathonName: invitation.hackathon.name,
      hackathonSlug: invitation.hackathon.slug,
      hackathonStatus: invitation.hackathon.status,
      email: invitation.email,
      expiresAt: invitation.expires_at,
      requireTermsAcceptance: Boolean(termsHash),
      termsContent: termsHash ? invitation.hackathon.terms_content : null,
      termsHash,
    }
  }, {
    detail: {
      summary: "Get team invitation",
      description: "Returns team invitation details by token.",
    },
  })
  .post("/invitations/:token/accept", async ({ params, body }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const { getVerifiedUserEmails } = await import("@/lib/auth/verified-emails")
    const userEmails = getVerifiedUserEmails(user)

    if (userEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No verified email address found", code: "no_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const {
      acceptTeamInvitation,
      cancelOtherPendingTeamInvitations,
      getInvitationByToken,
    } = await import("@/lib/services/team-invitations")
    const invitation = await getInvitationByToken(params.token)
    const invitationEmail = invitation?.email.trim().toLowerCase() ?? null
    const matchingEmail = invitationEmail && userEmails.includes(invitationEmail)
      ? invitationEmail
      : null

    if (invitation && !matchingEmail) {
      return new Response(
        JSON.stringify({ error: "Sign in with the email that received this invite.", code: "email_mismatch" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      )
    }

    const expectedTermsHash = invitation
      ? await currentTermsHash({
          require_terms_acceptance: invitation.hackathon.require_terms_acceptance,
          terms_content: invitation.hackathon.terms_content,
        })
      : null
    if (expectedTermsHash && (!body?.terms_hash || body.terms_hash !== expectedTermsHash)) {
      return new Response(
        JSON.stringify({ error: "You must accept the terms and conditions to join the team.", code: "terms_required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (invitation && expectedTermsHash) {
      const termsFailure = await persistRequiredTermsAcceptance(
        invitation.hackathon.id,
        userId,
        expectedTermsHash
      )
      if (termsFailure) return termsFailure
    }

    const result = await acceptTeamInvitation(params.token, userId, matchingEmail ?? userEmails[0])

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    if (invitation) {
      await cancelOtherPendingTeamInvitations(
        result.hackathonId,
        userEmails,
        invitation.id,
      )
      const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
      await cancelRemindersForEntity("team_invitation", invitation.id).catch((err) =>
        console.error(`Failed to cancel reminders for team_invitation ${invitation.id}:`, err)
      )
    }

    const { deliverAttendeeLifecycleEmailsForUser } = await import(
      "@/lib/services/attendee-lifecycle-notifications"
    )
    await deliverAttendeeLifecycleEmailsForUser(result.hackathonId, userId).catch((error) =>
      console.error("Failed to send attendee confirmation:", error)
    )

    const { getPublicHackathonById } = await import("@/lib/services/public-hackathons")
    const hackathon = await getPublicHackathonById(result.hackathonId)

    return {
      success: true,
      teamId: result.teamId,
      hackathonSlug: hackathon?.slug || null,
    }
  }, {
    detail: {
      summary: "Accept team invitation",
      description: "Accepts a team invitation and joins the team. Requires Clerk session.",
    },
    body: t.Optional(t.Object({
      terms_hash: t.Optional(t.String({ description: "SHA-256 of accepted terms content. Required when the hackathon has terms acceptance enabled." })),
    })),
  })
  .post("/invitations/:token/decline", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmails = getVerifiedUserEmails(user)

    if (userEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No email address found", code: "no_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { declineTeamInvitation } = await import("@/lib/services/team-invitations")
    const result = await declineTeamInvitation(params.token, userEmails)

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 403
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: result.success }
  }, {
    detail: {
      summary: "Decline team invitation",
      description: "Declines a team invitation. Requires Clerk session.",
    },
  })
  .post("/invitations/:token/unsubscribe", async ({ params }) => {
    const { unsubscribeTeamInvitation } = await import("@/lib/services/team-invitations")
    const result = await unsubscribeTeamInvitation(params.token)
    if (!result.success && result.code === "not_found") {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }
    return { success: true }
  }, {
    detail: {
      summary: "Unsubscribe from a team invitation (one-click)",
      description: "Marks a pending team invitation as declined and cancels its reminders. Auth-free because the token itself is the secret — used by RFC 8058 List-Unsubscribe-Post one-click flows from email clients.",
    },
  })
  .get("/prize-claims/:token", async ({ params }) => {
    const { getClaimByToken } = await import("@/lib/services/prize-fulfillment")
    const claim = await getClaimByToken(params.token)

    if (!claim) {
      return new Response(
        JSON.stringify({ error: "Prize claim not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    return claim
  }, {
    detail: {
      summary: "Get prize claim details",
      description: "Returns prize claim details by token. No authentication required.",
    },
  })
  .post("/prize-claims/:token/claim", async ({ params, body, request }) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.token)) {
      return new Response(
        JSON.stringify({ error: "Prize claim not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }
    const { checkRateLimit, RateLimitError } = await import("@/lib/services/rate-limit")
    const { getPublicRateLimitKey } = await import("@/lib/services/public-import-rate-limit")
    const rateLimitKey = getPublicRateLimitKey(request.headers, "prize_claim") ?? "prize_claim:local"
    const [rateLimit, globalLimit] = await Promise.all([
      checkRateLimit(rateLimitKey, { maxRequests: 10, windowMs: 60_000 }, { failureMode: "closed" }),
      checkRateLimit("prize_claim:global", { maxRequests: 1_000, windowMs: 60_000 }, { failureMode: "closed" }),
    ])
    if (!rateLimit.allowed || !globalLimit.allowed) {
      throw new RateLimitError(
        Math.max(rateLimit.resetAt, globalLimit.resetAt),
        Math.min(rateLimit.remaining, globalLimit.remaining),
      )
    }

    const { recipientName, recipientEmail, shippingAddress, paymentMethod, paymentDetail } = body as {
      recipientName: string
      recipientEmail: string
      shippingAddress?: string
      paymentMethod?: string
      paymentDetail?: string
    }

    if (!recipientName || !recipientEmail) {
      return new Response(
        JSON.stringify({ error: "Name and email are required", code: "validation" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { claimPrize } = await import("@/lib/services/prize-fulfillment")
    const result = await claimPrize(params.token, { recipientName, recipientEmail, shippingAddress, paymentMethod, paymentDetail })

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getSiblingClaims } = await import("@/lib/services/prize-fulfillment")
    const siblings = await getSiblingClaims(params.token)
    const publicSiblings = siblings.map(({ recipientName: _name, recipientEmail: _email, shippingAddress: _addr, ...rest }) => rest)

    return { success: true, siblings: publicSiblings }
  }, {
    body: t.Object({
      recipientName: t.String({ minLength: 1, description: "Full name of the prize recipient" }),
      recipientEmail: t.String({ format: "email", description: "Email address of the prize recipient" }),
      shippingAddress: t.Optional(t.String({ maxLength: 500, description: "Shipping address for physical prizes" })),
      paymentMethod: t.Optional(t.Union([t.Literal("venmo"), t.Literal("paypal"), t.Literal("bank_transfer"), t.Literal("other")], { description: "Payment method for cash prizes" })),
      paymentDetail: t.Optional(t.String({ maxLength: 500, description: "Payment handle or account details (e.g., @username, email)" })),
    }),
    detail: {
      summary: "Claim a prize",
      description: "Submits a prize claim with recipient details. No authentication required — the token is the authorization.",
    },
  })
  .get("/hackathons/:slug/judging/assignments", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgeAssignments, isJudgingOpenForHackathon } = await import("@/lib/services/judging")
    if (!(await isJudgingOpenForHackathon(hackathon))) {
      return new Response(
        JSON.stringify({ error: "Hackathon is not in judging phase", code: "not_judging" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const registration = await getRegistrationInfo(hackathon.id, userId)
    if (registration.participantRole !== "judge") {
      return new Response(
        JSON.stringify({ error: "Not a judge", code: "not_judge" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const assignments = await getJudgeAssignments(hackathon.id, userId)

    const anonymize = hackathon.anonymous_judging
    return {
      assignments: assignments.map((a) => ({
        id: a.id,
        submissionId: a.submissionId,
        submissionTitle: a.submissionTitle,
        submissionDescription: a.submissionDescription,
        submissionGithubUrl: a.submissionGithubUrl,
        submissionLiveAppUrl: a.submissionLiveAppUrl,
        submissionDemoVideoUrl: a.submissionDemoVideoUrl,
        submissionScreenshotUrl: a.submissionScreenshotUrl,
        teamName: anonymize ? null : a.teamName,
        teamMode: anonymize ? null : a.teamMode,
        isComplete: a.isComplete,
        notes: a.notes,
        prizeId: a.prizeId,
        prizeName: a.prizeName,
        judgingStyle: a.judgingStyle,
        maxPicks: a.maxPicks,
        selfJudging: anonymize ? false : a.selfJudging,
        assignmentKind: a.assignmentKind,
      })),
    }
  }, {
    detail: {
      summary: "List my judging assignments",
      description: "Returns the authenticated judge's assignments for a hackathon. Requires Clerk session.",
    },
  })

  .get("/hackathons/:slug/judging/my-summary", async ({ params }) => {
    const { userId } = await auth()
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgeSummary, isJudgingOpenForHackathon } = await import("@/lib/services/judging")
    if (!(await isJudgingOpenForHackathon(hackathon))) {
      return new Response(
        JSON.stringify({ error: "Hackathon is not in judging phase", code: "not_judging" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    }

    const { supabase: getSupabase } = await import("@/lib/db/client")
    const client = getSupabase()
    const { data: participant } = await client
      .from("hackathon_participants")
      .select("id")
      .eq("hackathon_id", hackathon.id)
      .eq("clerk_user_id", userId)
      .eq("role", "judge")
      .maybeSingle()

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "Not a judge on this hackathon", code: "not_judge" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const summary = await getJudgeSummary(hackathon.id, participant.id, {
      anonymousJudging: hackathon.anonymous_judging,
    })
    return summary
  }, {
    detail: {
      summary: "Get my judge summary",
      description:
        "Returns this judge's private top-3 rankings per weighted_score prize and core-only. Locked until all unified assignments are complete.",
    },
  })
  .patch(
    "/hackathons/:slug/judging/assignments/:assignmentId/notes",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      if (!isValidUuid(params.assignmentId)) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const { assertAssignmentWritable, saveNotes } = await import("@/lib/services/judging")
      const guard = await assertAssignmentWritable(params.assignmentId, userId, hackathon)
      if (!guard.ok) {
        return new Response(
          JSON.stringify({ error: guard.error, code: guard.code }),
          { status: guard.status, headers: { "Content-Type": "application/json" } }
        )
      }

      const success = await saveNotes(params.assignmentId, userId, (body as { notes: string }).notes)

      if (!success) {
        return new Response(
          JSON.stringify({ error: "Failed to save notes" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      return { success: true }
    },
    {
      detail: {
        summary: "Save judge notes",
        description: "Saves private notes only while this judge's assignment is writable.",
      },
      body: t.Object({
        notes: t.String({ maxLength: 2_000, description: "Private notes for this judging assignment" }),
      }),
    }
  )
  .get(
    "/hackathons/:slug/judging/assignments/:assignmentId",
    async ({ params }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      if (!isValidUuid(params.assignmentId)) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const {
        getAssignmentDetail,
        isJudgingOpenForHackathon,
        verifyAssignmentOwnership,
      } = await import("@/lib/services/judging")
      if (!(await isJudgingOpenForHackathon(hackathon))) {
        return new Response(
          JSON.stringify({ error: "Hackathon is not in judging phase", code: "not_judging" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const ownerCheck = await verifyAssignmentOwnership(params.assignmentId, userId)
      if (!ownerCheck) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (ownerCheck.hackathonId !== hackathon.id) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const detail = await getAssignmentDetail(params.assignmentId, ownerCheck)

      if (!detail) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (hackathon.anonymous_judging) {
        return { ...detail, teamName: null }
      }

      return detail
    },
    {
      detail: {
        summary: "Get assignment detail for scoring",
        description: "Returns full assignment details with criteria, rubric levels, and existing scores.",
      },
    }
  )
  .post(
    "/hackathons/:slug/judging/assignments/:assignmentId/scores",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      if (!isValidUuid(params.assignmentId)) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      await consumeJudgingWriteLimit(hackathon.id, userId)

      const { assertAssignmentWritable } = await import("@/lib/services/judging")
      const guard = await assertAssignmentWritable(params.assignmentId, userId, hackathon)
      if (!guard.ok) {
        return new Response(
          JSON.stringify({ error: guard.error, code: guard.code }),
          { status: guard.status, headers: { "Content-Type": "application/json" } }
        )
      }

      if (new Set(body.scores.map((score) => score.criteriaId)).size !== body.scores.length) return Response.json({error:"Score each category once.",code:"invalid_response"},{status:400})
      const failure = await publishReviewFromLegacyRoute(params.slug,userId,{assignmentId:params.assignmentId},{kind:"weighted_score",scores:Object.fromEntries(body.scores.map((score) => [score.criteriaId,score.score])),notes:body.notes})
      if (failure) return failure

      return { success: true }
    },
    {
      detail: {
        summary: "Save scores for assignment",
        description: "Saves new or revised rubric and criteria scores, then marks the judging assignment complete.",
      },
      body: t.Object({
        scores: t.Array(t.Object({
          criteriaId: t.String(),
          score: t.Number({ minimum: 0 }),
        })),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .get("/hackathons/:slug/judging/picks", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { isJudgingOpenForHackathon } = await import("@/lib/services/judging")
    if (!(await isJudgingOpenForHackathon(hackathon))) {
      return new Response(
        JSON.stringify({ error: "Hackathon is not in judging phase", code: "not_judging" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const regInfo = await getRegistrationInfo(hackathon.id, userId)
    if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
      return new Response(
        JSON.stringify({ error: "Not a judge" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgePicks } = await import("@/lib/services/judge-picks")
    const picks = await getJudgePicks(hackathon.id, regInfo.participantId)

    return {
      picks: picks.map((p) => ({
        id: p.id,
        prizeId: p.prize_id,
        submissionId: p.submission_id,
        rank: p.rank,
        reason: p.reason,
      })),
    }
  }, {
    detail: {
      summary: "Get judge's picks",
      description: "Returns all picks for the current judge in subjective judging mode.",
    },
  })
  .post(
    "/hackathons/:slug/judging/picks",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const { isJudgingOpenForHackathon } = await import("@/lib/services/judging")
      if (!(await isJudgingOpenForHackathon(hackathon))) {
        return new Response(
          JSON.stringify({ error: "Hackathon is not in judging phase", code: "not_judging" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const { getRegistrationInfo } = await import("@/lib/services/hackathons")
      const regInfo = await getRegistrationInfo(hackathon.id, userId)
      if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
        return new Response(
          JSON.stringify({ error: "Not a judge" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      await consumeJudgingWriteLimit(hackathon.id, userId)

      const typedBody = body as {
        prizeId: string
        submissionId?: string
        rankedSubmissionIds?: string[]
        rank?: number
        reason?: string
      }
      if (
        !isValidUuid(typedBody.prizeId) ||
        (typedBody.submissionId !== undefined && !isValidUuid(typedBody.submissionId)) ||
        typedBody.rankedSubmissionIds?.some((submissionId) => !isValidUuid(submissionId))
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid prize or project", code: "validation" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      if (typedBody.rankedSubmissionIds) {
        const failure = await publishReviewFromLegacyRoute(params.slug,userId,{prizeId:typedBody.prizeId},{kind:"judges_pick",rankedSubmissionIds:typedBody.rankedSubmissionIds,notes:typedBody.reason})
        if (failure) return failure

        return { success: true }
      }

      if (!typedBody.submissionId) {
        return new Response(
          JSON.stringify({ error: "Pick a project", code: "validation" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      if (typedBody.rank !== undefined && typedBody.rank !== 1) return Response.json({error:"Use the ranked picks form to add more than one project",code:"invalid_response"},{status:400})
      const failure = await publishReviewFromLegacyRoute(params.slug,userId,{prizeId:typedBody.prizeId},{kind:"judges_pick",rankedSubmissionIds:[typedBody.submissionId],notes:typedBody.reason})
      if (failure) return failure
      const {getJudgePicks} = await import("@/lib/services/judge-picks")
      const picks = await getJudgePicks(hackathon.id,regInfo.participantId)
      const pick = picks.find((item) => item.prize_id === typedBody.prizeId && item.submission_id === typedBody.submissionId)
      if (!pick) return Response.json({error:"Your pick was submitted, but couldn't be loaded. Refresh your review.",code:"unavailable"},{status:503})
      return {id:pick.id}
    },
    {
      detail: {
        summary: "Submit judge picks",
        description: "Saves one pick or a ranked list of picks for a prize assigned to the current judge.",
      },
      body: t.Object({
        prizeId: t.String(),
        submissionId: t.Optional(t.String()),
        rankedSubmissionIds: t.Optional(t.Array(t.String())),
        rank: t.Optional(t.Number({ minimum: 1 })),
        reason: t.Optional(t.String()),
      }),
    }
  )
  .delete("/hackathons/:slug/judging/picks/:prizeId/:submissionId", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!isValidUuid(params.prizeId) || !isValidUuid(params.submissionId)) {
      return new Response(
        JSON.stringify({ error: "Invalid prize or project", code: "validation" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const regInfo = await getRegistrationInfo(hackathon.id, userId)
    if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
      return new Response(
        JSON.stringify({ error: "Not a judge" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    await consumeJudgingWriteLimit(hackathon.id, userId)

    const { removePick } = await import("@/lib/services/judge-picks")
    const success = await removePick(hackathon.id, regInfo.participantId, params.prizeId, params.submissionId)

    if (!success) {
      return new Response(
        JSON.stringify({ error: "Pick not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    await recalculatePrizeWithLease(hackathon.id, params.prizeId).catch((err) => {
      console.error(`[judging] auto-recalculate failed for prize ${params.prizeId}:`, err)
    })

    return { success: true }
  }, {
    detail: {
      summary: "Remove a judge pick",
      description: "Removes a pick for a prize category in subjective judging mode.",
    },
  })
  .get("/hackathons/:slug/judging/track-assignments", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const regInfo = await getRegistrationInfo(hackathon.id, userId)
    if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
      return new Response(
        JSON.stringify({ error: "Not a judge" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgeTrackAssignments } = await import("@/lib/services/prize-tracks")
    const tracks = await getJudgeTrackAssignments(hackathon.id, regInfo.participantId)

    return { tracks }
  }, {
    detail: {
      summary: "Get judge track assignments",
      description: "Returns the authenticated judge's prize track assignments with progress.",
    },
  })
  .post(
    "/hackathons/:slug/judging/assignments/:assignmentId/bucket-sort",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      if (!isValidUuid(params.assignmentId)) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      await consumeJudgingWriteLimit(hackathon.id, userId)

      const { assertAssignmentWritable } = await import("@/lib/services/judging")
      const guard = await assertAssignmentWritable(params.assignmentId, userId, hackathon)
      if (!guard.ok) {
        return new Response(
          JSON.stringify({ error: guard.error, code: guard.code }),
          { status: guard.status, headers: { "Content-Type": "application/json" } }
        )
      }

      if (body.gates && new Set(body.gates.map((gate) => gate.criteriaId)).size !== body.gates.length) return Response.json({error:"Answer each check once.",code:"invalid_response"},{status:400})
      const failure = await publishReviewFromLegacyRoute(params.slug,userId,{assignmentId:params.assignmentId},{kind:"bucket_sort",bucketId:body.bucketId,notes:body.notes,...(body.gates?.length ? {gates:Object.fromEntries(body.gates.map((gate) => [gate.criteriaId,gate.passed]))} : {})})
      if (failure) return failure

      return { success: true }
    },
    {
      detail: {
        summary: "Save bucket sort response",
        description: "Saves a new or revised bucket sort evaluation for a judging assignment.",
      },
      body: t.Object({
        gates: t.Optional(t.Array(t.Object({
          criteriaId: t.String(),
          passed: t.Boolean(),
        }))),
        bucketId: t.String(),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/hackathons/:slug/judging/assignments/:assignmentId/gate-check",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      if (!isValidUuid(params.assignmentId)) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      await consumeJudgingWriteLimit(hackathon.id, userId)

      const { assertAssignmentWritable } = await import("@/lib/services/judging")
      const guard = await assertAssignmentWritable(params.assignmentId, userId, hackathon)
      if (!guard.ok) {
        return new Response(
          JSON.stringify({ error: guard.error, code: guard.code }),
          { status: guard.status, headers: { "Content-Type": "application/json" } }
        )
      }

      if (new Set(body.gates.map((gate) => gate.criteriaId)).size !== body.gates.length) return Response.json({error:"Answer each check once.",code:"invalid_response"},{status:400})
      const failure = await publishReviewFromLegacyRoute(params.slug,userId,{assignmentId:params.assignmentId},{kind:"gate_check",gates:Object.fromEntries(body.gates.map((gate) => [gate.criteriaId,gate.passed]))})
      if (failure) return failure

      return { success: true }
    },
    {
      detail: {
        summary: "Save gate check response",
        description: "Saves a new or revised gate check evaluation for a judging assignment.",
      },
      body: t.Object({
        gates: t.Array(t.Object({
          criteriaId: t.String(),
          passed: t.Boolean(),
        })),
      }),
    }
  )
  .get("/judge-invitations/:token", async ({ params }) => {
    const { getJudgeInvitationByToken } = await import("@/lib/services/judge-invitations")
    const invitation = await getJudgeInvitationByToken(params.token)

    if (!invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const now = new Date()
    const isExpired = new Date(invitation.expires_at) < now

    const termsHash = await currentTermsHash({
      require_terms_acceptance: invitation.hackathon.require_terms_acceptance,
      terms_content: invitation.hackathon.terms_content,
    })

    return {
      id: invitation.id,
      status: isExpired && invitation.status === "pending" ? "expired" : invitation.status,
      hackathonName: invitation.hackathon.name,
      hackathonSlug: invitation.hackathon.slug,
      organizerName: invitation.organizerName ?? null,
      personalMessage: invitation.personal_message?.trim() || null,
      instructions: invitation.hackathon.judging_instructions ?? null,
      email: invitation.email,
      expiresAt: invitation.expires_at,
      requireTermsAcceptance: Boolean(termsHash),
      termsContent: termsHash ? invitation.hackathon.terms_content : null,
      termsHash,
    }
  }, {
    detail: {
      summary: "Get judge invitation",
      description: "Returns judge invitation details by token.",
    },
  })
  .post("/judge-invitations/:token/accept", async ({ params, body }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmails = getVerifiedUserEmails(user)

    if (userEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No email address found", code: "no_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { acceptJudgeInvitation, getJudgeInvitationByToken } = await import("@/lib/services/judge-invitations")
    const judgeInvitation = await getJudgeInvitationByToken(params.token)

    if (!judgeInvitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }

    const invitedEmail = judgeInvitation.email.trim().toLowerCase()
    if (!userEmails.includes(invitedEmail)) {
      return new Response(
        JSON.stringify({
          error: "Sign in with the email that received this invite.",
          code: "email_mismatch",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      )
    }

    if (judgeInvitation.status !== "pending") {
      return new Response(
        JSON.stringify({
          error: `Invitation is ${judgeInvitation.status}`,
          code: "not_pending",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    if (new Date(judgeInvitation.expires_at).getTime() <= Date.now()) {
      return new Response(
        JSON.stringify({ error: "Invitation has expired", code: "expired" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const expectedTermsHash = await currentTermsHash({
      require_terms_acceptance: judgeInvitation.hackathon.require_terms_acceptance,
      terms_content: judgeInvitation.hackathon.terms_content,
    })
    if (expectedTermsHash && (!body?.terms_hash || body.terms_hash !== expectedTermsHash)) {
      return new Response(
        JSON.stringify({ error: "You must accept the terms and conditions to judge this event.", code: "terms_required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (expectedTermsHash) {
      const termsFailure = await persistRequiredTermsAcceptance(
        judgeInvitation.hackathon.id,
        userId,
        expectedTermsHash
      )
      if (termsFailure) return termsFailure
    }

    const result = await acceptJudgeInvitation(params.token, userId, userEmails)

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
    cancelRemindersForEntity("judge_invitation", judgeInvitation.id).catch((err) =>
      console.error(`Failed to cancel reminders for judge_invitation ${judgeInvitation.id}:`, err)
    )

    return {
      success: true,
      hackathonSlug: result.hackathonSlug,
    }
  }, {
    detail: {
      summary: "Accept judge invitation",
      description: "Accepts a judge invitation and adds user as judge. Requires Clerk session.",
    },
    body: t.Optional(t.Object({
      terms_hash: t.Optional(t.String({ description: "SHA-256 of accepted terms content. Required when the hackathon has terms acceptance enabled." })),
    })),
  })
  .post("/judge-invitations/:token/decline", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgeInvitationByToken, declineJudgeInvitation } = await import("@/lib/services/judge-invitations")

    const invitation = await getJudgeInvitationByToken(params.token)
    if (!invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const verifiedEmails = getVerifiedUserEmails(user)
    if (!verifiedEmails.includes(invitation.email.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: "This invitation was sent to a different email", code: "email_mismatch" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const result = await declineJudgeInvitation(invitation.id, invitation.hackathon_id)
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true }
  }, {
    detail: {
      summary: "Decline judge invitation",
      description: "Declines a judge invitation. Requires Clerk session.",
    },
  })
  .get("/hackathons/:slug/results", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getPublicResults } = await import("@/lib/services/results")
    const results = await getPublicResults(hackathon.id)

    if (!results) {
      return new Response(
        JSON.stringify({ error: "Results not yet published" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    return {
      results: results.map((r) => ({
        rank: r.rank,
        submissionTitle: r.submissionTitle,
        teamName: publicTeamName(hackathon, r.teamName),
        weightedScore: r.weighted_score,
        judgeCount: r.judge_count,
        prizes: r.prizes,
      })),
    }
  }, {
    detail: {
      summary: "Get public results",
      description: "Returns published results and rankings for a hackathon.",
    },
  })
  .get("/hackathons/:slug/judges", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { listJudgeDisplayProfiles } = await import("@/lib/services/judge-display")
    const judges = await listJudgeDisplayProfiles(hackathon.id)

    return {
      judges: judges.map((j) => ({
        id: j.id,
        name: j.name,
        title: j.title,
        organization: j.organization,
        headshotUrl: j.headshot_url,
      })),
    }
  }, {
    detail: {
      summary: "List judges",
      description: "Returns public judge display profiles for a hackathon.",
    },
  })
  .get("/hackathons/:slug/prizes", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { listPrizes } = await import("@/lib/services/prizes")
    const { listPrizeAssignments } = await import("@/lib/services/prizes")
    const [prizes, assignments] = await Promise.all([
      listPrizes(hackathon.id, { includeScreening: false }),
      hackathon.results_published_at
        ? listPrizeAssignments(hackathon.id)
        : Promise.resolve([]),
    ])

    return {
      prizes: prizes.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        value: p.value,
        type: p.type,
        rank: p.rank,
        winner: assignments.find((a) => a.prize_id === p.id)
          ? {
              submissionTitle: assignments.find((a) => a.prize_id === p.id)!.submissionTitle,
              teamName: publicTeamName(
                hackathon,
                assignments.find((a) => a.prize_id === p.id)!.teamName,
              ),
            }
          : null,
      })),
    }
  }, {
    detail: {
      summary: "List prizes",
      description: "Returns prizes and adds winner info after results are published.",
    },
  })
  .post("/hackathons/:slug/vote", async ({ params, body }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!isValidUuid(body.prizeId) || !isValidUuid(body.submissionId)) {
      return new Response(
        JSON.stringify({ error: "Project or prize not found" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { checkRateLimit } = await import("@/lib/services/rate-limit")
    const voteLimit = await checkRateLimit(
      `crowd_vote:${hackathon.id}:${userId}`,
      { maxRequests: 30, windowMs: 60_000 },
      { failureMode: "closed" },
    )
    if (!voteLimit.allowed) throw new RateLimitError(voteLimit.resetAt, voteLimit.remaining)

    const { supabase: getSupabase } = await import("@/lib/db/client")
    const { data: submission } = await getSupabase()
      .from("submissions")
      .select("id, status")
      .eq("id", body.submissionId)
      .eq("hackathon_id", hackathon.id)
      .maybeSingle()
    if (!submission || submission.status !== "submitted") {
      return new Response(
        JSON.stringify({ error: "Project not found" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const { castVote } = await import("@/lib/services/crowd-voting")
    const result = await castVote(hackathon.id, body.prizeId, body.submissionId, userId)

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: result.code === "voting_closed" ? 409 : 400, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true }
  }, {
    detail: {
      summary: "Cast vote",
      description: "Casts a vote for a project and crowd prize. One vote per account for each prize.",
    },
    body: t.Object({
      submissionId: t.String({ minLength: 36, maxLength: 36, description: "The submission ID to vote for" }),
      prizeId: t.String({ minLength: 36, maxLength: 36, description: "The crowd prize ID" }),
    }),
  })
  .delete("/hackathons/:slug/vote", async ({ params, query }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!isValidUuid(query.prizeId)) {
      return new Response(
        JSON.stringify({ error: "Prize not found" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { checkRateLimit } = await import("@/lib/services/rate-limit")
    const voteLimit = await checkRateLimit(
      `crowd_vote:${hackathon.id}:${userId}`,
      { maxRequests: 30, windowMs: 60_000 },
      { failureMode: "closed" },
    )
    if (!voteLimit.allowed) throw new RateLimitError(voteLimit.resetAt, voteLimit.remaining)

    const { removeVote } = await import("@/lib/services/crowd-voting")
    const result = await removeVote(hackathon.id, query.prizeId, userId)

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: result.code === "voting_closed" ? 409 : 400, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true }
  }, {
    detail: {
      summary: "Remove vote",
      description: "Removes the user's vote for one crowd prize.",
    },
    query: t.Object({ prizeId: t.String({ minLength: 36, maxLength: 36, description: "The crowd prize ID" }) }),
  })
  .get("/cli-auth/poll", async ({ query, request }) => {
    const { isValidCliDeviceToken } = await import("@/lib/services/cli-auth")
    if (!isValidCliDeviceToken(query.token)) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { consumePublicCliAuthRateLimit } = await import(
      "@/lib/services/public-import-rate-limit"
    )
    const rateLimit = await consumePublicCliAuthRateLimit(request.headers)
    if (rateLimit && !rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const { createCliAuthSession, pollCliAuthSession } = await import("@/lib/services/cli-auth")

    let result = await pollCliAuthSession(query.token)

    if (result.status === "expired") {
      try {
        await createCliAuthSession(query.token)
        result = { status: "pending" }
      } catch {
        return { status: "pending" }
      }
    }

    return result
  }, {
    detail: {
      summary: "Poll CLI auth session",
      description: "Polls for CLI authentication completion. Creates session on first call. Returns status and API key when complete.",
    },
    query: t.Object({
      token: t.String({ minLength: 1, description: "The device token from the CLI" }),
    }),
  })
  .get("/hackathons/:slug/vote", async ({ params, query, request }) => {
    const { userId } = await auth()

    if (!isValidUuid(query.prizeId)) {
      return new Response(JSON.stringify({ error: "Invalid prize ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }
    if (hackathon.status !== "active" && hackathon.status !== "judging" && !hackathon.results_published_at) {
      return new Response(
        JSON.stringify({ error: "Voting is closed. Results are not public yet." }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      )
    }

    const { getPublicRateLimitKey } = await import("@/lib/services/public-import-rate-limit")
    const viewerKey = userId
      ?? getPublicRateLimitKey(request.headers, "crowd_vote_read")
      ?? "anonymous"
    const { checkRateLimit } = await import("@/lib/services/rate-limit")
    const [readLimit, globalReadLimit] = await Promise.all([
      checkRateLimit(
        `crowd_vote_read:${hackathon.id}:${viewerKey}`,
        { maxRequests: 120, windowMs: 60_000 },
        { failureMode: "closed" },
      ),
      checkRateLimit(
        `crowd_vote_read:${hackathon.id}:global`,
        { maxRequests: 12_000, windowMs: 60_000 },
        { failureMode: "closed" },
      ),
    ])
    if (!readLimit.allowed || !globalReadLimit.allowed) {
      throw new RateLimitError(
        Math.max(readLimit.resetAt, globalReadLimit.resetAt),
        Math.min(readLimit.remaining, globalReadLimit.remaining),
      )
    }

    const { getVoteCounts, getUserVote } = await import("@/lib/services/crowd-voting")
    const [counts, userVote] = await Promise.all([
      getVoteCounts(hackathon.id, query.prizeId),
      userId ? getUserVote(hackathon.id, query.prizeId, userId) : Promise.resolve(null),
    ])

    return {
      userVote,
      counts,
    }
  }, {
    detail: {
      summary: "Get vote info",
      description: "Returns vote counts and the user's vote for one crowd prize.",
    },
    query: t.Object({ prizeId: t.String({ description: "The crowd prize ID" }) }),
  })
