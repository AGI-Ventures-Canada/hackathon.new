import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"
import { supabase as getSupabase } from "@/lib/db/client"
import { createHackathon } from "@/lib/services/hackathons"
import { isValidUuid } from "@/lib/utils/uuid"
import {
  getTestEventSchedule,
  getTestEventCreationName,
  getTestEventStagePlan,
  getTestEventTeamInviteCode,
  getTestEventTimeline,
  isTestEventStage,
  TEST_EVENT_ANNOUNCEMENTS,
  TEST_EVENT_ATTENDEES,
  TEST_EVENT_CHALLENGES,
  TEST_EVENT_CRITERIA,
  TEST_EVENT_JUDGES,
  TEST_EVENT_NAME,
  TEST_EVENT_PERKS,
  TEST_EVENT_PRIZES,
  TEST_EVENT_PROJECTS,
  TEST_EVENT_ROOMS,
  TEST_EVENT_SPONSORS,
  TEST_EVENT_TEAMS,
  type TestEventStage,
} from "@/lib/fixtures/test-event"

type InsertResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

const STALE_TEST_EVENT_MS = 10 * 60 * 1000

function aggregateCreationMarker(
  creationId: string,
  stage: TestEventStage,
  startedAt: string,
  state: "building" | "complete",
) {
  return {
    draftId: creationId,
    contentFingerprint: `sha256:${createHash("sha256")
      .update(`${creationId}:${stage}:launch-lab-v1`)
      .digest("hex")}`,
    state,
    startedAt,
    ...(state === "complete" ? { completedAt: startedAt } : {}),
  }
}

export type TestEventSandboxResult = {
  id: string
  name: string
  slug: string
  stage: TestEventStage
  replayed: boolean
  counts: {
    attendees: number
    teams: number
    projects: number
    judges: number
    sponsors: number
    scheduleItems: number
  }
}

export class TestEventSandboxError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_creation_id"
      | "creation_in_progress"
      | "creation_conflict"
      | "sandbox_limit_reached"
      | "creation_failed"
      | "not_found"
      | "not_test_event"
      | "conversion_failed",
  ) {
    super(message)
    this.name = "TestEventSandboxError"
  }
}

function requireRows<T>(result: InsertResult<T>, label: string): T[] {
  if (result.error) {
    throw new TestEventSandboxError(`Could not add ${label}: ${result.error.message}`, "creation_failed")
  }
  return result.data ?? []
}

function summary(
  hackathon: { id: string; name: string; slug: string },
  stage: TestEventStage,
  replayed: boolean,
): TestEventSandboxResult {
  return {
    ...hackathon,
    stage,
    replayed,
    counts: {
      attendees: TEST_EVENT_ATTENDEES.length,
      teams: TEST_EVENT_TEAMS.length,
      projects: TEST_EVENT_PROJECTS.length,
      judges: TEST_EVENT_JUDGES.length,
      sponsors: TEST_EVENT_SPONSORS.length,
      scheduleItems: getTestEventSchedule(stage).length,
    },
  }
}

async function findExistingSandbox(
  client: SupabaseClient,
  tenantId: string,
  creationId: string,
  stage: TestEventStage,
  timeZone: string,
  currentTimeMs: number,
): Promise<TestEventSandboxResult | null> {
  const { data, error } = await client
    .from("hackathons")
    .select("id, name, slug, is_test_event, metadata, created_at")
    .eq("id", creationId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    throw new TestEventSandboxError("Could not check this test event.", "creation_failed")
  }
  if (!data) return null
  if (!data.is_test_event) {
    throw new TestEventSandboxError("That creation ID is already in use.", "creation_conflict")
  }
  const metadata = typeof data.metadata === "object" && data.metadata !== null && !Array.isArray(data.metadata)
    ? data.metadata as Record<string, unknown>
    : {}
  const storedStage = metadata.sandboxStage
  if (!isTestEventStage(storedStage) || storedStage !== stage) {
    throw new TestEventSandboxError(
      "That creation ID was already used for a different test stage.",
      "creation_conflict",
    )
  }
  if (metadata.sandboxTimeZone !== timeZone) {
    throw new TestEventSandboxError(
      "That creation ID was already used with a different time zone.",
      "creation_conflict",
    )
  }
  if (metadata.sandboxFixtureState !== "ready") {
    const startedAt = typeof metadata.sandboxStartedAt === "string"
      ? Date.parse(metadata.sandboxStartedAt)
      : Date.parse(data.created_at)
    if (Number.isFinite(startedAt) && currentTimeMs - startedAt < STALE_TEST_EVENT_MS) {
      throw new TestEventSandboxError(
        "This test event is already being made. Try again in a moment.",
        "creation_in_progress",
      )
    }
    return null
  }
  return summary(data, storedStage, true)
}

async function cleanupStaleSandboxes(
  client: SupabaseClient,
  tenantId: string,
  currentTimeMs: number,
): Promise<void> {
  const cutoff = new Date(currentTimeMs - STALE_TEST_EVENT_MS).toISOString()
  const { data, error } = await client
    .from("hackathons")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_test_event", true)
    .eq("metadata->>sandboxFixtureState", "initializing")
    .lt("created_at", cutoff)

  if (error) {
    throw new TestEventSandboxError("Could not check unfinished test events.", "creation_failed")
  }
  for (const row of data ?? []) {
    await cleanupFailedSandbox(client, tenantId, row.id)
  }
}

async function cleanupFailedSandbox(
  client: SupabaseClient,
  tenantId: string,
  hackathonId: string,
): Promise<void> {
  const { error } = await client
    .from("hackathons")
    .delete()
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .eq("is_test_event", true)
  if (error) {
    console.error(`Failed to remove incomplete test event ${hackathonId}:`, error)
  }
}

export async function createTestEventSandbox(
  tenantId: string,
  stage: TestEventStage,
  creationId: string,
  timeZone?: string,
  now = new Date(),
): Promise<TestEventSandboxResult> {
  if (!isValidUuid(creationId)) {
    throw new TestEventSandboxError("Use a valid creation ID.", "invalid_creation_id")
  }

  const client = getSupabase() as unknown as SupabaseClient
  const timeline = getTestEventTimeline(stage, now, timeZone)
  const stagePlan = getTestEventStagePlan(stage)
  const replay = await findExistingSandbox(
    client,
    tenantId,
    creationId,
    stage,
    timeline.timezone,
    now.getTime(),
  )
  if (replay) return replay

  await cleanupStaleSandboxes(client, tenantId, now.getTime())

  const { count: sandboxCount, error: countError } = await client
    .from("hackathons")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_test_event", true)
  if (countError) {
    throw new TestEventSandboxError("Could not check your test events.", "creation_failed")
  }
  if ((sandboxCount ?? 0) >= 3) {
    throw new TestEventSandboxError(
      "You already have three test events. Remove one or make one real first.",
      "sandbox_limit_reached",
    )
  }

  const name = TEST_EVENT_NAME
  const creationName = getTestEventCreationName(creationId)
  const created = await createHackathon(
    tenantId,
    {
      id: creationId,
      name: creationName,
      description: "A full test event with fake people, teams, projects, judges, sponsors, and schedule data. Change anything you want.",
      metadata: {
        sandboxStage: stage,
        sandboxFixture: "launch-lab-v1",
        sandboxFixtureState: "initializing",
        sandboxStartedAt: now.toISOString(),
        sandboxTimeZone: timeline.timezone,
        notificationsSuppressed: true,
        aggregate_creation: aggregateCreationMarker(
          creationId,
          stage,
          now.toISOString(),
          "building",
        ),
      },
      isTestEvent: true,
    },
    { track: false },
  )

  if (!created) {
    const existing = await findExistingSandbox(
      client,
      tenantId,
      creationId,
      stage,
      timeline.timezone,
      now.getTime(),
    )
    if (existing) return existing
    throw new TestEventSandboxError("Could not create the test event.", "creation_failed")
  }

  try {
    const { data: updated, error: updateError } = await client
      .from("hackathons")
      .update({
        name,
        is_test_event: true,
        status: timeline.status,
        phase: timeline.phase,
        starts_at: timeline.startsAt,
        ends_at: timeline.endsAt,
        registration_opens_at: timeline.registrationOpensAt,
        registration_closes_at: timeline.registrationClosesAt,
        challenge_released_at: timeline.challengeReleasedAt,
        results_published_at: timeline.resultsPublishedAt,
        rules: "1. Build during the event.\n2. Use test data only.\n3. Be kind and help other teams.\n4. Submit one project per team.",
        location_type: "hybrid",
        location_name: "Launch Lab and online",
        location_url: "https://example.com/test-event-room",
        community_url: "https://example.com/test-event-community",
        community_label: "Test event community",
        allow_late_registration: true,
        min_team_size: 1,
        max_team_size: 4,
        allow_solo: true,
        require_team_approval: true,
        anonymous_judging: true,
        judging_mode: "rubric",
        max_participants: 250,
      })
      .eq("id", created.id)
      .eq("tenant_id", tenantId)
      .select("id, name, slug")
      .single()

    if (updateError || !updated) {
      throw new TestEventSandboxError("Could not set up the test event.", "creation_failed")
    }

    requireRows(
      await client.from("hackathon_sponsors").insert(
        TEST_EVENT_SPONSORS.map((sponsor, index) => ({
          hackathon_id: created.id,
          name: sponsor.name,
          website_url: sponsor.websiteUrl,
          tier: sponsor.tier,
          custom_tier_label: sponsor.customTierLabel,
          display_order: index,
        })),
      ).select("id"),
      "sponsors",
    )

    const challenges = requireRows<{ id: string }>(
      await client.from("challenges").insert(
        TEST_EVENT_CHALLENGES.map((challenge, index) => ({
          hackathon_id: created.id,
          title: challenge.title,
          description: challenge.description,
          resources: challenge.resources,
          sort_order: index,
        })),
      ).select("id"),
      "challenges",
    )

    requireRows(
      await client.from("hackathon_schedule_items").insert(
        getTestEventSchedule(stage, now, timeline.timezone).map((item, index) => ({
          hackathon_id: created.id,
          title: item.title,
          description: item.description,
          starts_at: item.startsAt,
          ends_at: item.endsAt,
          location: item.location,
          trigger_type: item.triggerType,
          sort_order: index,
        })),
      ).select("id"),
      "schedule items",
    )

    const attendeeRows = requireRows<{ id: string; clerk_user_id: string }>(
      await client.from("hackathon_participants").insert(
        TEST_EVENT_ATTENDEES.map((attendee) => ({
          hackathon_id: created.id,
          clerk_user_id: attendee.clerkUserId,
          role: "participant",
        })),
      ).select("id, clerk_user_id"),
      "attendees",
    )
    const attendeeIds = new Map(attendeeRows.map((row) => [row.clerk_user_id, row.id]))

    const teams = requireRows<{ id: string; captain_clerk_user_id: string }>(
      await client.from("teams").insert(
        TEST_EVENT_TEAMS.map((teamName, index) => ({
          hackathon_id: created.id,
          name: teamName,
          captain_clerk_user_id: TEST_EVENT_ATTENDEES[index * 3].clerkUserId,
          invite_code: getTestEventTeamInviteCode(creationId, index),
          status: stagePlan.pendingTeamCount > 0
            ? index < TEST_EVENT_TEAMS.length - stagePlan.pendingTeamCount ? "forming" : "pending_approval"
            : "forming",
          mode: index % 3 === 0 ? "virtual" : "in_person",
        })),
      ).select("id, captain_clerk_user_id"),
      "teams",
    )

    for (let index = 0; index < teams.length; index += 1) {
      const memberIds = TEST_EVENT_ATTENDEES
        .slice(index * 3, index * 3 + 3)
        .map((attendee) => attendee.clerkUserId)
      const { error } = await client
        .from("hackathon_participants")
        .update({ team_id: teams[index].id })
        .eq("hackathon_id", created.id)
        .in("clerk_user_id", memberIds)
      if (error) {
        throw new TestEventSandboxError(`Could not add team members: ${error.message}`, "creation_failed")
      }
    }

    const submissions = requireRows<{ id: string; team_id: string }>(
      await client.from("submissions").insert(
        teams.map((team, index) => {
          const project = TEST_EVENT_PROJECTS[index]
          const isSubmitted = index < stagePlan.submittedProjectCount
          return {
            hackathon_id: created.id,
            team_id: team.id,
            participant_id: attendeeIds.get(team.captain_clerk_user_id) ?? null,
            title: project.title,
            description: project.description,
            github_url: `https://github.com/example/${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            live_app_url: `https://${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.example.com`,
            demo_video_url: "https://example.com/test-demo-video",
            status: isSubmitted ? "submitted" : "draft",
            metadata: { testData: true },
          }
        }),
      ).select("id, team_id"),
      "projects",
    )

    requireRows(
      await client.from("submission_challenges").insert(
        submissions.flatMap((submission, index) => [
          { submission_id: submission.id, challenge_id: challenges[index % challenges.length].id },
          ...(index % 4 === 0
            ? [{ submission_id: submission.id, challenge_id: challenges[(index + 1) % challenges.length].id }]
            : []),
        ]),
      ).select("submission_id"),
      "project challenges",
    )

    const criteria = requireRows<{ id: string }>(
      await client.from("judging_criteria").insert(
        TEST_EVENT_CRITERIA.map((criterion, index) => ({
          hackathon_id: created.id,
          name: criterion.name,
          description: criterion.description,
          min_score: 0,
          max_score: 5,
          weight: criterion.weight,
          category: "core",
          display_order: index,
        })),
      ).select("id"),
      "scoring criteria",
    )

    requireRows(
      await client.from("rubric_levels").insert(
        criteria.flatMap((criterion) => [
          { criteria_id: criterion.id, level_number: 1, label: "Needs work", description: "The main goal is not clear yet." },
          { criteria_id: criterion.id, level_number: 2, label: "Getting started", description: "Some parts work, but important gaps remain." },
          { criteria_id: criterion.id, level_number: 3, label: "Good", description: "The project meets the goal and the main path works." },
          { criteria_id: criterion.id, level_number: 4, label: "Very good", description: "The project works well and shows strong choices." },
          { criteria_id: criterion.id, level_number: 5, label: "Excellent", description: "The project stands out and is ready for its next step." },
        ]),
      ).select("id"),
      "score guides",
    )

    const prizes = requireRows<{ id: string; judging_style: string | null }>(
      await client.from("prizes").insert(
        TEST_EVENT_PRIZES.map((prize, index) => ({
          hackathon_id: created.id,
          name: prize.name,
          description: prize.description,
          value: prize.value,
          type: prize.type,
          rank: prize.rank,
          kind: prize.kind,
          judging_style: prize.judgingStyle,
          max_picks: prize.judgingStyle === "judges_pick" ? 3 : null,
          monetary_value: prize.kind === "cash" ? Number(prize.value.replace(/[^0-9]/g, "")) : null,
          currency: prize.kind === "cash" ? "USD" : null,
          criteria_id: prize.type === "criteria" ? criteria[index % criteria.length].id : null,
          display_order: index,
        })),
      ).select("id, judging_style"),
      "prizes",
    )

    const judgeRows = requireRows<{ id: string; clerk_user_id: string }>(
      await client.from("hackathon_participants").insert(
        TEST_EVENT_JUDGES.map((judge) => ({
          hackathon_id: created.id,
          clerk_user_id: judge.clerkUserId,
          role: "judge",
        })),
      ).select("id, clerk_user_id"),
      "judges",
    )
    const judgeIds = new Map(judgeRows.map((row) => [row.clerk_user_id, row.id]))

    requireRows(
      await client.from("hackathon_judges_display").insert(
        TEST_EVENT_JUDGES.map((judge, index) => ({
          hackathon_id: created.id,
          name: judge.name,
          title: judge.title,
          organization: judge.organization,
          clerk_user_id: judge.clerkUserId,
          participant_id: judgeIds.get(judge.clerkUserId) ?? null,
          display_order: index,
        })),
      ).select("id"),
      "judge profiles",
    )

    requireRows(
      await client.from("judge_prize_assignments").insert(
        judgeRows.flatMap((judge) => prizes.map((prize) => ({
          hackathon_id: created.id,
          judge_participant_id: judge.id,
          prize_id: prize.id,
        }))),
      ).select("id"),
      "judge prize assignments",
    )

    const assignments = stagePlan.weightedAssignmentCount > 0
      ? requireRows<{ id: string; submission_id: string }>(
          await client.from("judge_assignments").insert(
            submissions.slice(0, stagePlan.submittedProjectCount).flatMap((submission, submissionIndex) => [0, 1, 2].map((offset) => ({
              hackathon_id: created.id,
              judge_participant_id: judgeRows[(submissionIndex + offset) % judgeRows.length].id,
              submission_id: submission.id,
              prize_id: null,
              assignment_kind: "unified_weighted_score",
            }))),
          ).select("id, submission_id"),
          "judge assignments",
        )
      : []

    const judgePickPrizes = prizes.filter((prize) => prize.judging_style === "judges_pick")
    const pickAssignments = stagePlan.pickAssignmentCount > 0
      ? requireRows<{
          id: string
          submission_id: string
          judge_participant_id: string
          prize_id: string
        }>(
          await client.from("judge_assignments").insert(
            submissions.flatMap((submission, submissionIndex) =>
              judgePickPrizes.map((prize, prizeIndex) => ({
                hackathon_id: created.id,
                judge_participant_id: judgeRows[
                  (submissionIndex + prizeIndex) % judgeRows.length
                ].id,
                submission_id: submission.id,
                prize_id: prize.id,
                assignment_kind: "per_prize",
              })),
            ),
          ).select("id, submission_id, judge_participant_id, prize_id"),
          "judge pick assignments",
        )
      : []

    const pickLists = [...new Map(
      pickAssignments.map((assignment) => [
        `${assignment.judge_participant_id}:${assignment.prize_id}`,
        assignment,
      ]),
    ).values()]
    const completedPickListCount = stage === "results"
      ? pickLists.length
      : stage === "judging"
        ? Math.ceil(pickLists.length / 2)
        : 0
    if (completedPickListCount > 0) {
      requireRows(
        await client.from("judge_picks").insert(
          pickLists.slice(0, completedPickListCount).map((assignment) => ({
            hackathon_id: created.id,
            judge_participant_id: assignment.judge_participant_id,
            prize_id: assignment.prize_id,
            submission_id: assignment.submission_id,
            rank: 1,
            reason: "Strong test project with a clear demo.",
          })),
        ).select("id"),
        "judge picks",
      )
    }

    const crowdPrize = prizes.find((prize) => prize.judging_style === "crowd_vote")
    if ((stage === "judging" || stage === "results") && crowdPrize) {
      requireRows(
        await client.from("crowd_votes").insert(
          TEST_EVENT_ATTENDEES.map((attendee, index) => ({
            hackathon_id: created.id,
            prize_id: crowdPrize.id,
            submission_id: index < 20
              ? submissions[4].id
              : submissions[(index + 1) % submissions.length].id,
            clerk_user_id: attendee.clerkUserId,
          })),
        ).select("id"),
        "people's choice votes",
      )
    }

    const scoredCount = stagePlan.scoredAssignmentCount
    if (scoredCount > 0) {
      requireRows(
        await client.from("scores").insert(
          assignments.slice(0, scoredCount).flatMap((assignment, assignmentIndex) =>
            criteria.map((criterion, criterionIndex) => ({
              judge_assignment_id: assignment.id,
              criteria_id: criterion.id,
              score: 1 + ((assignmentIndex + criterionIndex * 2) % 5),
            })),
          ),
        ).select("id"),
        "scores",
      )
      const completedAt = now.toISOString()
      const completedIds = assignments.slice(0, scoredCount).map((assignment) => assignment.id)
      const { error } = await client
        .from("judge_assignments")
        .update({ is_complete: true, completed_at: completedAt, notes: "Test scorecard complete." })
        .in("id", completedIds)
      if (error) {
        throw new TestEventSandboxError(`Could not finish test scorecards: ${error.message}`, "creation_failed")
      }
    }

    if (stage === "results") {
      const weightSum = TEST_EVENT_CRITERIA.reduce((sum, criterion) => sum + criterion.weight, 0)
      const scoresBySubmission = new Map<string, { weightedSum: number; judgeCount: number }>()
      assignments.forEach((assignment, assignmentIndex) => {
        const current = scoresBySubmission.get(assignment.submission_id) ?? {
          weightedSum: 0,
          judgeCount: 0,
        }
        current.judgeCount += 1
        current.weightedSum += TEST_EVENT_CRITERIA.reduce((sum, criterion, criterionIndex) => {
          const score = 1 + ((assignmentIndex + criterionIndex * 2) % 5)
          return sum + (score / 5) * criterion.weight
        }, 0)
        scoresBySubmission.set(assignment.submission_id, current)
      })
      const rankedResults = submissions
        .map((submission) => {
          const aggregate = scoresBySubmission.get(submission.id) ?? { weightedSum: 0, judgeCount: 0 }
          const totalScore = aggregate.judgeCount > 0
            ? aggregate.weightedSum / aggregate.judgeCount
            : 0
          return {
            submission,
            totalScore,
            weightedScore: weightSum > 0 ? totalScore / weightSum : 0,
            judgeCount: aggregate.judgeCount,
          }
        })
        .sort((a, b) => b.weightedScore - a.weightedScore)
      let currentRank = 1
      const rows = rankedResults.map((result, index) => {
        if (index > 0 && result.weightedScore < rankedResults[index - 1].weightedScore) {
          currentRank = index + 1
        }
        return {
          hackathon_id: created.id,
          submission_id: result.submission.id,
          rank: currentRank,
          total_score: result.totalScore,
          weighted_score: result.weightedScore,
          judge_count: result.judgeCount,
          published_at: timeline.resultsPublishedAt,
          result_kind: "core_only",
        }
      })
      requireRows(
        await client.from("hackathon_results").insert(rows).select("id"),
        "results",
      )
      requireRows(
        await client.from("prize_assignments").insert([
          { prize_id: prizes[0].id, submission_id: rankedResults[0].submission.id },
          { prize_id: prizes[1].id, submission_id: rankedResults[1].submission.id },
          { prize_id: prizes[2].id, submission_id: rankedResults[2].submission.id },
          { prize_id: prizes[3].id, submission_id: rankedResults[3].submission.id },
          { prize_id: prizes[4].id, submission_id: submissions[4].id },
        ]).select("id"),
        "winners",
      )
    }

    const rooms = requireRows<{ id: string }>(
      await client.from("rooms").insert(
        TEST_EVENT_ROOMS.map((room, index) => ({
          hackathon_id: created.id,
          name: room,
          display_order: index,
        })),
      ).select("id"),
      "rooms",
    )
    requireRows(
      await client.from("room_teams").insert(
        teams.map((team, index) => ({
          room_id: rooms[index % rooms.length].id,
          team_id: team.id,
          present_order: Math.floor(index / rooms.length) + 1,
          has_presented: stage === "results",
        })),
      ).select("id"),
      "room assignments",
    )

    requireRows(
      await client.from("hackathon_perks").insert(
        TEST_EVENT_PERKS.map((perk, index) => ({
          hackathon_id: created.id,
          name: perk.name,
          description: perk.description,
          type: perk.type,
          code: perk.code,
          instructions: "This is a test perk. Do not use it outside this test event.",
          released_at: stage === "registration" ? null : now.toISOString(),
          sort_order: index,
        })),
      ).select("id"),
      "perks",
    )

    requireRows(
      await client.from("hackathon_announcements").insert(
        TEST_EVENT_ANNOUNCEMENTS.map((announcement) => ({
          hackathon_id: created.id,
          title: announcement.title,
          body: announcement.body,
          priority: announcement.priority,
          audience: announcement.audience,
          published_at: now.toISOString(),
        })),
      ).select("id"),
      "announcements",
    )

    const openMentorStatuses = ["open", "open", "claimed", "resolved", "open"] as const
    requireRows(
      await client.from("mentor_requests").insert(
        attendeeRows.slice(0, 5).map((attendee, index) => ({
          hackathon_id: created.id,
          requester_participant_id: attendee.id,
          team_id: teams[Math.floor(index / 3)].id,
          category: ["Product", "AI", "Design", "Backend", "Demo"][index],
          description: [
            "Can someone review our main user flow?",
            "We need help choosing a simple model setup.",
            "Can someone check our mobile layout?",
            "Our data update is slower than expected.",
            "We want feedback on our two-minute demo.",
          ][index],
          status: openMentorStatuses[index],
        })),
      ).select("id"),
      "mentor requests",
    )

    const { error: settingsError } = await client
      .from("hackathon_notification_settings")
      .upsert({
        hackathon_id: created.id,
        email_on_registration_open: false,
        email_on_hackathon_active: false,
        email_on_judging_started: false,
        email_on_results_published: false,
        email_on_challenges_released: false,
      }, { onConflict: "hackathon_id" })
    if (settingsError) {
      throw new TestEventSandboxError(`Could not turn off test emails: ${settingsError.message}`, "creation_failed")
    }

    const { data: ready, error: readyError } = await client
      .from("hackathons")
      .update({
        metadata: {
          sandboxStage: stage,
          sandboxFixture: "launch-lab-v1",
          sandboxFixtureState: "ready",
          sandboxStartedAt: now.toISOString(),
          sandboxTimeZone: timeline.timezone,
          notificationsSuppressed: true,
          aggregate_creation: aggregateCreationMarker(
            creationId,
            stage,
            now.toISOString(),
            "complete",
          ),
        },
      })
      .eq("id", created.id)
      .eq("tenant_id", tenantId)
      .eq("is_test_event", true)
      .select("id")
      .single()
    if (readyError || !ready) {
      throw new TestEventSandboxError("Could not finish the test event.", "creation_failed")
    }

    return summary(updated, stage, false)
  } catch (error) {
    await cleanupFailedSandbox(client, tenantId, created.id)
    if (error instanceof TestEventSandboxError) throw error
    throw new TestEventSandboxError("Could not finish the test event.", "creation_failed")
  }
}

export async function convertTestEventToDraft(
  tenantId: string,
  hackathonId: string,
): Promise<{ id: string; slug: string; name: string; status: "draft"; isTestEvent: false }> {
  if (!isValidUuid(hackathonId)) {
    throw new TestEventSandboxError("Test event not found.", "not_found")
  }
  const client = getSupabase() as unknown as SupabaseClient
  const { data: hackathon, error } = await client
    .from("hackathons")
    .select("id, slug, name, is_test_event")
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error || !hackathon) {
    throw new TestEventSandboxError("Test event not found.", "not_found")
  }
  if (!hackathon.is_test_event) {
    throw new TestEventSandboxError("This event is already a real event.", "not_test_event")
  }

  const { data, error: conversionError } = await client.rpc(
    "convert_test_event_to_draft",
    { p_hackathon_id: hackathonId, p_tenant_id: tenantId },
  )
  const updated = Array.isArray(data) ? data[0] : data
  if (conversionError || !updated) {
    throw new TestEventSandboxError("Could not turn this into a real draft.", "conversion_failed")
  }
  return { ...updated, status: "draft", isTestEvent: false }
}
