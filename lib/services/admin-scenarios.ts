import { supabase as getSupabase } from "@/lib/db/client"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { getOrCreateTenant } from "@/lib/services/tenants"
import { getSeedUserIds, findPersonaByUserId, getPersonaUserId } from "@/lib/dev/test-personas"
import { SCENARIOS } from "@/lib/dev/scenarios"

export type ScenarioOptions = Record<string, boolean>

export function listScenarios() {
  return SCENARIOS.map((s) => ({ name: s.name, label: s.label, description: s.description }))
}

function getSeedUsers(): string[] {
  const real = getSeedUserIds()
  if (real.length > 0) return real
  return [
    "seed_user_alice_001",
    "seed_user_bob_002",
    "seed_user_carol_003",
    "seed_user_dave_004",
    "seed_user_eve_005",
  ]
}

async function resolveScenarioTenant(overrideTenantId?: string, principalOrgId?: string | null): Promise<string> {
  if (overrideTenantId) {
    const db = getSupabase()
    const { data: existing } = await db
      .from("tenants")
      .select("id")
      .eq("id", overrideTenantId)
      .single()

    if (!existing) {
      throw new Error(`Tenant not found: ${overrideTenantId}`)
    }
    return overrideTenantId
  }

  const orgId = principalOrgId || process.env.SCENARIO_ORG_ID
  if (!orgId) {
    throw new Error("SCENARIO_ORG_ID environment variable is required to run scenarios (or sign in with an active org)")
  }

  const tenant = await getOrCreateTenant(orgId, "Test Organizer")
  if (!tenant) {
    throw new Error("Failed to create scenario tenant")
  }
  return tenant.id
}

function uniqueSlug(base: string): string {
  return `${base}-${Date.now().toString(36)}`
}

async function createTestHackathon(opts: {
  tenantId: string
  slug: string
  name: string
  status: HackathonStatus
  startsAt: Date
  endsAt: Date
  registrationOpensAt?: Date
  registrationClosesAt?: Date
  anonymousJudging?: boolean
  resultsPublishedAt?: string | null
}): Promise<string> {
  const db = getSupabase()

  const { data, error } = await db
    .from("hackathons")
    .insert({
      tenant_id: opts.tenantId,
      name: opts.name,
      slug: opts.slug,
      description: `Test hackathon for the **${opts.slug}** scenario.`,
      status: opts.status,
      starts_at: opts.startsAt.toISOString(),
      ends_at: opts.endsAt.toISOString(),
      registration_opens_at: (opts.registrationOpensAt ?? new Date(Date.now() - 14 * 86400000)).toISOString(),
      registration_closes_at: (opts.registrationClosesAt ?? opts.startsAt).toISOString(),
      min_team_size: 1,
      max_team_size: 4,
      allow_solo: true,
      anonymous_judging: opts.anonymousJudging ?? false,
      results_published_at: opts.resultsPublishedAt ?? null,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Failed to create hackathon: ${error?.message}`)
  }

  return data.id
}

async function registerParticipant(
  hackathonId: string,
  clerkUserId: string,
  role: "participant" | "judge" = "participant"
): Promise<string> {
  const db = getSupabase()

  const { data: existing } = await db
    .from("hackathon_participants")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .single()

  if (existing) return existing.id

  const { data, error } = await db
    .from("hackathon_participants")
    .insert({ hackathon_id: hackathonId, clerk_user_id: clerkUserId, role })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Failed to register participant: ${error?.message}`)
  }

  return data.id
}

async function createTeamWithMembers(
  hackathonId: string,
  captainUserId: string,
  memberUserIds: string[]
): Promise<string> {
  const db = getSupabase()

  const { data: team, error } = await db
    .from("teams")
    .insert({
      hackathon_id: hackathonId,
      name: `Team ${captainUserId.slice(-3)}`,
      captain_clerk_user_id: captainUserId,
      invite_code: crypto.randomUUID().slice(0, 8),
      status: "forming",
    })
    .select("id")
    .single()

  if (error || !team) {
    throw new Error(`Failed to create team: ${error?.message}`)
  }

  const captainPid = await registerParticipant(hackathonId, captainUserId)
  await db.from("hackathon_participants").update({ team_id: team.id }).eq("id", captainPid)

  for (const userId of memberUserIds) {
    const pid = await registerParticipant(hackathonId, userId)
    await db.from("hackathon_participants").update({ team_id: team.id }).eq("id", pid)
  }

  return team.id
}

async function createSubmission(
  hackathonId: string,
  teamId: string,
  participantId: string,
  index: number = 0
): Promise<string> {
  const db = getSupabase()
  const titles = ["AI Research Assistant", "Code Reviewer Bot", "DataViz Agent", "HealthCheck AI", "EcoTracker"]
  const title = titles[index % titles.length]

  const { data, error } = await db
    .from("submissions")
    .insert({
      hackathon_id: hackathonId,
      team_id: teamId,
      participant_id: participantId,
      title,
      description: `Test submission: ${title}`,
      github_url: `https://github.com/example/${title.toLowerCase().replace(/\s+/g, "-")}`,
      status: "submitted",
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Failed to create submission: ${error?.message}`)
  }

  return data.id
}

const CRITERIA_PRESETS = [
  { name: "Innovation", description: "Novelty and creativity of the solution", max_score: 10, weight: 1.5, category: "core" as const },
  { name: "Technical Execution", description: "Code quality, architecture, and reliability", max_score: 10, weight: 1.0, category: "core" as const },
  { name: "Presentation", description: "Demo clarity, documentation, and communication", max_score: 10, weight: 0.5, category: "bonus" as const },
]

const DEFAULT_RUBRIC_LEVELS = [
  { level_number: 1, label: "Far Below Expectations" },
  { level_number: 2, label: "Below Expectations" },
  { level_number: 3, label: "Meets Expectations" },
  { level_number: 4, label: "Exceeds Expectations" },
  { level_number: 5, label: "Far Exceeds Expectations" },
]

async function addJudgingCriteria(hackathonId: string): Promise<string[]> {
  const db = getSupabase()

  const ids: string[] = []
  for (let i = 0; i < CRITERIA_PRESETS.length; i++) {
    const c = CRITERIA_PRESETS[i]
    const { data, error } = await db
      .from("judging_criteria")
      .insert({
        hackathon_id: hackathonId,
        name: c.name,
        description: c.description,
        max_score: c.max_score,
        weight: c.weight,
        display_order: i,
        category: c.category,
      })
      .select("id")
      .single()

    if (error || !data) throw new Error(`Failed to create criteria: ${error?.message}`)
    ids.push(data.id)

    for (const level of DEFAULT_RUBRIC_LEVELS) {
      await db.from("rubric_levels").insert({
        criteria_id: data.id,
        level_number: level.level_number,
        label: level.label,
      })
    }
  }

  return ids
}

const scenarioRunners: Record<string, (tenantId?: string, principalOrgId?: string | null, options?: ScenarioOptions) => Promise<{ hackathonId: string; slug: string; tenantId: string }>> = {
  "pre-registration": async (overrideTenantId, principalOrgId) => {
    const tenantId = await resolveScenarioTenant(overrideTenantId, principalOrgId)
    const now = new Date()
    const slug = uniqueSlug("test-pre-registration")
    const hackathonId = await createTestHackathon({
      tenantId,
      slug,
      name: "Pre-Registration Test Hackathon",
      status: "published",
      startsAt: new Date(now.getTime() + 7 * 86400000),
      endsAt: new Date(now.getTime() + 9 * 86400000),
      registrationOpensAt: new Date(now.getTime() + 1 * 86400000),
      registrationClosesAt: new Date(now.getTime() + 6 * 86400000),
    })
    return { hackathonId, slug, tenantId }
  },

  "registered-no-team": async (overrideTenantId, principalOrgId) => {
    const tenantId = await resolveScenarioTenant(overrideTenantId, principalOrgId)
    const now = new Date()
    const slug = uniqueSlug("test-registered-no-team")
    const hackathonId = await createTestHackathon({
      tenantId,
      slug,
      name: "Registered (No Team) Test Hackathon",
      status: "active",
      startsAt: new Date(now.getTime() - 1 * 86400000),
      endsAt: new Date(now.getTime() + 7 * 86400000),
    })
    const seedUsers = getSeedUsers()
    await registerParticipant(hackathonId, seedUsers[0])
    return { hackathonId, slug, tenantId }
  },

  "team-formed": async (overrideTenantId, principalOrgId) => {
    const tenantId = await resolveScenarioTenant(overrideTenantId, principalOrgId)
    const now = new Date()
    const slug = uniqueSlug("test-team-formed")
    const hackathonId = await createTestHackathon({
      tenantId,
      slug,
      name: "Team Formed Test Hackathon",
      status: "active",
      startsAt: new Date(now.getTime() - 2 * 86400000),
      endsAt: new Date(now.getTime() + 5 * 86400000),
    })
    const seedUsers = getSeedUsers()
    await createTeamWithMembers(hackathonId, seedUsers[0], [seedUsers[1], seedUsers[2]])
    return { hackathonId, slug, tenantId }
  },

  "submitted": async (overrideTenantId, principalOrgId, options) => {
    const tenantId = await resolveScenarioTenant(overrideTenantId, principalOrgId)
    const db = getSupabase()
    const now = new Date()
    const slug = uniqueSlug("test-submitted")
    const hackathonId = await createTestHackathon({
      tenantId,
      slug,
      name: "Submitted Test Hackathon",
      status: "active",
      startsAt: new Date(now.getTime() - 5 * 86400000),
      endsAt: new Date(now.getTime() + 2 * 86400000),
    })
    const seedUsers = getSeedUsers()
    const teamId = await createTeamWithMembers(hackathonId, seedUsers[0], [seedUsers[1]])
    const pid = await registerParticipant(hackathonId, seedUsers[0])
    const submissionId = await createSubmission(hackathonId, teamId, pid, 0)

    if (options?.criteria || options?.preJudge) {
      const criteriaIds = await addJudgingCriteria(hackathonId)

      if (options?.preJudge) {
        const judgeUserIds = [seedUsers[2], seedUsers[3], seedUsers[4]]
        for (const userId of judgeUserIds) {
          const judgePid = await registerParticipant(hackathonId, userId, "judge")
          const { data: assignment } = await db
            .from("judge_assignments")
            .insert({
              hackathon_id: hackathonId,
              judge_participant_id: judgePid,
              submission_id: submissionId,
            })
            .select("id")
            .single()

          if (assignment) {
            for (const criteriaId of criteriaIds) {
              await db.from("scores").insert({
                judge_assignment_id: assignment.id,
                criteria_id: criteriaId,
                score: Math.floor(Math.random() * 8) + 3,
              })
            }
            await db.from("judge_assignments").update({
              is_complete: true,
              completed_at: new Date().toISOString(),
              notes: "Scored via admin scenario runner.",
            }).eq("id", assignment.id)
          }
        }

        await db.rpc("calculate_results", { p_hackathon_id: hackathonId })
        await db.from("hackathons").update({ status: "judging" }).eq("id", hackathonId)
      }
    }

    return { hackathonId, slug, tenantId }
  },

  "judging": async (overrideTenantId, principalOrgId, options) => {
    const tenantId = await resolveScenarioTenant(overrideTenantId, principalOrgId)
    const db = getSupabase()
    const now = new Date()
    const slug = uniqueSlug("test-judging")
    const hackathonId = await createTestHackathon({
      tenantId,
      slug,
      name: "Judging Test Hackathon",
      status: "judging",
      startsAt: new Date(now.getTime() - 3 * 86400000),
      endsAt: new Date(now.getTime() - 1 * 86400000),
    })

    const seedUsers = getSeedUsers()
    const submissions: string[] = []

    for (let i = 0; i < 5; i++) {
      const teamId = await createTeamWithMembers(hackathonId, seedUsers[i], [])
      const pid = await registerParticipant(hackathonId, seedUsers[i])
      const subId = await createSubmission(hackathonId, teamId, pid, i)
      submissions.push(subId)
    }

    const judgeUsers = [seedUsers[0], seedUsers[1], seedUsers[2]]
    const judgeParticipantIds: string[] = []
    const judgeTeamIds: Record<string, string> = {}

    for (const userId of judgeUsers) {
      const { data: p } = await db
        .from("hackathon_participants")
        .select("id, team_id")
        .eq("hackathon_id", hackathonId)
        .eq("clerk_user_id", userId)
        .single()
      if (p) {
        await db.from("hackathon_participants").update({ role: "judge" }).eq("id", p.id)
        judgeParticipantIds.push(p.id)
        if (p.team_id) judgeTeamIds[p.id] = p.team_id
      }
    }

    await addJudgingCriteria(hackathonId)

    const judgeDisplayNames = ["Alice Johnson", "Bob Chen", "Carol Davis"]
    await db.from("hackathon_judges_display").delete().eq("hackathon_id", hackathonId)
    for (let i = 0; i < judgeParticipantIds.length; i++) {
      await db.from("hackathon_judges_display").insert({
        hackathon_id: hackathonId,
        name: judgeDisplayNames[i] ?? `Judge ${i + 1}`,
        title: "Judge",
        clerk_user_id: judgeUsers[i],
        participant_id: judgeParticipantIds[i],
        display_order: i,
      })
    }

    for (const judgeId of judgeParticipantIds) {
      const judgeTeamId = judgeTeamIds[judgeId]
      for (const subId of submissions) {
        const { data: sub } = await db.from("submissions").select("team_id").eq("id", subId).single()
        if (sub?.team_id === judgeTeamId) continue
        await db.from("judge_assignments").insert({
          hackathon_id: hackathonId,
          judge_participant_id: judgeId,
          submission_id: subId,
        })
      }
    }

    if (options?.preJudge) {
      const { data: assignments } = await db
        .from("judge_assignments")
        .select("id")
        .eq("hackathon_id", hackathonId)

      const { data: criteria } = await db
        .from("judging_criteria")
        .select("id")
        .eq("hackathon_id", hackathonId)

      if (assignments && criteria) {
        for (const a of assignments) {
          for (const c of criteria) {
            await db.from("scores").insert({
              judge_assignment_id: a.id,
              criteria_id: c.id,
              score: Math.floor(Math.random() * 8) + 3,
            })
          }
          await db.from("judge_assignments").update({
            is_complete: true,
            completed_at: new Date().toISOString(),
            notes: "Scored via admin scenario runner.",
          }).eq("id", a.id)
        }
      }

      await db.rpc("calculate_results", { p_hackathon_id: hackathonId })
    }

    return { hackathonId, slug, tenantId }
  },

  "judging-in-progress": async (overrideTenantId, principalOrgId) => {
    const result = await scenarioRunners["judging"](overrideTenantId, principalOrgId)
    const db = getSupabase()
    const slug = uniqueSlug("test-judging-in-progress")

    await db.from("hackathons").update({ slug, name: "Judging In Progress Test Hackathon" }).eq("id", result.hackathonId)

    const { data: assignments } = await db
      .from("judge_assignments")
      .select("id")
      .eq("hackathon_id", result.hackathonId)

    const { data: criteria } = await db
      .from("judging_criteria")
      .select("id")
      .eq("hackathon_id", result.hackathonId)

    if (assignments && criteria) {
      const toScore = assignments.slice(0, Math.floor(assignments.length * 0.6))
      for (const a of toScore) {
        for (const c of criteria) {
          await db.from("scores").insert({
            judge_assignment_id: a.id,
            criteria_id: c.id,
            score: Math.floor(Math.random() * 8) + 3,
          })
        }
        await db.from("judge_assignments").update({
          is_complete: true,
          completed_at: new Date().toISOString(),
          notes: "Scored via admin scenario runner.",
        }).eq("id", a.id)
      }
    }

    const { data: ipCriteria } = await db
      .from("judging_criteria")
      .select("id")
      .eq("hackathon_id", result.hackathonId)
      .order("display_order")

    const ipFirstCriteriaId = ipCriteria?.[0]?.id ?? null

    const ipPrizes = [
      { name: "Grand Prize", description: "Best overall project", value: "$10,000", type: "score" as const, rank: 1, kind: "cash", judging_style: "bucket_sort", monetary_value: 10000, currency: "USD", display_order: 0 },
      { name: "Runner Up", description: "Second place", value: "Swag Pack", type: "score" as const, rank: 2, kind: "swag", judging_style: "bucket_sort", display_order: 1 },
      { name: "Innovation Award", description: "Most creative solution", value: "$500 API Credits", type: "criteria" as const, criteria_id: ipFirstCriteriaId, kind: "credit", judging_style: "judges_pick", display_order: 2 },
    ]

    for (const prize of ipPrizes) {
      await db.from("prizes").insert({
        hackathon_id: result.hackathonId,
        ...prize,
      })
    }

    return { hackathonId: result.hackathonId, slug, tenantId: result.tenantId }
  },

  "results-ready": async (overrideTenantId, principalOrgId) => {
    const result = await scenarioRunners["judging"](overrideTenantId, principalOrgId)
    const db = getSupabase()
    const slug = uniqueSlug("test-results-ready")

    await db.from("hackathons").update({ slug, name: "Results Ready Test Hackathon" }).eq("id", result.hackathonId)

    const { data: assignments } = await db
      .from("judge_assignments")
      .select("id")
      .eq("hackathon_id", result.hackathonId)

    const { data: criteria } = await db
      .from("judging_criteria")
      .select("id")
      .eq("hackathon_id", result.hackathonId)

    if (assignments && criteria) {
      for (const a of assignments) {
        for (const c of criteria) {
          await db.from("scores").insert({
            judge_assignment_id: a.id,
            criteria_id: c.id,
            score: Math.floor(Math.random() * 8) + 3,
          })
        }
        await db.from("judge_assignments").update({
          is_complete: true,
          completed_at: new Date().toISOString(),
          notes: "Scored via admin scenario runner.",
        }).eq("id", a.id)
      }
    }

    await db.rpc("calculate_results", { p_hackathon_id: result.hackathonId })

    const { data: criteriaRows } = await db
      .from("judging_criteria")
      .select("id")
      .eq("hackathon_id", result.hackathonId)
      .order("display_order")

    const firstCriteriaId = criteriaRows?.[0]?.id ?? null

    const prizes = [
      { name: "Grand Prize", description: "Best overall project", value: "$10,000", type: "score" as const, rank: 1, kind: "cash", judging_style: "bucket_sort", monetary_value: 10000, currency: "USD", display_order: 0 },
      { name: "Runner Up", description: "Second place", value: "Swag Pack", type: "score" as const, rank: 2, kind: "swag", judging_style: "bucket_sort", display_order: 1 },
      { name: "Innovation Award", description: "Most creative solution", value: "$500 API Credits", type: "criteria" as const, criteria_id: firstCriteriaId, kind: "credit", judging_style: "judges_pick", display_order: 2 },
    ]

    for (const prize of prizes) {
      await db.from("prizes").insert({
        hackathon_id: result.hackathonId,
        ...prize,
      })
    }

    const { autoAssignPrizes } = await import("@/lib/services/prizes")
    await autoAssignPrizes(result.hackathonId)

    const { initializeFulfillments } = await import("@/lib/services/prize-fulfillment")
    await initializeFulfillments(result.hackathonId)

    return { hackathonId: result.hackathonId, slug, tenantId: result.tenantId }
  },
}

export type ActiveScenario = {
  scenarioName: string
  hackathonId: string
  slug: string
  createdAt: string
}

export async function getActiveScenarios(): Promise<ActiveScenario[]> {
  const db = getSupabase()

  const { data } = await db
    .from("hackathons")
    .select("id, slug, created_at")
    .like("slug", "test-%")
    .order("created_at", { ascending: false })

  if (!data) return []

  const results: ActiveScenario[] = []

  for (const scenario of SCENARIOS) {
    const prefix = `test-${scenario.name}-`
    const match = data.find((h) => {
      if (!h.slug.startsWith(prefix)) return false
      const suffix = h.slug.slice(prefix.length)
      return /^[0-9a-z]+$/.test(suffix)
    })

    if (match) {
      results.push({
        scenarioName: scenario.name,
        hackathonId: match.id,
        slug: match.slug,
        createdAt: match.created_at,
      })
    }
  }

  return results
}

async function clearScenario(name: string): Promise<void> {
  const db = getSupabase()
  const prefix = `test-${name}-`
  const { data } = await db
    .from("hackathons")
    .select("id")
    .like("slug", `${prefix}%`)

  if (!data?.length) return

  for (const { id } of data) {
    await db.from("hackathons").delete().eq("id", id)
  }
}

export async function runScenario(name: string, tenantId?: string, principalOrgId?: string | null, options?: ScenarioOptions): Promise<{ hackathonId: string; slug: string; tenantId: string }> {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Test scenarios can only be run in local development or staging")
  }

  const runner = scenarioRunners[name]
  if (!runner) {
    throw new Error(`Unknown scenario: ${name}. Available: ${SCENARIOS.map(s => s.name).join(", ")}`)
  }

  await clearScenario(name)
  return runner(tenantId, principalOrgId, options)
}

export type RoleCard = {
  personaKey: string
  name: string
  role: string
  loginUrl: string
  directUrl: string
}

export async function generateRoleTokens(hackathonId: string, slug: string): Promise<RoleCard[]> {
  const db = getSupabase()

  const { data: participants } = await db
    .from("hackathon_participants")
    .select("clerk_user_id, role, team_id")
    .eq("hackathon_id", hackathonId)

  if (!participants?.length) return []

  const organizerUserId = getPersonaUserId("organizer")
  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()

  const eligible = participants.flatMap((p) => {
    if (p.clerk_user_id === organizerUserId) return []
    const persona = findPersonaByUserId(p.clerk_user_id)
    if (!persona) return []
    return [{ p, persona }]
  })

  const cards: RoleCard[] = await Promise.all(
    eligible.map(async ({ p, persona }) => {
      const token = await clerk.signInTokens.createSignInToken({
        userId: p.clerk_user_id,
        expiresInSeconds: 300,
      })
      const directUrl = p.role === "judge" ? `/e/${slug}/judge` : `/e/${slug}`
      const loginUrl = `/dev-switch?token=${token.token}&redirect=${encodeURIComponent(directUrl)}`
      return { personaKey: persona.key, name: persona.name, role: p.role, loginUrl, directUrl }
    })
  )

  if (organizerUserId) {
    const persona = findPersonaByUserId(organizerUserId)
    if (persona) {
      const token = await clerk.signInTokens.createSignInToken({
        userId: organizerUserId,
        expiresInSeconds: 300,
      })
      const directUrl = `/e/${slug}/manage`
      cards.push({
        personaKey: persona.key,
        name: persona.name,
        role: "organizer",
        loginUrl: `/dev-switch?token=${token.token}&redirect=${encodeURIComponent(directUrl)}`,
        directUrl,
      })
    }
  }

  return cards
}
