import { Elysia, t } from "elysia"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { buildPollPayload } from "@/lib/services/polling"
import { listCategories } from "@/lib/services/categories"
import { listPublishedAnnouncements } from "@/lib/services/announcements"
import { listScheduleItems } from "@/lib/services/schedule-items"
import { submitSocialUrl } from "@/lib/services/social-submissions"
import { createMentorRequest, listMentorQueue, claimRequest, resolveRequest } from "@/lib/services/mentor-requests"
import { getWinnerPageData } from "@/lib/services/winner-pages"
import { resolvePrincipal } from "@/lib/auth/principal"
import { pendingTeamApprovalResponse } from "@/lib/api/responses"

async function resolveHackathonBySlug(slug: string, set: { status?: number | string }) {
  const hackathon = await getPublicHackathon(slug)
  if (!hackathon) {
    set.status = 404
    return { error: "Hackathon not found" as const, hackathon: null }
  }
  return { error: null, hackathon }
}

export const publicEventRoutes = new Elysia({ prefix: "/public" })
  .get("/hackathons/:slug/poll", async ({ params, set }) => {
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

    const { url } = body as { url: string }
    const submission = await submitSocialUrl(hackathon!.id, participant.participantId, participant.teamId, url)
    if (!submission) { set.status = 400; return { error: "Failed to submit" } }
    return submission
  }, {
    body: t.Object({ url: t.String() }),
    detail: { summary: "Submit social media post" },
  })
  // --- Mentor Requests ---
  .post("/hackathons/:slug/mentor-request", async ({ params, body, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") { set.status = 401; return { error: "Authentication required" } }

    const { getParticipantWithTeam } = await import("@/lib/services/submissions")
    const participant = await getParticipantWithTeam(hackathon!.id, principal.userId)
    if (!participant) { set.status = 403; return { error: "Not a participant" } }

    const { category, description } = body as { category?: string; description?: string }
    const req = await createMentorRequest(hackathon!.id, participant.participantId, participant.teamId, { category, description })
    if (!req) { set.status = 400; return { error: "Failed to create request" } }
    return req
  }, {
    body: t.Object({ category: t.Optional(t.String()), description: t.Optional(t.String()) }),
    detail: { summary: "Create mentor help request" },
  })
  .get("/hackathons/:slug/mentor-queue", async ({ params, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }
    return { requests: await listMentorQueue(hackathon!.id) }
  }, { detail: { summary: "Get mentor queue" } })
  .post("/hackathons/:slug/mentor-request/:requestId/claim", async ({ params, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") { set.status = 401; return { error: "Authentication required" } }

    const { getParticipantWithTeam } = await import("@/lib/services/submissions")
    const participant = await getParticipantWithTeam(hackathon!.id, principal.userId)
    if (!participant) { set.status = 403; return { error: "Not a mentor" } }

    const ok = await claimRequest(params.requestId, participant.participantId)
    if (!ok) { set.status = 400; return { error: "Failed to claim request" } }
    return { success: true }
  }, { detail: { summary: "Claim mentor request" } })
  .post("/hackathons/:slug/mentor-request/:requestId/resolve", async ({ params, request, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }

    const principal = await resolvePrincipal(request)
    if (principal.kind !== "user" && principal.kind !== "admin") { set.status = 401; return { error: "Authentication required" } }

    const { getParticipantWithTeam } = await import("@/lib/services/submissions")
    const participant = await getParticipantWithTeam(hackathon!.id, principal.userId)
    if (!participant) { set.status = 403; return { error: "Not a mentor" } }

    const ok = await resolveRequest(params.requestId, participant.participantId)
    if (!ok) { set.status = 400; return { error: "Failed to resolve request" } }
    return { success: true }
  }, { detail: { summary: "Resolve mentor request" } })
  .get("/hackathons/:slug/announcements", async ({ params, set }) => {
    const { error, hackathon } = await resolveHackathonBySlug(params.slug, set)
    if (error) return { error }
    return { announcements: await listPublishedAnnouncements(hackathon!.id) }
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
    const winners = await getWinnerPageData(hackathon!.id)
    set.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=60"
    return { winners }
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

    const { listPerks, isPerkReleased } = await import("@/lib/services/perks")
    const allPerks = await listPerks(hackathon!.id)
    const startsAt = (hackathon as { starts_at?: string | null }).starts_at ?? null
    const now = new Date()
    const released = allPerks.filter((p) => isPerkReleased(p, startsAt, now))

    return { perks: released }
  }, { detail: { summary: "List released perks (team members only)" } })
