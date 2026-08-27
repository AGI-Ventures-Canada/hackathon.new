import { Elysia, t } from "elysia"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { buildPollPayload } from "@/lib/services/polling"
import { listCategories } from "@/lib/services/categories"
import {
  filterAnnouncementsForViewer,
  listPublishedAnnouncements,
  type AnnouncementViewer,
} from "@/lib/services/announcements"
import { listScheduleItems } from "@/lib/services/schedule-items"
import { submitSocialUrl } from "@/lib/services/social-submissions"
import {
  MENTOR_REQUEST_CATEGORY_MAX_LENGTH,
  MENTOR_REQUEST_DESCRIPTION_MAX_LENGTH,
  claimRequest,
  createMentorRequest,
  getActiveMentorRequest,
  getMentorParticipantId,
  getQueueStats,
  listMentorQueue,
  resolveRequest,
} from "@/lib/services/mentor-requests"
import { getWinnerPageData } from "@/lib/services/winner-pages"
import { resolvePrincipal } from "@/lib/auth/principal"
import { pendingTeamApprovalResponse } from "@/lib/api/responses"
import { isValidUuid } from "@/lib/utils/uuid"
import { publicTeamName } from "@/lib/utils/anonymous-judging"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"
import { consumePublicPollRateLimit } from "@/lib/services/public-import-rate-limit"

async function resolveHackathonBySlug(slug: string, set: { status?: number | string }) {
  const hackathon = await getPublicHackathon(slug)
  if (!hackathon) {
    set.status = 404
    return { error: "Hackathon not found" as const, hackathon: null }
  }
  return { error: null, hackathon }
}

export const publicEventRoutes = new Elysia({ prefix: "/public" })
  .get("/hackathons/:slug/poll", async ({ params, request, set }) => {
    const pollLimit = await consumePublicPollRateLimit(request.headers)
    if (pollLimit && !pollLimit.allowed) {
      throw new RateLimitError(pollLimit.resetAt, pollLimit.remaining)
    }
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const payload = await buildPollPayload(hackathon!.id)
    if (!payload) { set.status = 500; return { error: "Failed to build poll payload" } }

    set.headers["Cache-Control"] = "public, max-age=2, stale-while-revalidate=5"
    return payload
  }, { detail: { summary: "Poll hackathon state" } })
  // --- Categories ---
  .get("/hackathons/:slug/categories", async ({ params, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }
    return { categories: await listCategories(hackathon!.id) }
  }, { detail: { summary: "List submission categories" } })
  // --- Social ---
  .post("/hackathons/:slug/social-submit", async ({ params, body, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") { set.status = 401; return { error: "Authentication required" } }

    const { getParticipantWithTeam } = await import("@/lib/services/submissions")
    const participant = await getParticipantWithTeam(hackathon!.id, principal.userId)
    if (!participant) { set.status = 403; return { error: "Not a participant" } }
    if (participant.teamStatus === "pending_approval") {
      return pendingTeamApprovalResponse(set)
    }
    if (participant.teamStatus === "disbanded") {
      set.status = 403
      return { error: "You must be on an active team to submit a social post" }
    }

    const socialLimit = await checkRateLimit(
      `social_submit:${hackathon!.id}:${principal.userId}`,
      { maxRequests: 10, windowMs: 60 * 60_000 },
      { failureMode: "closed" },
    )
    if (!socialLimit.allowed) throw new RateLimitError(socialLimit.resetAt, socialLimit.remaining)

    const { url } = body as { url: string }
    const submission = await submitSocialUrl(hackathon!.id, participant.participantId, participant.teamId, url)
    if (!submission) { set.status = 400; return { error: "Failed to submit" } }
    return submission
  }, {
    body: t.Object({ url: t.String({ minLength: 1, maxLength: 2_048 }) }),
    detail: { summary: "Submit social media post" },
  })
  // --- Mentor Requests ---
  .post("/hackathons/:slug/mentor-request", async ({ params, body, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") { set.status = 401; return { error: "Authentication required" } }

    if (hackathon!.status !== "active") {
      set.status = 409
      return { error: "Mentor help is only open while the event is active", code: "event_not_active" }
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const registration = await getRegistrationInfo(hackathon!.id, principal.userId)
    if (registration.participantRole !== "participant") {
      set.status = 403
      return { error: "Only attendees can ask a mentor", code: "not_attendee" }
    }

    const { getParticipantWithTeam } = await import("@/lib/services/submissions")
    const participant = await getParticipantWithTeam(hackathon!.id, principal.userId)
    if (!participant) { set.status = 403; return { error: "Not a participant" } }
    if (participant.teamStatus === "pending_approval") {
      return pendingTeamApprovalResponse(set)
    }
    if (participant.teamStatus === "disbanded") {
      set.status = 409
      return { error: "Your team is no longer active", code: "team_not_active" }
    }

    const { category, description } = body as { category?: string; description?: string }
    const result = await createMentorRequest(
      hackathon!.id,
      participant.participantId,
      participant.teamId,
      { category, description },
    )
    if (!result.success) {
      set.status = result.code === "rate_limited" ? 429 : result.code === "already_open" ? 409 : result.code === "db_error" ? 500 : 400
      return { error: result.error, code: result.code }
    }
    return {
      request: {
        category: result.request.category,
        description: result.request.description,
        status: result.request.status,
        createdAt: result.request.created_at,
      },
    }
  }, {
    body: t.Object({
      category: t.Optional(t.String({ maxLength: MENTOR_REQUEST_CATEGORY_MAX_LENGTH, description: "Short topic for the mentor request" })),
      description: t.Optional(t.String({ maxLength: MENTOR_REQUEST_DESCRIPTION_MAX_LENGTH, description: "What the attendee needs help with" })),
    }),
    detail: {
      summary: "Create mentor help request",
      description: "Adds one active-event help request for an authenticated attendee. The attendee or their team can have only one unresolved request.",
    },
  })
  .get("/hackathons/:slug/mentor-request/me", async ({ params, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    set.headers["Cache-Control"] = "private, no-store"
    set.headers.Vary = "Cookie, Authorization"
    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") {
      set.status = 401
      return { error: "Authentication required", code: "not_authenticated" }
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const registration = await getRegistrationInfo(hackathon!.id, principal.userId)
    if (registration.participantRole !== "participant") {
      set.status = 403
      return { error: "Only attendees can view their mentor request", code: "not_attendee" }
    }

    const { getParticipantWithTeam } = await import("@/lib/services/submissions")
    const participant = await getParticipantWithTeam(hackathon!.id, principal.userId)
    if (!participant) {
      set.status = 403
      return { error: "Attendee not found", code: "not_attendee" }
    }

    const activeRequest = await getActiveMentorRequest(
      hackathon!.id,
      participant.participantId,
      participant.teamId,
    )
    return {
      request: activeRequest
        ? {
            category: activeRequest.category,
            description: activeRequest.description,
            status: activeRequest.status,
            createdAt: activeRequest.created_at,
          }
        : null,
    }
  }, {
    detail: {
      summary: "Get my mentor request",
      description: "Returns the authenticated attendee's unresolved mentor request without exposing participant or team IDs.",
    },
  })
  .get("/hackathons/:slug/mentor-queue", async ({ params, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    set.headers["Cache-Control"] = "private, no-store"
    set.headers.Vary = "Cookie, Authorization"
    const stats = await getQueueStats(hackathon!.id)
    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") {
      return { viewer: "public", stats, requests: [] }
    }

    const mentorParticipantId = await getMentorParticipantId(hackathon!.id, principal.userId)
    if (!mentorParticipantId) {
      return { viewer: "public", stats, requests: [] }
    }

    const requests = await listMentorQueue(hackathon!.id)
    return {
      viewer: "mentor",
      stats,
      requests: requests.slice(0, 50).map((mentorRequest) => ({
        id: mentorRequest.id,
        teamName: mentorRequest.team_name,
        category: mentorRequest.category,
        description: mentorRequest.description,
        status: mentorRequest.status,
        createdAt: mentorRequest.created_at,
        claimedByMe: mentorRequest.claimed_by_participant_id === mentorParticipantId,
      })),
    }
  }, {
    detail: {
      summary: "Get mentor queue",
      description: "Returns aggregate counts publicly. Request text is returned only to an authenticated mentor on this event.",
    },
  })
  .post("/hackathons/:slug/mentor-request/:requestId/claim", async ({ params, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") { set.status = 401; return { error: "Authentication required" } }

    if (hackathon!.status !== "active") {
      set.status = 409
      return { error: "Mentor help is not open now", code: "event_not_active" }
    }
    if (!isValidUuid(params.requestId)) {
      set.status = 404
      return { error: "Request not found", code: "not_found" }
    }

    const mentorParticipantId = await getMentorParticipantId(hackathon!.id, principal.userId)
    if (!mentorParticipantId) { set.status = 403; return { error: "Not a mentor" } }

    const result = await claimRequest(params.requestId, mentorParticipantId, hackathon!.id)
    if (!result.success) {
      set.status = result.code === "already_claimed" ? 409 : result.code === "db_error" ? 500 : 404
      return { error: result.error, code: result.code }
    }
    return { success: true }
  }, {
    detail: {
      summary: "Claim mentor request",
      description: "Claims an open request for the authenticated event mentor. A claim race returns a stable 409 code.",
    },
  })
  .post("/hackathons/:slug/mentor-request/:requestId/resolve", async ({ params, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") { set.status = 401; return { error: "Authentication required" } }

    if (hackathon!.status !== "active") {
      set.status = 409
      return { error: "Mentor help is not open now", code: "event_not_active" }
    }
    if (!isValidUuid(params.requestId)) {
      set.status = 404
      return { error: "Request not found", code: "not_found" }
    }

    const mentorParticipantId = await getMentorParticipantId(hackathon!.id, principal.userId)
    if (!mentorParticipantId) { set.status = 403; return { error: "Not a mentor" } }

    const result = await resolveRequest(params.requestId, mentorParticipantId, hackathon!.id)
    if (!result.success) {
      set.status = result.code === "not_claimed_by_you" ? 409 : result.code === "db_error" ? 500 : 404
      return { error: result.error, code: result.code }
    }
    return { success: true }
  }, {
    detail: {
      summary: "Resolve mentor request",
      description: "Finishes a claimed request only for the authenticated mentor who claimed it.",
    },
  })
  .get("/hackathons/:slug/announcements", async ({ params, request, set }) => {
    set.headers["Cache-Control"] = "private, no-store"
    set.headers["Vary"] = "Cookie, Authorization"
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const [announcements, principal] = await Promise.all([
      listPublishedAnnouncements(hackathon!.id),
      resolvePrincipal(request),
    ])
    let viewer: AnnouncementViewer = { role: "public" }

    if (principal.kind === "api_key") {
      if (
        principal.tenantId === hackathon!.organizer.id &&
        principal.scopes.includes("hackathons:read")
      ) viewer = { role: "organizer" }
    } else if (principal.kind === "user" || principal.kind === "admin") {
      const isOrganizer =
        principal.tenantId === hackathon!.organizer.id ||
        (principal.orgId !== null &&
          principal.orgId === hackathon!.organizer.clerk_org_id) ||
        principal.userId === hackathon!.organizer.clerk_user_id

      if (isOrganizer) {
        viewer = { role: "organizer" }
      } else {
        const { getRegistrationInfo } = await import("@/lib/services/hackathons")
        const registration = await getRegistrationInfo(hackathon!.id, principal.userId)
        if (
          registration.participantRole === "judge" ||
          registration.participantRole === "mentor"
        ) {
          viewer = { role: registration.participantRole }
        } else if (registration.participantRole === "participant") {
          const needsSubmissionState = announcements.some(
            (announcement) =>
              announcement.audience === "submitted" ||
              announcement.audience === "not_submitted",
          )
          const submission = needsSubmissionState
            ? await import("@/lib/services/submissions").then((module) =>
                module.getSubmissionForParticipant(hackathon!.id, principal.userId),
              )
            : null
          viewer = {
            role: "participant",
            ...(needsSubmissionState
              ? { hasSubmitted: submission?.status === "submitted" }
              : {}),
          }
        }
      }
    }

    return {
      announcements: filterAnnouncementsForViewer(announcements, viewer).map(
        (announcement) => ({
          title: announcement.title,
          body: announcement.body,
          priority: announcement.priority,
          publishedAt: announcement.published_at,
        }),
      ),
    }
  }, { detail: { summary: "List published announcements" } })
  .get("/hackathons/:slug/schedule", async ({ params, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }
    return { scheduleItems: await listScheduleItems(hackathon!.id) }
  }, { detail: { summary: "List schedule items" } })
  // --- Winners ---
  .get("/hackathons/:slug/winners", async ({ params, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }
    if (!hackathon!.results_published_at) {
      set.status = 404
      return { error: "Results not yet published" }
    }
    const winners = await getWinnerPageData(hackathon!.id)
    set.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=60"
    return {
      winners: winners.map((winner) => ({
        ...winner,
        teamName: publicTeamName(hackathon!, winner.teamName),
      })),
    }
  }, { detail: { summary: "Get winners" } })
  // --- Perks (released, team-members only) ---
  .get("/hackathons/:slug/perks", async ({ params, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") {
      set.status = 401
      return { error: "Authentication required" }
    }

    const { getParticipantWithTeam } = await import("@/lib/services/submissions")
    const participant = await getParticipantWithTeam(hackathon!.id, principal.userId)
    if (!participant || !participant.teamId) {
      set.status = 403
      return { error: "You must be on a team to view perks" }
    }
    if (participant.teamStatus === "pending_approval") {
      return pendingTeamApprovalResponse(set)
    }
    if (participant.teamStatus === "disbanded") {
      set.status = 403
      return { error: "You must be on an active team to view perks" }
    }

    const { listPerks, isPerkReleased } = await import("@/lib/services/perks")
    const allPerks = await listPerks(hackathon!.id)
    const startsAt = (hackathon as { starts_at?: string | null }).starts_at ?? null
    const now = new Date()
    const released = allPerks.filter((p) => isPerkReleased(p, startsAt, now))

    return { perks: released }
  }, { detail: { summary: "List released perks (team members only)" } })
