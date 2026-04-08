import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"
import { logAudit } from "@/lib/services/audit"
import { isValidUuid } from "@/lib/utils/uuid"
import { setPhase } from "@/lib/services/phases"
import { listRooms, createRoom, updateRoom, deleteRoom, addTeamToRoom, removeTeamFromRoom, togglePresented, setRoomTimer, clearRoomTimer, pauseRoomTimer, resumeRoomTimer } from "@/lib/services/rooms"
import { listCategories, createCategory, updateCategory, deleteCategory } from "@/lib/services/categories"
import { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, publishAnnouncement, unpublishAnnouncement, scheduleAnnouncement, type CreateAnnouncementInput, type UpdateAnnouncementInput } from "@/lib/services/announcements"
import { listScheduleItems, createScheduleItem, updateScheduleItem, deleteScheduleItem } from "@/lib/services/schedule-items"
import { listTeamsWithMembers, createTeamWithMembers, modifyTeamMembers, bulkAssignTeams } from "@/lib/services/hackathons"
import { listRounds, createRound, updateRound, deleteRound, activateRound } from "@/lib/services/judging-rounds"
import { listSocialSubmissions, reviewSocialSubmission } from "@/lib/services/social-submissions"
import { listMentorQueue } from "@/lib/services/mentor-requests"
import { getChallenge, saveChallenge, releaseChallenge } from "@/lib/services/challenge"
import { getLiveStats } from "@/lib/services/event-dashboard"
import { sendBulkEmail } from "@/lib/services/participant-emails"
import type { HackathonPhase, ParticipantRole } from "@/lib/db/hackathon-types"

const VALID_PHASES: HackathonPhase[] = [
  "build",
  "submission_open",
  "preliminaries",
  "finals",
  "results_pending",
]

const announcementAudienceType = t.Union([
  t.Literal("everyone"),
  t.Literal("organizers"),
  t.Literal("judges"),
  t.Literal("mentors"),
  t.Literal("attendees"),
  t.Literal("submitted"),
  t.Literal("not_submitted"),
])

async function checkOrganizer(hackathonId: string, tenantId: string, set: { status?: number | string }) {
  const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
  const check = await checkHackathonOrganizer(hackathonId, tenantId)
  if (check.status === "not_found") {
    set.status = 404
    return { error: "Hackathon not found" }
  }
  if (check.status === "not_authorized") {
    set.status = 403
    return { error: "Not authorized to manage this hackathon" }
  }
  return null
}

export const dashboardEventRoutes = new Elysia({ prefix: "/dashboard" })
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)

    if (principal.kind === "api_key") {
      const result = await checkRateLimit(`api_key:${principal.keyId}:dashboard-event`)
      if (!result.allowed) {
        throw new RateLimitError(result.resetAt, result.remaining)
      }
    }

    return { principal }
  })
  .patch("/hackathons/:id/phase", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { phase } = body as { phase: string }

    if (!VALID_PHASES.includes(phase as HackathonPhase)) {
      set.status = 400
      return { error: `Invalid phase. Valid phases: ${VALID_PHASES.join(", ")}` }
    }

    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr

    const result = await setPhase(params.id, principal.tenantId, phase as HackathonPhase)

    if ("error" in result) {
      set.status = 400
      return { error: result.error }
    }

    await logAudit({ principal, action: "phase.changed", resourceType: "hackathon", resourceId: params.id, metadata: { hackathonId: params.id, phase } })

    return { success: true, phase }
  }, {
    body: t.Object({
      phase: t.String({ description: "Target phase" }),
    }),
    detail: { summary: "Set hackathon phase" },
  })
  .get("/hackathons/:id/rooms", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { rooms: await listRooms(params.id) }
  }, { detail: { summary: "List rooms" } })
  .post("/hackathons/:id/rooms", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const room = await createRoom(params.id, body as { name: string; displayOrder?: number })
    if (!room) { set.status = 400; return { error: "Failed to create room" } }
    await logAudit({ principal, action: "room.created", resourceType: "room", resourceId: room.id, metadata: { hackathonId: params.id, name: (body as { name: string }).name } })
    return room
  }, {
    body: t.Object({ name: t.String(), displayOrder: t.Optional(t.Number()) }),
    detail: { summary: "Create room" },
  })
  .patch("/hackathons/:id/rooms/:roomId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const room = await updateRoom(params.roomId, params.id, body as { name?: string; displayOrder?: number })
    if (!room) { set.status = 400; return { error: "Failed to update room" } }
    await logAudit({ principal, action: "room.updated", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id } })
    return room
  }, {
    body: t.Object({ name: t.Optional(t.String()), displayOrder: t.Optional(t.Number()) }),
    detail: { summary: "Update room" },
  })
  .delete("/hackathons/:id/rooms/:roomId", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const ok = await deleteRoom(params.roomId, params.id)
    if (!ok) { set.status = 400; return { error: "Failed to delete room" } }
    await logAudit({ principal, action: "room.deleted", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id } })
    return { success: true }
  }, { detail: { summary: "Delete room" } })
  .post("/hackathons/:id/rooms/:roomId/teams", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const { teamId } = body as { teamId: string }
    const ok = await addTeamToRoom(params.roomId, teamId)
    if (!ok) { set.status = 400; return { error: "Failed to add team to room" } }
    await logAudit({ principal, action: "room_team.added", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id, teamId } })
    return { success: true }
  }, {
    body: t.Object({ teamId: t.String() }),
    detail: { summary: "Add team to room" },
  })
  .delete("/hackathons/:id/rooms/:roomId/teams/:teamId", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const ok = await removeTeamFromRoom(params.roomId, params.teamId)
    if (!ok) { set.status = 400; return { error: "Failed to remove team from room" } }
    await logAudit({ principal, action: "room_team.removed", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id, teamId: params.teamId } })
    return { success: true }
  }, { detail: { summary: "Remove team from room" } })
  .patch("/hackathons/:id/rooms/:roomId/teams/:teamId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const { presented } = body as { presented: boolean }
    const ok = await togglePresented(params.roomId, params.teamId, presented)
    if (!ok) { set.status = 400; return { error: "Failed to update presentation status" } }
    await logAudit({ principal, action: "room_team.presented", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id, teamId: params.teamId, presented } })
    return { success: true }
  }, {
    body: t.Object({ presented: t.Boolean() }),
    detail: { summary: "Toggle team presented" },
  })
  .patch("/hackathons/:id/rooms/:roomId/timer", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const { endsAt, label } = body as { endsAt?: string; label?: string }
    if (!endsAt) {
      const room = await clearRoomTimer(params.roomId, params.id)
      if (!room) { set.status = 400; return { error: "Failed to clear timer" } }
      await logAudit({ principal, action: "room_timer.cleared", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id } })
      return room
    }
    const room = await setRoomTimer(params.roomId, params.id, { endsAt, label })
    if (!room) { set.status = 400; return { error: "Failed to set timer" } }
    await logAudit({ principal, action: "room_timer.set", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id, endsAt, label } })
    return room
  }, {
    body: t.Object({ endsAt: t.Optional(t.String()), label: t.Optional(t.String()) }),
    detail: { summary: "Set or clear room timer" },
  })
  .post("/hackathons/:id/rooms/:roomId/timer/pause", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const room = await pauseRoomTimer(params.roomId, params.id)
    if (!room) { set.status = 400; return { error: "Failed to pause timer" } }
    await logAudit({ principal, action: "room_timer.paused", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id } })
    return room
  }, {
    detail: { summary: "Pause room timer" },
  })
  .post("/hackathons/:id/rooms/:roomId/timer/resume", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const room = await resumeRoomTimer(params.roomId, params.id)
    if (!room) { set.status = 400; return { error: "Failed to resume timer" } }
    await logAudit({ principal, action: "room_timer.resumed", resourceType: "room", resourceId: params.roomId, metadata: { hackathonId: params.id } })
    return room
  }, {
    detail: { summary: "Resume paused room timer" },
  })
  .get("/hackathons/:id/teams", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { teams: await listTeamsWithMembers(params.id) }
  }, { detail: { summary: "List teams with members" } })
  .post("/hackathons/:id/teams", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const b = body as { name: string; captainEmail: string }
    const result = await createTeamWithMembers(params.id, {
      ...b,
      organizerClerkUserId: principal.kind === "user" ? principal.userId : undefined,
    })
    if ("error" in result) { set.status = 400; return { error: result.error } }
    await logAudit({
      principal,
      action: result.invited ? "team.captain_invited" : "team.created",
      resourceType: "team",
      resourceId: result.team.id,
      metadata: { hackathonId: params.id, name: b.name, ...(result.invited ? { captainEmail: b.captainEmail } : {}) },
    })
    return result
  }, {
    body: t.Object({ name: t.String(), captainEmail: t.String() }),
    detail: { summary: "Create team" },
  })
  .patch("/hackathons/:id/teams/:teamId/members", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const b = body as { add?: string[]; remove?: string[] }
    const ok = await modifyTeamMembers(params.teamId, params.id, b)
    if (!ok) { set.status = 400; return { error: "Failed to modify team members" } }
    await logAudit({ principal, action: "team.members_modified", resourceType: "team", resourceId: params.teamId, metadata: { hackathonId: params.id, added: b.add?.length ?? 0, removed: b.remove?.length ?? 0 } })
    return { success: true }
  }, {
    body: t.Object({ add: t.Optional(t.Array(t.String())), remove: t.Optional(t.Array(t.String())) }),
    detail: { summary: "Modify team members" },
  })
  .post("/hackathons/:id/teams/bulk-assign", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const { assignments } = body as { assignments: { teamId: string; roomId: string }[] }
    const result = await bulkAssignTeams(params.id, assignments)
    await logAudit({ principal, action: "team.bulk_assigned", resourceType: "hackathon", resourceId: params.id, metadata: { hackathonId: params.id, assignmentCount: assignments.length } })
    return result
  }, {
    body: t.Object({ assignments: t.Array(t.Object({ teamId: t.String(), roomId: t.String() })) }),
    detail: { summary: "Bulk assign teams to rooms" },
  })
  .patch("/hackathons/:id/teams/:teamId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    if (!isValidUuid(params.teamId)) {
      set.status = 400
      return { error: "Invalid team ID" }
    }

    const organizerErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (organizerErr) {
      if (principal.kind !== "user") return organizerErr
      const { supabase } = await import("@/lib/db/client")
      const { data: team } = await supabase()
        .from("teams")
        .select("captain_clerk_user_id")
        .eq("id", params.teamId)
        .eq("hackathon_id", params.id)
        .single()
      if (!team || team.captain_clerk_user_id !== principal.userId) {
        set.status = 403
        return { error: "Only the team captain or an organizer can rename a team" }
      }
    }

    const { name } = body
    if (!name.trim() || name.length > 100) {
      set.status = 400
      return { error: "Team name must be 1-100 characters" }
    }

    const { supabase } = await import("@/lib/db/client")
    const client = supabase()
    const { data, error } = await client
      .from("teams")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", params.teamId)
      .eq("hackathon_id", params.id)
      .select("id, name")
      .single()

    if (error || !data) {
      set.status = 404
      return { error: "Team not found" }
    }

    await logAudit({ principal, action: "team.name_updated", resourceType: "team", resourceId: params.teamId, metadata: { hackathonId: params.id, name: name.trim() } })

    return data
  }, {
    body: t.Object({ name: t.String() }),
    detail: { summary: "Update team name" },
  })
  .get("/hackathons/:id/categories", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { categories: await listCategories(params.id) }
  }, { detail: { summary: "List categories" } })
  .post("/hackathons/:id/categories", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const cat = await createCategory(params.id, body as { name: string; description?: string; prizeId?: string; displayOrder?: number })
    if (!cat) { set.status = 400; return { error: "Failed to create category" } }
    await logAudit({ principal, action: "category.created", resourceType: "category", resourceId: cat.id, metadata: { hackathonId: params.id, name: (body as { name: string }).name } })
    return cat
  }, {
    body: t.Object({ name: t.String(), description: t.Optional(t.String()), prizeId: t.Optional(t.String()), displayOrder: t.Optional(t.Number()) }),
    detail: { summary: "Create category" },
  })
  .patch("/hackathons/:id/categories/:categoryId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const cat = await updateCategory(params.categoryId, params.id, body as { name?: string; description?: string; prizeId?: string; displayOrder?: number })
    if (!cat) { set.status = 400; return { error: "Failed to update category" } }
    await logAudit({ principal, action: "category.updated", resourceType: "category", resourceId: params.categoryId, metadata: { hackathonId: params.id } })
    return cat
  }, {
    body: t.Object({ name: t.Optional(t.String()), description: t.Optional(t.String()), prizeId: t.Optional(t.String()), displayOrder: t.Optional(t.Number()) }),
    detail: { summary: "Update category" },
  })
  .delete("/hackathons/:id/categories/:categoryId", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const ok = await deleteCategory(params.categoryId, params.id)
    if (!ok) { set.status = 400; return { error: "Failed to delete category" } }
    await logAudit({ principal, action: "category.deleted", resourceType: "category", resourceId: params.categoryId, metadata: { hackathonId: params.id } })
    return { success: true }
  }, { detail: { summary: "Delete category" } })
  .get("/hackathons/:id/judging/rounds", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { rounds: await listRounds(params.id) }
  }, { detail: { summary: "List judging rounds" } })
  .post("/hackathons/:id/judging/rounds", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const round = await createRound(params.id, body as { name: string; roundType: "preliminary" | "finals" })
    if (!round) { set.status = 400; return { error: "Failed to create round" } }
    await logAudit({ principal, action: "judging_round.created", resourceType: "judging_round", resourceId: round.id, metadata: { hackathonId: params.id, name: (body as { name: string }).name } })
    return round
  }, {
    body: t.Object({ name: t.String(), roundType: t.Union([t.Literal("preliminary"), t.Literal("finals")]) }),
    detail: { summary: "Create judging round" },
  })
  .patch("/hackathons/:id/judging/rounds/:roundId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const round = await updateRound(params.roundId, params.id, body as { name?: string; roundType?: "preliminary" | "finals"; displayOrder?: number })
    if (!round) { set.status = 400; return { error: "Failed to update round" } }
    await logAudit({ principal, action: "judging_round.updated", resourceType: "judging_round", resourceId: params.roundId, metadata: { hackathonId: params.id } })
    return round
  }, {
    body: t.Object({ name: t.Optional(t.String()), roundType: t.Optional(t.Union([t.Literal("preliminary"), t.Literal("finals")])), displayOrder: t.Optional(t.Number()) }),
    detail: { summary: "Update judging round" },
  })
  .delete("/hackathons/:id/judging/rounds/:roundId", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const ok = await deleteRound(params.roundId, params.id)
    if (!ok) { set.status = 400; return { error: "Failed to delete round" } }
    await logAudit({ principal, action: "judging_round.deleted", resourceType: "judging_round", resourceId: params.roundId, metadata: { hackathonId: params.id } })
    return { success: true }
  }, { detail: { summary: "Delete judging round" } })
  .post("/hackathons/:id/judging/rounds/:roundId/activate", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const ok = await activateRound(params.roundId, params.id)
    if (!ok) { set.status = 400; return { error: "Failed to activate round" } }
    await logAudit({ principal, action: "judging_round.activated", resourceType: "judging_round", resourceId: params.roundId, metadata: { hackathonId: params.id } })
    return { success: true }
  }, { detail: { summary: "Activate judging round" } })
  .get("/hackathons/:id/social-submissions", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { submissions: await listSocialSubmissions(params.id) }
  }, { detail: { summary: "List social submissions" } })
  .patch("/hackathons/:id/social-submissions/:submissionId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const { status } = body as { status: "approved" | "rejected" }
    const ok = await reviewSocialSubmission(params.submissionId, status)
    if (!ok) { set.status = 400; return { error: "Failed to review submission" } }
    await logAudit({ principal, action: "social_submission.reviewed", resourceType: "social_submission", resourceId: params.submissionId, metadata: { hackathonId: params.id, status } })
    return { success: true }
  }, {
    body: t.Object({ status: t.Union([t.Literal("approved"), t.Literal("rejected")]) }),
    detail: { summary: "Review social submission" },
  })
  .get("/hackathons/:id/mentor-requests", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { requests: await listMentorQueue(params.id) }
  }, { detail: { summary: "List mentor requests" } })
  .get("/hackathons/:id/challenge", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const challenge = await getChallenge(params.id)
    return challenge ?? { title: null, body: null, releasedAt: null }
  }, { detail: { summary: "Get challenge" } })
  .put("/hackathons/:id/challenge", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const b = body as { title: string; body: string }
    const ok = await saveChallenge(params.id, principal.tenantId, b)
    if (!ok) { set.status = 400; return { error: "Failed to save challenge" } }
    await logAudit({ principal, action: "challenge.saved", resourceType: "challenge", resourceId: params.id, metadata: { hackathonId: params.id, title: b.title } })
    return { success: true }
  }, {
    body: t.Object({ title: t.String(), body: t.String() }),
    detail: { summary: "Save challenge" },
  })
  .post("/hackathons/:id/challenge/release", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const ok = await releaseChallenge(params.id, principal.tenantId)
    if (!ok) { set.status = 400; return { error: "Failed to release challenge. Ensure a challenge is created first." } }
    await logAudit({ principal, action: "challenge.released", resourceType: "challenge", resourceId: params.id, metadata: { hackathonId: params.id } })
    return { success: true }
  }, { detail: { summary: "Release challenge" } })
  .get("/hackathons/:id/live-stats", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const stats = await getLiveStats(params.id)
    if (!stats) { set.status = 404; return { error: "Hackathon not found" } }
    return stats
  }, { detail: { summary: "Get live event stats" } })
  .post("/hackathons/:id/email-blast", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const { subject, html, recipientFilter } = body as { subject: string; html: string; recipientFilter?: ParticipantRole[] }
    const result = await sendBulkEmail(params.id, { subject, html, recipientFilter })
    await logAudit({ principal, action: "email_blast.sent", resourceType: "hackathon", resourceId: params.id, metadata: { hackathonId: params.id, subject, recipientFilter: recipientFilter ?? "all", sentCount: result.sent } })
    return result
  }, {
    body: t.Object({
      subject: t.String(),
      html: t.String(),
      recipientFilter: t.Optional(t.Array(t.String())),
    }),
    detail: { summary: "Send bulk email to participants" },
  })
  .get("/hackathons/:id/announcements", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { announcements: await listAnnouncements(params.id) }
  }, { detail: { summary: "List announcements" } })
  .post("/hackathons/:id/announcements", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const announcement = await createAnnouncement(params.id, body as CreateAnnouncementInput)
    if (!announcement) { set.status = 400; return { error: "Failed to create announcement" } }
    await logAudit({ principal, action: "announcement.created", resourceType: "announcement", resourceId: announcement.id, metadata: { hackathonId: params.id, title: (body as CreateAnnouncementInput).title } })
    return announcement
  }, {
    body: t.Object({
      title: t.String(),
      body: t.String(),
      priority: t.Optional(t.Union([t.Literal("normal"), t.Literal("urgent")])),
      audience: t.Optional(announcementAudienceType),
    }),
    detail: { summary: "Create announcement" },
  })
  .patch("/hackathons/:id/announcements/:announcementId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    if (!isValidUuid(params.announcementId)) { set.status = 400; return { error: "Invalid announcement ID" } }
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const announcement = await updateAnnouncement(params.announcementId, params.id, body as UpdateAnnouncementInput)
    if (!announcement) { set.status = 400; return { error: "Failed to update announcement" } }
    await logAudit({ principal, action: "announcement.updated", resourceType: "announcement", resourceId: params.announcementId, metadata: { hackathonId: params.id } })
    return announcement
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      body: t.Optional(t.String()),
      priority: t.Optional(t.Union([t.Literal("normal"), t.Literal("urgent")])),
      audience: t.Optional(announcementAudienceType),
    }),
    detail: { summary: "Update announcement" },
  })
  .delete("/hackathons/:id/announcements/:announcementId", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    if (!isValidUuid(params.announcementId)) { set.status = 400; return { error: "Invalid announcement ID" } }
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const ok = await deleteAnnouncement(params.announcementId, params.id)
    if (!ok) { set.status = 400; return { error: "Failed to delete announcement" } }
    await logAudit({ principal, action: "announcement.deleted", resourceType: "announcement", resourceId: params.announcementId, metadata: { hackathonId: params.id } })
    return { success: true }
  }, { detail: { summary: "Delete announcement" } })
  .post("/hackathons/:id/announcements/:announcementId/publish", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    if (!isValidUuid(params.announcementId)) { set.status = 400; return { error: "Invalid announcement ID" } }
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const announcement = await publishAnnouncement(params.announcementId, params.id)
    if (!announcement) { set.status = 400; return { error: "Failed to publish announcement" } }
    await logAudit({ principal, action: "announcement.published", resourceType: "announcement", resourceId: params.announcementId, metadata: { hackathonId: params.id } })
    return announcement
  }, { detail: { summary: "Publish announcement" } })
  .post("/hackathons/:id/announcements/:announcementId/schedule", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    if (!isValidUuid(params.announcementId)) { set.status = 400; return { error: "Invalid announcement ID" } }
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const { scheduledAt } = body as { scheduledAt: string }
    const scheduledDate = new Date(scheduledAt)
    if (isNaN(scheduledDate.getTime())) {
      set.status = 400
      return { error: "Invalid scheduledAt: must be a valid ISO 8601 datetime" }
    }
    if (scheduledDate <= new Date()) {
      set.status = 400
      return { error: "scheduledAt must be in the future" }
    }
    const announcement = await scheduleAnnouncement(params.announcementId, params.id, scheduledAt)
    if (!announcement) { set.status = 400; return { error: "Failed to schedule announcement" } }
    await logAudit({ principal, action: "announcement.scheduled", resourceType: "announcement", resourceId: params.announcementId, metadata: { hackathonId: params.id, scheduledAt } })
    return announcement
  }, {
    body: t.Object({ scheduledAt: t.String() }),
    detail: { summary: "Schedule announcement for future publishing" },
  })
  .post("/hackathons/:id/announcements/:announcementId/unpublish", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    if (!isValidUuid(params.announcementId)) { set.status = 400; return { error: "Invalid announcement ID" } }
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const announcement = await unpublishAnnouncement(params.announcementId, params.id)
    if (!announcement) { set.status = 400; return { error: "Failed to unpublish announcement" } }
    await logAudit({ principal, action: "announcement.unpublished", resourceType: "announcement", resourceId: params.announcementId, metadata: { hackathonId: params.id } })
    return announcement
  }, { detail: { summary: "Unpublish announcement" } })
  .get("/hackathons/:id/schedule", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    return { scheduleItems: await listScheduleItems(params.id) }
  }, { detail: { summary: "List schedule items" } })
  .post("/hackathons/:id/schedule", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const b = body as { title: string; startsAt: string; description?: string; endsAt?: string; location?: string; sortOrder?: number; triggerType?: "challenge_release" | "submission_deadline" | null }
    const item = await createScheduleItem(params.id, b)
    if (!item) { set.status = 400; return { error: "Failed to create schedule item" } }
    await logAudit({ principal, action: "schedule_item.created", resourceType: "schedule_item", resourceId: item.id, metadata: { hackathonId: params.id, title: b.title } })
    return item
  }, {
    body: t.Object({ title: t.String(), startsAt: t.String(), description: t.Optional(t.String()), endsAt: t.Optional(t.String()), location: t.Optional(t.String()), sortOrder: t.Optional(t.Number()), triggerType: t.Optional(t.Union([t.Literal("challenge_release"), t.Literal("submission_deadline"), t.Null()])) }),
    detail: { summary: "Create schedule item" },
  })
  .patch("/hackathons/:id/schedule/:itemId", async ({ params, body, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    if (!isValidUuid(params.itemId)) { set.status = 400; return { error: "Invalid schedule item ID" } }
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const item = await updateScheduleItem(params.itemId, params.id, body as { title?: string; startsAt?: string; description?: string | null; endsAt?: string | null; location?: string | null; sortOrder?: number; linkedTo?: "event_start" | "event_end" | null })
    if (!item) { set.status = 400; return { error: "Failed to update schedule item" } }
    await logAudit({ principal, action: "schedule_item.updated", resourceType: "schedule_item", resourceId: params.itemId, metadata: { hackathonId: params.id } })
    return item
  }, {
    body: t.Object({ title: t.Optional(t.String()), startsAt: t.Optional(t.String()), description: t.Optional(t.String()), endsAt: t.Optional(t.String()), location: t.Optional(t.String()), sortOrder: t.Optional(t.Number()), linkedTo: t.Optional(t.Union([t.Literal("event_start"), t.Literal("event_end"), t.Null()])) }),
    detail: { summary: "Update schedule item" },
  })
  .delete("/hackathons/:id/schedule/:itemId", async ({ params, principal, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
    if (!isValidUuid(params.itemId)) { set.status = 400; return { error: "Invalid schedule item ID" } }
    const authErr = await checkOrganizer(params.id, principal.tenantId, set)
    if (authErr) return authErr
    const items = await listScheduleItems(params.id)
    const item = items.find((i) => i.id === params.itemId)
    if (item?.trigger_type) { set.status = 400; return { error: `Cannot delete ${item.trigger_type === "challenge_release" ? "challenge release" : "submission deadline"} — this item is required` } }
    const ok = await deleteScheduleItem(params.itemId, params.id)
    if (!ok) { set.status = 400; return { error: "Failed to delete schedule item" } }
    await logAudit({ principal, action: "schedule_item.deleted", resourceType: "schedule_item", resourceId: params.itemId, metadata: { hackathonId: params.id } })
    return { success: true }
  }, { detail: { summary: "Delete schedule item" } })
