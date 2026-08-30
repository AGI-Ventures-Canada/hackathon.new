import { beforeEach, describe, expect, it } from "bun:test"
import {
  createChainableMock,
  mockFrom,
  mockRpc,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
} from "../lib/supabase-mock"
import {
  TEST_EVENT_ATTENDEES,
  TEST_EVENT_CRITERIA,
  TEST_EVENT_JUDGES,
  TEST_EVENT_PRIZES,
  TEST_EVENT_PROJECTS,
  TEST_EVENT_ROOMS,
  TEST_EVENT_TEAMS,
} from "@/lib/fixtures/test-event"

const {
  createTestEventSandbox,
  convertTestEventToDraft,
} = await import("@/lib/services/test-event-sandbox")

const EVENT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const NOW = new Date("2026-08-30T16:00:00.000Z")

describe("test event sandbox service", () => {
  beforeEach(() => resetSupabaseMocks())

  it("replays a completed creation without adding duplicate data", async () => {
    const existing = createChainableMock({
      data: {
        id: EVENT_ID,
        name: "Launch Lab Test Event",
        slug: "launch-lab-test-event",
        is_test_event: true,
        metadata: {
          sandboxStage: "judging",
          sandboxFixtureState: "ready",
          sandboxTimeZone: "America/Toronto",
        },
        created_at: NOW.toISOString(),
      },
      error: null,
    })
    setMockFromImplementation(() => existing)

    const result = await createTestEventSandbox(
      TENANT_ID,
      "judging",
      EVENT_ID,
      "America/Toronto",
      NOW,
    )

    expect(result).toMatchObject({ id: EVENT_ID, stage: "judging", replayed: true })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(existing.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
  })

  it("does not lie when an idempotency key is reused for another stage", async () => {
    setMockFromImplementation(() => createChainableMock({
      data: {
        id: EVENT_ID,
        name: "Launch Lab Test Event",
        slug: "launch-lab-test-event",
        is_test_event: true,
        metadata: {
          sandboxStage: "registration",
          sandboxFixtureState: "ready",
          sandboxTimeZone: "UTC",
        },
        created_at: NOW.toISOString(),
      },
      error: null,
    }))

    await expect(
      createTestEventSandbox(TENANT_ID, "results", EVENT_ID, "UTC", NOW),
    ).rejects.toMatchObject({ code: "creation_conflict" })
  })

  it("reports a recent concurrent creation as still in progress", async () => {
    setMockFromImplementation(() => createChainableMock({
      data: {
        id: EVENT_ID,
        name: "Launch Lab Test Event",
        slug: "launch-lab-test-event",
        is_test_event: true,
        metadata: {
          sandboxStage: "registration",
          sandboxFixtureState: "initializing",
          sandboxStartedAt: new Date(NOW.getTime() - 10_000).toISOString(),
          sandboxTimeZone: "UTC",
        },
        created_at: NOW.toISOString(),
      },
      error: null,
    }))

    await expect(
      createTestEventSandbox(TENANT_ID, "registration", EVENT_ID, "UTC", NOW),
    ).rejects.toMatchObject({ code: "creation_in_progress" })
  })

  it("enforces the per-organization sandbox cap before inserting", async () => {
    const calls = [
      createChainableMock({ data: null, error: null }),
      createChainableMock({ data: null, error: null }),
      createChainableMock({ data: null, error: null, count: 3 }),
    ]
    let index = 0
    setMockFromImplementation(() => calls[index++] ?? calls[2])

    await expect(
      createTestEventSandbox(TENANT_ID, "registration", EVENT_ID, "UTC", NOW),
    ).rejects.toMatchObject({ code: "sandbox_limit_reached" })
  })

  it("removes stale unfinished sandboxes from the same tenant before checking the cap", async () => {
    const staleId = "33333333-3333-4333-8333-333333333333"
    const existing = createChainableMock({ data: null, error: null })
    const staleList = createChainableMock({ data: [{ id: staleId }], error: null })
    const cleanup = createChainableMock({ data: null, error: null })
    const cap = createChainableMock({ data: null, error: null, count: 3 })
    const calls = [existing, staleList, cleanup, cap]
    let index = 0
    setMockFromImplementation(() => calls[index++] ?? cap)

    await expect(
      createTestEventSandbox(TENANT_ID, "registration", EVENT_ID, "UTC", NOW),
    ).rejects.toMatchObject({ code: "sandbox_limit_reached" })

    expect(staleList.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
    expect(staleList.eq).toHaveBeenCalledWith(
      "metadata->>sandboxFixtureState",
      "initializing",
    )
    expect(cleanup.delete).toHaveBeenCalled()
    expect(cleanup.eq).toHaveBeenCalledWith("id", staleId)
    expect(cleanup.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
  })

  it("converts only a tenant-owned test event through the cleanup transaction", async () => {
    const lookup = createChainableMock({
      data: {
        id: EVENT_ID,
        slug: "launch-lab-test-event",
        name: "Launch Lab Test Event",
        is_test_event: true,
      },
      error: null,
    })
    setMockFromImplementation(() => lookup)
    setMockRpcImplementation(() => Promise.resolve({
      data: [{ id: EVENT_ID, slug: "launch-lab-test-event", name: "Launch Lab Test Event" }],
      error: null,
    }))

    const result = await convertTestEventToDraft(TENANT_ID, EVENT_ID)

    expect(result).toEqual({
      id: EVENT_ID,
      slug: "launch-lab-test-event",
      name: "Launch Lab Test Event",
      status: "draft",
      isTestEvent: false,
    })
    expect(lookup.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
    expect(mockRpc).toHaveBeenCalledWith("convert_test_event_to_draft", {
      p_hackathon_id: EVENT_ID,
      p_tenant_id: TENANT_ID,
    })
  })

  it("will not convert an ordinary event", async () => {
    setMockFromImplementation(() => createChainableMock({
      data: {
        id: EVENT_ID,
        slug: "real-event",
        name: "Real Event",
        is_test_event: false,
      },
      error: null,
    }))

    await expect(convertTestEventToDraft(TENANT_ID, EVENT_ID)).rejects.toMatchObject({
      code: "not_test_event",
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("rejects a bad creation ID before querying the database", async () => {
    await expect(
      createTestEventSandbox(TENANT_ID, "registration", "not-a-uuid", "UTC", NOW),
    ).rejects.toMatchObject({ code: "invalid_creation_id" })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("creates every rich results-stage fixture phase with coherent judging data", async () => {
    const tableCallCounts = new Map<string, number>()
    const chainsByTable = new Map<string, ReturnType<typeof createChainableMock>[]>()
    const teamRows = TEST_EVENT_TEAMS.map((name, index) => ({
      id: `team-${index}`,
      name,
      captain_clerk_user_id: TEST_EVENT_ATTENDEES[index * 3].clerkUserId,
    }))
    const submissionRows = TEST_EVENT_PROJECTS.map((project, index) => ({
      id: `submission-${index}`,
      team_id: teamRows[index].id,
      title: project.title,
    }))
    const judgeRows = TEST_EVENT_JUDGES.map((judge, index) => ({
      id: `judge-${index}`,
      clerk_user_id: judge.clerkUserId,
    }))
    const prizeRows = TEST_EVENT_PRIZES.map((prize, index) => ({
      id: `prize-${index}`,
      judging_style: prize.judgingStyle,
    }))
    const unifiedAssignments = submissionRows.flatMap((submission, submissionIndex) =>
      [0, 1, 2].map((offset, offsetIndex) => ({
        id: `weighted-${submissionIndex}-${offsetIndex}`,
        submission_id: submission.id,
        judge_participant_id: judgeRows[(submissionIndex + offset) % judgeRows.length].id,
      })),
    )
    const pickPrizeRows = prizeRows.filter((prize) => prize.judging_style === "judges_pick")
    const pickAssignments = submissionRows.flatMap((submission, submissionIndex) =>
      pickPrizeRows.map((prize, prizeIndex) => ({
        id: `pick-${submissionIndex}-${prizeIndex}`,
        submission_id: submission.id,
        judge_participant_id: judgeRows[(submissionIndex + prizeIndex) % judgeRows.length].id,
        prize_id: prize.id,
      })),
    )

    setMockFromImplementation((table) => {
      const call = (tableCallCounts.get(table) ?? 0) + 1
      tableCallCounts.set(table, call)
      let result: { data: unknown; error: null; count?: number } = { data: [{ id: `${table}-ok` }], error: null }

      if (table === "hackathons") {
        if (call === 1 || call === 4) result = { data: null, error: null }
        if (call === 2) result = { data: [], error: null }
        if (call === 3) result = { data: null, error: null, count: 0 }
        if (call === 5) {
          result = {
            data: {
              id: EVENT_ID,
              name: "Launch Lab Test Event",
              slug: "launch-lab-test-event",
            },
            error: null,
          }
        }
        if (call === 6) {
          result = {
            data: {
              id: EVENT_ID,
              name: "Launch Lab Test Event",
              slug: "launch-lab-test-event",
            },
            error: null,
          }
        }
        if (call === 7) result = { data: { id: EVENT_ID }, error: null }
      } else if (table === "challenges") {
        result = { data: [0, 1, 2].map((index) => ({ id: `challenge-${index}` })), error: null }
      } else if (table === "hackathon_schedule_items") {
        if (call <= 2) {
          result = { data: { id: `schedule-trigger-${call}` }, error: null }
        } else if (call === 3) {
          result = {
            data: Array.from({ length: 8 }, (_, index) => ({ id: `schedule-${index}` })),
            error: null,
          }
        } else {
          result = { data: null, error: null }
        }
      } else if (table === "hackathon_participants") {
        if (call === 1) {
          result = {
            data: TEST_EVENT_ATTENDEES.map((attendee, index) => ({
              id: `attendee-${index}`,
              clerk_user_id: attendee.clerkUserId,
            })),
            error: null,
          }
        } else if (call === TEST_EVENT_TEAMS.length + 2) {
          result = { data: judgeRows, error: null }
        } else {
          result = { data: null, error: null }
        }
      } else if (table === "teams") {
        result = { data: teamRows, error: null }
      } else if (table === "submissions") {
        result = { data: submissionRows, error: null }
      } else if (table === "judging_criteria") {
        result = {
          data: TEST_EVENT_CRITERIA.map((_, index) => ({ id: `criterion-${index}` })),
          error: null,
        }
      } else if (table === "prizes") {
        result = { data: prizeRows, error: null }
      } else if (table === "judge_assignments") {
        result = call === 1
          ? { data: unifiedAssignments, error: null }
          : call === 2
            ? { data: pickAssignments, error: null }
            : { data: null, error: null }
      } else if (table === "rooms") {
        result = {
          data: TEST_EVENT_ROOMS.map((_, index) => ({ id: `room-${index}` })),
          error: null,
        }
      } else if (table === "hackathon_notification_settings") {
        result = { data: null, error: null }
      }

      const chain = createChainableMock(result)
      const list = chainsByTable.get(table) ?? []
      list.push(chain)
      chainsByTable.set(table, list)
      return chain
    })

    const result = await createTestEventSandbox(
      TENANT_ID,
      "results",
      EVENT_ID,
      "America/Toronto",
      NOW,
    )

    expect(result).toMatchObject({
      id: EVENT_ID,
      stage: "results",
      replayed: false,
      counts: { attendees: 36, teams: 12, projects: 12, judges: 6 },
    })

    const insertPayloads = (table: string) =>
      (chainsByTable.get(table) ?? [])
        .filter((chain) => chain.insert.mock.calls.length > 0)
        .map((chain) => chain.insert.mock.calls[0][0] as Array<Record<string, unknown>>)
    const updatePayloads = (table: string) =>
      (chainsByTable.get(table) ?? [])
        .filter((chain) => chain.update.mock.calls.length > 0)
        .map((chain) => chain.update.mock.calls[0][0] as Record<string, unknown>)

    const teams = insertPayloads("teams")[0]
    const projects = insertPayloads("submissions")[0]
    const criteria = insertPayloads("judging_criteria")[0]
    const prizeInserts = insertPayloads("prizes")[0]
    const assignments = insertPayloads("judge_assignments").flat()
    expect(teams).toHaveLength(12)
    expect(new Set(teams.map((team) => team.invite_code)).size).toBe(12)
    expect(teams.every((team) => team.status === "forming")).toBe(true)
    expect(projects).toHaveLength(12)
    expect(projects.every((project) => project.status === "submitted")).toBe(true)
    expect(criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0)).toBe(100)
    expect(prizeInserts.filter((prize) => prize.judging_style === "judges_pick")).toHaveLength(2)
    expect(prizeInserts
      .filter((prize) => prize.judging_style === "judges_pick")
      .every((prize) => prize.max_picks === 3)).toBe(true)
    expect(assignments).toHaveLength(60)
    expect(insertPayloads("scores")[0]).toHaveLength(36 * 4)
    expect(insertPayloads("judge_picks")[0]).toHaveLength(12)
    expect(insertPayloads("crowd_votes")[0]).toHaveLength(36)
    expect(insertPayloads("hackathon_results")[0]).toHaveLength(12)
    expect(insertPayloads("prize_assignments")[0]).toHaveLength(5)
    expect(insertPayloads("hackathon_schedule_items")[0]).toHaveLength(8)
    expect(updatePayloads("hackathon_schedule_items")).toHaveLength(2)
    expect((chainsByTable.get("hackathon_schedule_items") ?? []).some(
      (chain) => chain.delete.mock.calls.length > 0,
    )).toBe(true)

    const pickAssignmentsByPrize = assignments.filter(
      (assignment) => assignment.assignment_kind === "per_prize",
    )
    for (const prize of prizeRows.filter((row) => row.judging_style === "judges_pick")) {
      expect(new Set(
        pickAssignmentsByPrize
          .filter((assignment) => assignment.prize_id === prize.id)
          .map((assignment) => assignment.submission_id),
      ).size).toBe(12)
    }
    const requiredPickLists = new Set(pickAssignmentsByPrize.map(
      (assignment) => `${assignment.judge_participant_id}:${assignment.prize_id}`,
    ))
    const completedPickLists = new Set(insertPayloads("judge_picks")[0].map(
      (pick) => `${pick.judge_participant_id}:${pick.prize_id}`,
    ))
    expect(completedPickLists).toEqual(requiredPickLists)

    const hackathonInsert = (chainsByTable.get("hackathons") ?? [])
      .find((chain) => chain.insert.mock.calls.length > 0)!
      .insert.mock.calls[0][0] as Record<string, unknown>
    const aggregateAtInsert = (hackathonInsert.metadata as Record<string, unknown>)
      .aggregate_creation as Record<string, unknown>
    expect(hackathonInsert.is_test_event).toBe(true)
    expect(hackathonInsert.name).toBe(`Launch Lab Test Event ${EVENT_ID}`)
    expect(aggregateAtInsert.state).toBe("building")
    const hackathonUpdates = updatePayloads("hackathons")
    expect(hackathonUpdates[0].name).toBe("Launch Lab Test Event")
    expect(hackathonUpdates[0]).not.toHaveProperty("timezone")
    const readyMetadata = hackathonUpdates.at(-1)!.metadata as Record<string, unknown>
    expect((readyMetadata.aggregate_creation as Record<string, unknown>).state).toBe("complete")
  })
})
