import { Elysia, t } from "elysia"
import { HackathonStatusEnum } from "@/lib/api/validators"

function devGuard(set: { status?: number | string }) {
  if (process.env.NODE_ENV !== "development" && process.env.ADMIN_ENABLED !== "true") {
    set.status = 403
    return { error: "Forbidden" as const }
  }
  return null
}

async function getDb() {
  const { supabase } = await import("@/lib/db/client")
  return supabase()
}

async function getHackathonTenant(id: string, set: { status?: number | string }) {
  const db = await getDb()
  const { data: row } = await db
    .from("hackathons")
    .select("tenant_id")
    .eq("id", id)
    .single()

  if (!row) {
    set.status = 404
    return { error: "Hackathon not found" as const, tenantId: null }
  }
  return { error: null, tenantId: row.tenant_id as string }
}

const SEED_USERS = [
  "seed_user_alice_001",
  "seed_user_bob_002",
  "seed_user_carol_003",
  "seed_user_dave_004",
  "seed_user_eve_005",
  "seed_user_frank_006",
  "seed_user_grace_007",
  "seed_user_hank_008",
  "seed_user_ivy_009",
  "seed_user_jack_010",
]

const TEAM_NAMES = [
  "Alpha Wolves", "Binary Stars", "Circuit Breakers", "Data Dragons",
  "Echo Squad", "Flux Capacitors", "Gamma Rays", "Hyper Threads",
  "Ion Storm", "Jolt Riders",
]

const SUBMISSION_DATA = [
  { title: "AI Research Assistant", desc: "An AI-powered research tool that synthesizes academic papers" },
  { title: "Code Reviewer Bot", desc: "Automated code review with context-aware suggestions" },
  { title: "DataViz Agent", desc: "Natural language to data visualization pipeline" },
  { title: "HealthCheck AI", desc: "Predictive health monitoring dashboard using wearable data" },
  { title: "EcoTracker", desc: "Carbon footprint tracking with AI-driven recommendations" },
  { title: "SmartMentor", desc: "Personalized learning paths powered by LLMs" },
  { title: "SupplyChain Oracle", desc: "Real-time supply chain optimization with AI forecasting" },
  { title: "SoundScape", desc: "AI-generated ambient soundscapes for productivity" },
  { title: "LegalBot", desc: "Contract analysis and clause extraction using NLP" },
  { title: "FarmVision", desc: "Drone-based crop health monitoring with computer vision" },
]

const ROOM_NAMES = ["Room A", "Room B", "Room C", "Room D", "Room E"]

export const devRoutes = new Elysia({ prefix: "/dev" })
  .onBeforeHandle(async ({ set, request }) => {
    if (process.env.NODE_ENV === "development") return
    const { resolvePrincipal, isAdminEnabled } = await import("@/lib/auth/principal")
    if (!isAdminEnabled()) {
      set.status = 403
      return { error: "Forbidden" as const }
    }
    const principal = await resolvePrincipal(request)
    if (principal.kind !== "admin") {
      set.status = 403
      return { error: "Forbidden" as const }
    }
  })
  .get(
    "/config-status",
    ({ set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      return {
        orgId: !!process.env.SCENARIO_ORG_ID,
        devUserId: !!process.env.SCENARIO_DEV_USER_ID,
        testUsers: {
          user1: !!process.env.TEST_USER_1_ID,
          user2: !!process.env.TEST_USER_2_ID,
          user3: !!process.env.TEST_USER_3_ID,
          user4: !!process.env.TEST_USER_4_ID,
          user5: !!process.env.TEST_USER_5_ID,
        },
      }
    }
  )

  .get(
    "/hackathons/:id/seed-status",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const hid = params.id

      const [teams, submissions, criteria, judges, assignments, rooms, prizes, categories, hackathon, mentorRequests, prizeTracks] = await Promise.all([
        db.from("teams").select("id", { count: "exact", head: true }).eq("hackathon_id", hid).in("captain_clerk_user_id", SEED_USERS),
        db.from("submissions").select("id", { count: "exact", head: true }).eq("hackathon_id", hid),
        db.from("judging_criteria").select("id", { count: "exact", head: true }).eq("hackathon_id", hid),
        db.from("hackathon_participants").select("id", { count: "exact", head: true }).eq("hackathon_id", hid).eq("role", "judge"),
        db.from("judge_assignments").select("id, is_complete", { count: "exact" }).eq("hackathon_id", hid),
        db.from("rooms").select("id", { count: "exact", head: true }).eq("hackathon_id", hid),
        db.from("prizes").select("id", { count: "exact", head: true }).eq("hackathon_id", hid),
        db.from("submission_categories").select("id", { count: "exact", head: true }).eq("hackathon_id", hid),
        db.from("hackathons").select("challenge_released_at, results_published_at").eq("id", hid).single(),
        db.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hid),
        db.from("prize_tracks").select("id", { count: "exact", head: true }).eq("hackathon_id", hid),
      ])

      const scoredAssignments = assignments.data?.filter((a) => a.is_complete)?.length ?? 0

      return {
        teams: teams.count ?? 0,
        submissions: submissions.count ?? 0,
        criteria: criteria.count ?? 0,
        judges: judges.count ?? 0,
        assignments: assignments.count ?? 0,
        scoredAssignments,
        rooms: rooms.count ?? 0,
        prizes: prizes.count ?? 0,
        categories: categories.count ?? 0,
        challengeReleased: !!hackathon.data?.challenge_released_at,
        resultsPublished: !!hackathon.data?.results_published_at,
        mentorRequests: mentorRequests.count ?? 0,
        prizeTracks: prizeTracks.count ?? 0,
      }
    }
  )

  .get(
    "/hackathons/by-slug/:slug",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const { data, error } = await db
        .from("hackathons")
        .select("id, slug, name, status, phase, starts_at, ends_at, registration_opens_at, registration_closes_at")
        .eq("slug", params.slug)
        .single()

      if (error || !data) {
        set.status = 404
        return { error: "Hackathon not found" }
      }

      return data
    }
  )

  .patch(
    "/hackathons/:id/status",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const { data: hackathon } = await db
        .from("hackathons")
        .select("id, tenant_id, status")
        .eq("id", params.id)
        .single()

      if (!hackathon) { set.status = 404; return { error: "Hackathon not found" } }

      const currentStatus = hackathon.status as import("@/lib/db/hackathon-types").HackathonStatus
      const newStatus = body.status as import("@/lib/db/hackathon-types").HackathonStatus

      if (currentStatus === newStatus) {
        return { id: hackathon.id, status: currentStatus }
      }

      const { executeTransition } = await import("@/lib/services/lifecycle")
      const result = await executeTransition({
        hackathonId: params.id,
        tenantId: hackathon.tenant_id as string,
        fromStatus: currentStatus,
        toStatus: newStatus,
        trigger: "manual",
        triggeredBy: "dev-toolbar",
      })

      if (result.success) {
        return { id: result.hackathon!.id, status: result.hackathon!.status }
      }

      // Dev toolbar allows arbitrary status jumps (e.g. draft → judging)
      // that aren't in VALID_TRANSITIONS. Fall back to direct write.
      const { error: updateError } = await db
        .from("hackathons")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", params.id)

      if (updateError) { set.status = 500; return { error: "Update failed" } }

      return { id: hackathon.id, status: newStatus }
    },
    { body: t.Object({ status: HackathonStatusEnum }) }
  )

  .patch(
    "/hackathons/:id/phase",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const { error } = await db
        .from("hackathons")
        .update({ phase: body.phase })
        .eq("id", params.id)

      if (error) { set.status = 500; return { error: "Update failed" } }
      return { phase: body.phase }
    },
    { body: t.Object({ phase: t.Union([
      t.Literal("build"),
      t.Literal("submission_open"),
      t.Literal("preliminaries"),
      t.Literal("finals"),
      t.Literal("results_pending"),
      t.Null(),
    ]) }) }
  )

  .patch(
    "/hackathons/:id/timeline",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const updates: Record<string, string | null> = {}
      if (body.startsAt !== undefined) updates.starts_at = body.startsAt
      if (body.endsAt !== undefined) updates.ends_at = body.endsAt
      if (body.registrationOpensAt !== undefined) updates.registration_opens_at = body.registrationOpensAt
      if (body.registrationClosesAt !== undefined) updates.registration_closes_at = body.registrationClosesAt

      const { error } = await db.from("hackathons").update(updates).eq("id", params.id)
      if (error) { set.status = 500; return { error: "Update failed" } }
      return { updated: Object.keys(updates) }
    },
    {
      body: t.Object({
        startsAt: t.Optional(t.Union([t.String(), t.Null()])),
        endsAt: t.Optional(t.Union([t.String(), t.Null()])),
        registrationOpensAt: t.Optional(t.Union([t.String(), t.Null()])),
        registrationClosesAt: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  )

  .post(
    "/hackathons/:id/seed-teams",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const count = body.count ?? 5
      const teamIds: string[] = []

      await db.from("teams")
        .delete()
        .eq("hackathon_id", params.id)
        .in("captain_clerk_user_id", SEED_USERS)

      for (let i = 0; i < count; i++) {
        const captainId = SEED_USERS[i % SEED_USERS.length]
        const memberId = SEED_USERS[(i + 1) % SEED_USERS.length]

        const captainPid = await ensureParticipant(db, params.id, captainId)
        const memberPid = await ensureParticipant(db, params.id, memberId)

        const { data: team } = await db
          .from("teams")
          .insert({
            hackathon_id: params.id,
            name: TEAM_NAMES[i % TEAM_NAMES.length],
            captain_clerk_user_id: captainId,
            invite_code: crypto.randomUUID().slice(0, 8),
            status: "forming",
          })
          .select("id")
          .single()

        if (!team) continue

        await db.from("hackathon_participants").update({ team_id: team.id }).eq("id", captainPid)
        await db.from("hackathon_participants").update({ team_id: team.id }).eq("id", memberPid)
        teamIds.push(team.id)
      }

      return { seeded: teamIds.length, teamIds }
    },
    { body: t.Object({ count: t.Optional(t.Number({ minimum: 1, maximum: 10 })) }) }
  )

  .post(
    "/hackathons/:id/seed-submissions",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const { data: teams } = await db
        .from("teams")
        .select("id, captain_clerk_user_id")
        .eq("hackathon_id", params.id)
        .neq("status", "disbanded")

      if (!teams?.length) { set.status = 400; return { error: "No teams to create submissions for" } }

      const submissionIds: string[] = []
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i]
        const { data: participant } = await db
          .from("hackathon_participants")
          .select("id")
          .eq("hackathon_id", params.id)
          .eq("team_id", team.id)
          .limit(1)
          .single()

        if (!participant) continue

        const template = SUBMISSION_DATA[i % SUBMISSION_DATA.length]
        const { data: sub } = await db
          .from("submissions")
          .insert({
            hackathon_id: params.id,
            team_id: team.id,
            participant_id: participant.id,
            title: template.title,
            description: template.desc,
            github_url: `https://github.com/example/${template.title.toLowerCase().replace(/\s+/g, "-")}`,
            status: "submitted",
          })
          .select("id")
          .single()

        if (sub) submissionIds.push(sub.id)
      }

      return { seeded: submissionIds.length }
    },
  )

  .post(
    "/hackathons/:id/seed-rooms",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const count = body.count ?? 3
      const roomIds: string[] = []

      for (let i = 0; i < count; i++) {
        const { data: room } = await db
          .from("rooms")
          .insert({
            hackathon_id: params.id,
            name: ROOM_NAMES[i % ROOM_NAMES.length],
            display_order: i,
          })
          .select("id")
          .single()

        if (room) roomIds.push(room.id)
      }

      if (body.assignTeams) {
        const { data: teams } = await db
          .from("teams")
          .select("id")
          .eq("hackathon_id", params.id)
          .neq("status", "disbanded")

        if (teams?.length) {
          for (let i = 0; i < teams.length; i++) {
            const roomId = roomIds[i % roomIds.length]
            await db.from("room_teams").insert({
              room_id: roomId,
              team_id: teams[i].id,
              present_order: i,
            })
          }
        }
      }

      return { seeded: roomIds.length, roomIds }
    },
    { body: t.Object({
      count: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
      assignTeams: t.Optional(t.Boolean()),
    }) }
  )

  .post(
    "/hackathons/:id/seed-judging",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()

      const criteria = [
        { name: "Innovation", description: "Novelty and creativity of the solution", max_score: 10, weight: 1.5, category: "core" as const },
        { name: "Technical Execution", description: "Code quality, architecture, and reliability", max_score: 10, weight: 1.0, category: "core" as const },
        { name: "Presentation", description: "Demo clarity, documentation, and communication", max_score: 10, weight: 0.5, category: "bonus" as const },
      ]

      const rubricLevels = [
        { level_number: 1, label: "Far Below Expectations" },
        { level_number: 2, label: "Below Expectations" },
        { level_number: 3, label: "Meets Expectations" },
        { level_number: 4, label: "Exceeds Expectations" },
        { level_number: 5, label: "Far Exceeds Expectations" },
      ]

      const criteriaIds: string[] = []
      for (let i = 0; i < criteria.length; i++) {
        const { data } = await db
          .from("judging_criteria")
          .insert({ hackathon_id: params.id, ...criteria[i], display_order: i })
          .select("id")
          .single()
        if (data) {
          criteriaIds.push(data.id)
          for (const level of rubricLevels) {
            await db.from("rubric_levels").insert({ criteria_id: data.id, ...level })
          }
        }
      }

      const judgeUserIds = SEED_USERS.slice(0, 3)
      const judgeNames = ["Alice Johnson", "Bob Chen", "Carol Davis"]
      const judgePids: string[] = []
      for (const uid of judgeUserIds) {
        const pid = await ensureParticipant(db, params.id, uid, "judge")
        judgePids.push(pid)
      }

      await db.from("hackathon_judges_display").delete().eq("hackathon_id", params.id)
      for (let i = 0; i < judgePids.length; i++) {
        await db.from("hackathon_judges_display").insert({
          hackathon_id: params.id,
          name: judgeNames[i],
          title: "Judge",
          clerk_user_id: judgeUserIds[i],
          participant_id: judgePids[i],
          display_order: i,
        })
      }

      const { data: submissions } = await db
        .from("submissions")
        .select("id, team_id")
        .eq("hackathon_id", params.id)
        .eq("status", "submitted")

      let assignmentCount = 0
      if (submissions?.length) {
        for (const judgePid of judgePids) {
          for (const sub of submissions) {
            const { data } = await db
              .from("judge_assignments")
              .insert({
                hackathon_id: params.id,
                judge_participant_id: judgePid,
                submission_id: sub.id,
              })
              .select("id")
              .single()
            if (data) assignmentCount++
          }
        }
      }

      const { createPrize, assignJudgeToPrize } = await import("@/lib/services/judging")

      const standardPrizes = [
        { name: "Grand Prize", judgingStyle: "bucket_sort" as const, description: "Best project overall", value: "$10,000", type: "score" as const, rank: 1, kind: "cash", monetaryValue: 10000, currency: "USD" },
        { name: "Most Innovative", judgingStyle: "judges_pick" as const, description: "Creative and novel approach", value: "$500 API Credits", type: "criteria" as const, kind: "credit", criteriaId: criteriaIds[0] ?? null },
        { name: "People's Choice", judgingStyle: "crowd_vote" as const, description: "Audience vote winner", value: "Swag Pack", type: "crowd" as const, kind: "swag" },
      ]


      await db.from("prizes").delete().eq("hackathon_id", params.id)

      const prizeIds: string[] = []
      for (let i = 0; i < standardPrizes.length; i++) {
        const p = standardPrizes[i]
        const result = await createPrize(params.id, {
          ...p,
          displayOrder: i,
        })
        if (result.success) prizeIds.push(result.prize.id)
      }

      for (const prizeId of prizeIds) {
        for (const judgePid of judgePids) {
          await assignJudgeToPrize(params.id, judgePid, prizeId).catch(() => {})
        }
      }

      return { criteriaCount: criteriaIds.length, judgeCount: judgePids.length, assignmentCount, prizeCount: prizeIds.length }
    },
  )

  .post(
    "/hackathons/:id/seed-scores",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const pct = body.percentage ?? 60

      const { data: assignments } = await db
        .from("judge_assignments")
        .select("id")
        .eq("hackathon_id", params.id)
        .eq("is_complete", false)

      if (!assignments?.length) return { scored: 0 }

      const { data: criteriaRows } = await db
        .from("judging_criteria")
        .select("id")
        .eq("hackathon_id", params.id)

      const criteriaIds = criteriaRows?.map((c) => c.id) ?? []
      const toScore = Math.ceil(assignments.length * (pct / 100))
      let scored = 0

      for (let i = 0; i < toScore; i++) {
        const a = assignments[i]
        for (const cId of criteriaIds) {
          await db.from("scores").insert({
            judge_assignment_id: a.id,
            criteria_id: cId,
            score: Math.floor(Math.random() * 8) + 3,
          })
        }
        await db
          .from("judge_assignments")
          .update({ is_complete: true, completed_at: new Date().toISOString() })
          .eq("id", a.id)
        scored++
      }

      return { scored, total: assignments.length }
    },
    { body: t.Object({ percentage: t.Optional(t.Number({ minimum: 1, maximum: 100 })) }) }
  )

  .post(
    "/hackathons/:id/seed-challenge",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const { error } = await db
        .from("hackathons")
        .update({
          challenge_title: "Build an AI Agent That Solves a Real Problem",
          challenge_body: "Create an AI-powered agent that addresses a genuine pain point. Your solution should demonstrate autonomous decision-making, tool usage, and real-world applicability. Bonus points for creative use of MCP, multi-modal inputs, or novel agentic patterns.",
          challenge_released_at: new Date().toISOString(),
        })
        .eq("id", params.id)

      if (error) { set.status = 500; return { error: "Failed" } }
      return { released: true }
    },
  )

  .post(
    "/hackathons/:id/seed-mentors",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const categories = ["Frontend", "Backend", "AI/ML", "Design", "Deployment"]
      const descriptions = [
        "Need help with React state management",
        "Database schema design question",
        "How to fine-tune a model for our use case?",
        "UI/UX feedback on our prototype",
        "Struggling with Docker deployment",
      ]

      let created = 0
      for (let i = 0; i < 5; i++) {
        const pid = await ensureParticipant(db, params.id, SEED_USERS[i % SEED_USERS.length])
        const { data: team } = await db
          .from("hackathon_participants")
          .select("team_id")
          .eq("id", pid)
          .single()

        const statuses = ["open", "open", "open", "claimed", "resolved"] as const
        const { error } = await db.from("mentor_requests").insert({
          hackathon_id: params.id,
          requester_participant_id: pid,
          team_id: team?.team_id ?? null,
          category: categories[i],
          description: descriptions[i],
          status: statuses[i],
        })

        if (!error) created++
      }

      return { seeded: created }
    },
  )

  .post(
    "/hackathons/:id/seed-all",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const { error, tenantId } = await getHackathonTenant(params.id, set)
      if (error) return { error }

      const { updateHackathonSettings } = await import("@/lib/services/public-hackathons")
      await updateHackathonSettings(params.id, tenantId!, { status: "active" })
      await db.from("hackathons").update({ phase: "build" }).eq("id", params.id)

      const now = new Date()
      await db.from("hackathons").update({
        starts_at: new Date(now.getTime() - 2 * 3600000).toISOString(),
        ends_at: new Date(now.getTime() + 6 * 3600000).toISOString(),
        registration_opens_at: new Date(now.getTime() - 7 * 86400000).toISOString(),
        registration_closes_at: new Date(now.getTime() - 2 * 3600000).toISOString(),
      }).eq("id", params.id)

      await db.from("teams")
        .delete()
        .eq("hackathon_id", params.id)
        .in("captain_clerk_user_id", SEED_USERS)

      const teamIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const captainId = SEED_USERS[i * 2 % SEED_USERS.length]
        const memberId = SEED_USERS[(i * 2 + 1) % SEED_USERS.length]
        const captainPid = await ensureParticipant(db, params.id, captainId)
        const memberPid = await ensureParticipant(db, params.id, memberId)

        const { data: team } = await db
          .from("teams")
          .insert({
            hackathon_id: params.id,
            name: TEAM_NAMES[i],
            captain_clerk_user_id: captainId,
            invite_code: crypto.randomUUID().slice(0, 8),
            status: "forming",
          })
          .select("id")
          .single()

        if (!team) continue
        await db.from("hackathon_participants").update({ team_id: team.id }).eq("id", captainPid)
        await db.from("hackathon_participants").update({ team_id: team.id }).eq("id", memberPid)
        teamIds.push(team.id)
      }

      for (let i = 0; i < teamIds.length; i++) {
        const { data: participant } = await db
          .from("hackathon_participants")
          .select("id")
          .eq("hackathon_id", params.id)
          .eq("team_id", teamIds[i])
          .limit(1)
          .single()
        if (!participant) continue

        const t = SUBMISSION_DATA[i % SUBMISSION_DATA.length]
        await db.from("submissions").insert({
          hackathon_id: params.id,
          team_id: teamIds[i],
          participant_id: participant.id,
          title: t.title,
          description: t.desc,
          status: "submitted",
        })
      }

      const { data: seedCriteria } = await db
        .from("judging_criteria")
        .select("id")
        .eq("hackathon_id", params.id)
        .order("display_order")
      const firstCriteriaId = seedCriteria?.[0]?.id ?? null

      const prizeData = [
        { name: "Best Overall", description: "Awarded to the top-scoring team overall", value: "$500", type: "score" as const, rank: 1, kind: "cash", judging_style: "bucket_sort", monetary_value: 500, currency: "USD", display_order: 0 },
        { name: "Most Innovative", description: "Awarded for the most creative and novel solution", value: "$250", type: "criteria" as const, rank: null, kind: "credit", judging_style: "judges_pick", criteria_id: firstCriteriaId, display_order: 1 },
        { name: "People's Choice", description: "Voted by the crowd", value: "$100", type: "crowd" as const, rank: null, kind: "cash", judging_style: "crowd_vote", monetary_value: 100, currency: "USD", display_order: 2 },
      ]
      let prizesSeeded = 0
      for (const p of prizeData) {
        const { error: pErr } = await db.from("prizes").insert({
          hackathon_id: params.id,
          ...p,
        })
        if (!pErr) prizesSeeded++
      }

      const roomIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const { data: room } = await db
          .from("rooms")
          .insert({ hackathon_id: params.id, name: ROOM_NAMES[i], display_order: i })
          .select("id")
          .single()
        if (room) roomIds.push(room.id)
      }
      for (let i = 0; i < teamIds.length; i++) {
        await db.from("room_teams").insert({
          room_id: roomIds[i % roomIds.length],
          team_id: teamIds[i],
          present_order: i,
        })
      }

      await db.from("hackathons").update({
        challenge_title: "Build an AI Agent That Solves a Real Problem",
        challenge_released_at: new Date().toISOString(),
      }).eq("id", params.id)

      return { teams: teamIds.length, prizes: prizesSeeded, rooms: roomIds.length, message: "Full seed complete" }
    },
  )

  .post(
    "/hackathons/:id/seed-prizes",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const { createPrize, assignJudgeToPrize } = await import("@/lib/services/judging")
      const db = await getDb()

      const preset = body.preset ?? "standard"

      type PrizeJudgingStyle = "bucket_sort" | "gate_check" | "crowd_vote" | "judges_pick"
      type PrizeType = "score" | "criteria" | "crowd" | "favorite"
      type SeedPrize = {
        name: string
        judgingStyle: PrizeJudgingStyle
        description: string
        value?: string
        type?: PrizeType
        rank?: number | null
        kind?: string
        monetaryValue?: number
        currency?: string
      }

      const { data: criteriaRows } = await db
        .from("judging_criteria")
        .select("id")
        .eq("hackathon_id", params.id)
        .order("display_order")
      const firstCriteriaId = criteriaRows?.[0]?.id ?? null

      const PRESETS: Record<string, SeedPrize[]> = {
        standard: [
          { name: "Grand Prize", judgingStyle: "bucket_sort", description: "Best project overall", value: "$10,000", type: "score", rank: 1, kind: "cash", monetaryValue: 10000, currency: "USD" },
          { name: "Most Innovative", judgingStyle: "judges_pick", description: "Creative and novel approach", value: "$500 API Credits", type: "criteria", kind: "credit" },
          { name: "People's Choice", judgingStyle: "crowd_vote", description: "Audience vote winner", value: "Swag Pack", type: "crowd", kind: "swag" },
        ],
        sponsor_heavy: [
          { name: "Grand Prize", judgingStyle: "bucket_sort", description: "Top project across all criteria", value: "$10,000", type: "score", rank: 1, kind: "cash", monetaryValue: 10000, currency: "USD" },
          { name: "Best AI/ML", judgingStyle: "bucket_sort", description: "Sponsored by TechCorp — best use of machine learning", value: "$5,000", type: "score", rank: 2, kind: "cash", monetaryValue: 5000, currency: "USD" },
          { name: "Best Developer Tool", judgingStyle: "judges_pick", description: "Sponsored by DevHub — most useful dev tool", value: "$2,500", type: "criteria", kind: "cash", monetaryValue: 2500, currency: "USD" },
          { name: "Best Social Impact", judgingStyle: "judges_pick", description: "Sponsored by GoodCause — biggest real-world impact", value: "$2,500", type: "criteria", kind: "cash", monetaryValue: 2500, currency: "USD" },
          { name: "Crowd Favorite", judgingStyle: "crowd_vote", description: "Voted by all attendees", value: "Swag Pack", type: "crowd", kind: "swag" },
        ],
        minimal: [
          { name: "Winner", judgingStyle: "bucket_sort", description: "Single prize, bucket sort style", value: "$5,000", type: "score", rank: 1, kind: "cash", monetaryValue: 5000, currency: "USD" },
        ],
        kitchen_sink: [
          { name: "Grand Prize", judgingStyle: "bucket_sort", description: "Best overall project", value: "$10,000", type: "score", rank: 1, kind: "cash", monetaryValue: 10000, currency: "USD" },
          { name: "Best AI Agent", judgingStyle: "bucket_sort", description: "Most capable autonomous agent", value: "$5,000", type: "score", rank: 2, kind: "cash", monetaryValue: 5000, currency: "USD" },
          { name: "Best UX", judgingStyle: "judges_pick", description: "Best user experience and design", value: "$2,500", type: "criteria", kind: "cash", monetaryValue: 2500, currency: "USD" },
          { name: "Most Innovative", judgingStyle: "judges_pick", description: "Creative and novel approach", value: "$500 API Credits", type: "criteria", kind: "credit" },
          { name: "Best Use of MCP", judgingStyle: "gate_check", description: "Best Model Context Protocol integration", value: "Swag Pack", type: "score", rank: 3, kind: "swag" },
          { name: "People's Choice", judgingStyle: "crowd_vote", description: "Live audience voting", value: "Swag Pack", type: "crowd", kind: "swag" },
        ],
      }


      const prizes = PRESETS[preset]
      if (!prizes) {
        set.status = 400
        return { error: `Unknown preset: ${preset}. Available: ${Object.keys(PRESETS).join(", ")}` }
      }

      await db.from("prizes").delete().eq("hackathon_id", params.id)

      const created: string[] = []
      for (let i = 0; i < prizes.length; i++) {
        const p = prizes[i]
        const prizeResult = await createPrize(params.id, {
          name: p.name,
          description: p.description,
          judgingStyle: p.judgingStyle,
          displayOrder: i,
          value: p.value,
          type: p.type,
          rank: p.rank,
          kind: p.kind,
          monetaryValue: p.monetaryValue,
          currency: p.currency,
          criteriaId: p.type === "criteria" ? firstCriteriaId : undefined,
        })
        if (prizeResult.success) created.push(prizeResult.prize.id)
      }

      // If judging is set up, auto-assign judges to prizes
      if (body.assignJudges) {
        const { data: judgePids } = await db
          .from("hackathon_participants")
          .select("id")
          .eq("hackathon_id", params.id)
          .eq("role", "judge")
        if (judgePids?.length) {
          for (const prizeId of created) {
            for (const judge of judgePids) {
              await assignJudgeToPrize(params.id, judge.id, prizeId).catch(() => {})
            }
          }
        }
      }

      // If requested, seed scores
      if (body.scorePercentage && body.scorePercentage > 0) {
        const { data: assignments } = await db
          .from("judge_assignments")
          .select("id")
          .eq("hackathon_id", params.id)
          .eq("is_complete", false)

        const { data: criteriaRows } = await db
          .from("judging_criteria")
          .select("id")
          .eq("hackathon_id", params.id)

        const criteriaIds = criteriaRows?.map((c) => c.id) ?? []
        if (assignments?.length && criteriaIds.length) {
          const toScore = Math.ceil(assignments.length * (body.scorePercentage / 100))
          for (let i = 0; i < toScore; i++) {
            for (const cId of criteriaIds) {
              await db.from("scores").insert({
                judge_assignment_id: assignments[i].id,
                criteria_id: cId,
                score: Math.floor(Math.random() * 8) + 3,
              })
            }
            await db
              .from("judge_assignments")
              .update({ is_complete: true, completed_at: new Date().toISOString() })
              .eq("id", assignments[i].id)
          }
        }
      }

      return { preset, tracksCreated: created.length }
    },
    {
      body: t.Object({
        preset: t.Optional(t.String()),
        assignJudges: t.Optional(t.Boolean()),
        scorePercentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
      }),
    }
  )

  .post(
    "/hackathons/:id/seed-categories",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const categories = [
        { name: "AI/ML", description: "Artificial intelligence and machine learning projects" },
        { name: "Web3", description: "Blockchain, DeFi, and decentralized applications" },
        { name: "Social Impact", description: "Projects addressing social or environmental challenges" },
      ]

      let seeded = 0
      for (let i = 0; i < categories.length; i++) {
        const { error } = await db.from("submission_categories").insert({
          hackathon_id: params.id,
          ...categories[i],
          display_order: i,
        })
        if (!error) seeded++
      }
      return { seeded }
    },
  )

  .post(
    "/hackathons/:id/seed-social",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      const socialPosts = [
        { url: "https://twitter.com/team_alpha/status/1234567890", platform: "twitter", og_title: "Check out our AI Research Assistant!", status: "approved" as const },
        { url: "https://linkedin.com/posts/binary-stars-demo-2026", platform: "linkedin", og_title: "Excited to share our hackathon project", status: "approved" as const },
        { url: "https://twitter.com/circuit_breakers/status/9876543210", platform: "twitter", og_title: "Live demo of our Code Reviewer Bot", status: "pending" as const },
        { url: "https://instagram.com/p/datadragons_hack2026", platform: "instagram", og_title: "Behind the scenes at the hackathon", status: "pending" as const },
        { url: "https://twitter.com/echo_squad_dev/status/5555555555", platform: "twitter", og_title: "Our EcoTracker just went live!", status: "rejected" as const },
      ]

      let seeded = 0
      const { data: participants } = await db
        .from("hackathon_participants")
        .select("id, team_id")
        .eq("hackathon_id", params.id)
        .limit(5)

      if (!participants?.length) return { seeded: 0, error: "No participants found" }

      for (let i = 0; i < socialPosts.length; i++) {
        const p = participants[i % participants.length]
        const { error } = await db.from("social_media_submissions").insert({
          hackathon_id: params.id,
          participant_id: p.id,
          team_id: p.team_id,
          ...socialPosts[i],
        })
        if (!error) seeded++
      }
      return { seeded }
    },
  )

  .post(
    "/hackathons/:id/calculate-results",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const { calculateResults } = await import("@/lib/services/results")
      return await calculateResults(params.id)
    },
  )

  .post(
    "/hackathons/:id/publish-results",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const { error, tenantId } = await getHackathonTenant(params.id, set)
      if (error) return { error }

      const { publishResults } = await import("@/lib/services/results")
      return await publishResults(params.id, tenantId!)
    },
  )

  .delete(
    "/hackathons/:id/seed-data",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const db = await getDb()
      await db.from("mentor_requests").delete().eq("hackathon_id", params.id)
      await db.from("social_media_submissions").delete().eq("hackathon_id", params.id)
      await db.from("hackathon_results").delete().eq("hackathon_id", params.id)
      await db.from("prize_assignments").delete().in(
        "prize_id",
        db.from("prizes").select("id").eq("hackathon_id", params.id) as unknown as string[]
      )
      await db.from("prizes").delete().eq("hackathon_id", params.id)
      await db.from("submission_category_entries").delete().in(
        "category_id",
        db.from("submission_categories").select("id").eq("hackathon_id", params.id) as unknown as string[]
      )
      await db.from("submission_categories").delete().eq("hackathon_id", params.id)
      await db.from("scores").delete().in(
        "judge_assignment_id",
        db.from("judge_assignments").select("id").eq("hackathon_id", params.id) as unknown as string[]
      )
      await db.from("judge_assignments").delete().eq("hackathon_id", params.id)
      await db.from("judging_criteria").delete().eq("hackathon_id", params.id)
      await db.from("room_teams").delete().in(
        "room_id",
        db.from("rooms").select("id").eq("hackathon_id", params.id) as unknown as string[]
      )
      await db.from("rooms").delete().eq("hackathon_id", params.id)
      await db.from("judging_rounds").delete().in(
        "prize_track_id",
        db.from("prize_tracks").select("id").eq("hackathon_id", params.id) as unknown as string[]
      )
      await db.from("prize_tracks").delete().eq("hackathon_id", params.id)
      await db.from("submissions").delete().eq("hackathon_id", params.id)
      await db.from("hackathon_judges_display").delete().eq("hackathon_id", params.id).in("clerk_user_id", SEED_USERS)
      await db.from("hackathon_participants").delete().eq("hackathon_id", params.id).in("clerk_user_id", SEED_USERS)
      await db.from("teams").delete().eq("hackathon_id", params.id).in("captain_clerk_user_id", SEED_USERS)

      return { cleared: true }
    },
  )

  .post(
    "/hackathons/:id/assign-role",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const { auth } = await import("@clerk/nextjs/server")
      const { userId } = await auth()
      if (!userId) { set.status = 401; return { error: "Not signed in" } }

      const db = await getDb()
      const { data: hackathon } = await db
        .from("hackathons")
        .select("id")
        .eq("id", params.id)
        .single()

      if (!hackathon) { set.status = 404; return { error: "Hackathon not found" } }

      const { data: existing } = await db
        .from("hackathon_participants")
        .select("id, role")
        .eq("hackathon_id", params.id)
        .eq("clerk_user_id", userId)
        .single()

      if (existing) {
        if (existing.role === body.role) {
          return { id: existing.id, role: existing.role, action: "already_assigned" }
        }
        const { error } = await db
          .from("hackathon_participants")
          .update({ role: body.role })
          .eq("id", existing.id)

        if (error) { set.status = 500; return { error: "Update failed" } }
        return { id: existing.id, role: body.role, action: "updated" }
      }

      const { data: created, error } = await db
        .from("hackathon_participants")
        .insert({ hackathon_id: params.id, clerk_user_id: userId, role: body.role })
        .select("id")
        .single()

      if (error) { set.status = 500; return { error: "Insert failed" } }
      return { id: created!.id, role: body.role, action: "created" }
    },
    {
      body: t.Object({
        role: t.Union([
          t.Literal("participant"),
          t.Literal("judge"),
          t.Literal("organizer"),
          t.Literal("mentor"),
        ]),
      }),
    }
  )

  .get(
    "/hackathons/:id/my-roles",
    async ({ params, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const { auth } = await import("@clerk/nextjs/server")
      const { userId } = await auth()
      if (!userId) { set.status = 401; return { error: "Not signed in" } }

      const db = await getDb()
      const { data: participants } = await db
        .from("hackathon_participants")
        .select("id, role")
        .eq("hackathon_id", params.id)
        .eq("clerk_user_id", userId)

      return { roles: (participants ?? []).map((p) => p.role) }
    },
  )

  .delete(
    "/hackathons/:id/remove-role",
    async ({ params, body, set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const { auth } = await import("@clerk/nextjs/server")
      const { userId } = await auth()
      if (!userId) { set.status = 401; return { error: "Not signed in" } }

      const db = await getDb()
      const { error } = await db
        .from("hackathon_participants")
        .delete()
        .eq("hackathon_id", params.id)
        .eq("clerk_user_id", userId)
        .eq("role", body.role)

      if (error) { set.status = 500; return { error: "Delete failed" } }
      return { removed: true, role: body.role }
    },
    {
      body: t.Object({
        role: t.Union([
          t.Literal("participant"),
          t.Literal("judge"),
          t.Literal("organizer"),
          t.Literal("mentor"),
        ]),
      }),
    }
  )

  .post(
    "/cron/transitions",
    async ({ set }) => {
      const guard = devGuard(set)
      if (guard) return guard

      const { processAutoTransitions } = await import("@/lib/services/lifecycle")
      return await processAutoTransitions()
    },
  )

async function ensureParticipant(
  db: Awaited<ReturnType<typeof getDb>>,
  hackathonId: string,
  clerkUserId: string,
  role: "participant" | "judge" = "participant",
): Promise<string> {
  const { data: existing } = await db
    .from("hackathon_participants")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .single()

  if (existing) return existing.id

  const { data } = await db
    .from("hackathon_participants")
    .insert({ hackathon_id: hackathonId, clerk_user_id: clerkUserId, role })
    .select("id")
    .single()

  return data?.id ?? ""
}
