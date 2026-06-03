import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  mockMultiTableQuery,
  mockError,
  mockSuccess,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  createSubmissionExport,
  getExportById,
  listExportsForHackathon,
  loadExportPayload,
  markExportProcessing,
  markExportReady,
  markExportFailed,
  collectExportUserIds,
  mergeExportFilters,
  DEFAULT_EXPORT_FILTERS,
} = await import("@/lib/services/submission-exports")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const USER_ID = "user_abc"
const EXPORT_ID = "22222222-2222-2222-2222-222222222222"

describe("createSubmissionExport", () => {
  beforeEach(() => resetSupabaseMocks())

  it("returns the new export id on success", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: { id: EXPORT_ID }, error: null })
    )

    const result = await createSubmissionExport(HACKATHON_ID, USER_ID, {
      winnersOnly: false,
      includeDrafts: false,
      includeJudgeNotes: true,
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.exportId).toBe(EXPORT_ID)
  })

  it("returns active_export_exists on unique-index violation (23505)", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: null,
        error: { message: "duplicate key", code: "23505" },
      })
    )

    const result = await createSubmissionExport(HACKATHON_ID, USER_ID, {
      winnersOnly: false,
      includeDrafts: false,
      includeJudgeNotes: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe("active_export_exists")
  })

  it("returns insert_failed on generic insert error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: null,
        error: { message: "boom", code: "08001" },
      })
    )

    const result = await createSubmissionExport(HACKATHON_ID, USER_ID, {
      winnersOnly: false,
      includeDrafts: false,
      includeJudgeNotes: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe("insert_failed")
  })
})

describe("getExportById", () => {
  beforeEach(() => resetSupabaseMocks())

  it("returns the row when found", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: { id: EXPORT_ID, status: "ready", hackathon_id: HACKATHON_ID },
        error: null,
      })
    )

    const row = await getExportById(EXPORT_ID)
    expect(row?.id).toBe(EXPORT_ID)
  })

  it("returns null on error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "x" } })
    )
    expect(await getExportById(EXPORT_ID)).toBeNull()
  })
})

describe("listExportsForHackathon", () => {
  beforeEach(() => resetSupabaseMocks())

  it("returns the list ordered by created_at desc", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: [
          { id: "1", status: "ready" },
          { id: "2", status: "failed" },
        ],
        error: null,
      })
    )

    const list = await listExportsForHackathon(HACKATHON_ID)
    expect(list).toHaveLength(2)
  })

  it("returns empty array on error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "x" } })
    )
    expect(await listExportsForHackathon(HACKATHON_ID)).toEqual([])
  })
})

describe("export status transitions", () => {
  beforeEach(() => resetSupabaseMocks())

  it("markExportProcessing updates status without throwing", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: null })
    )
    await markExportProcessing(EXPORT_ID)
  })

  it("markExportReady updates row with metadata", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: null })
    )
    await markExportReady(EXPORT_ID, {
      storagePath: "h/x/file.zip",
      fileSizeBytes: 1024,
      submissionCount: 5,
      expiresAt: "2026-12-31T00:00:00Z",
    })
  })

  it("markExportFailed records the error message", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: null })
    )
    await markExportFailed(EXPORT_ID, "boom")
  })
})

describe("mergeExportFilters", () => {
  it("fills missing fields with defaults", () => {
    expect(mergeExportFilters(null)).toEqual(DEFAULT_EXPORT_FILTERS)
    expect(mergeExportFilters({})).toEqual(DEFAULT_EXPORT_FILTERS)
    expect(mergeExportFilters({ winnersOnly: true })).toEqual({
      ...DEFAULT_EXPORT_FILTERS,
      winnersOnly: true,
    })
  })

  it("preserves explicitly-set falsey values", () => {
    expect(mergeExportFilters({ includeJudgeNotes: false })).toEqual({
      ...DEFAULT_EXPORT_FILTERS,
      includeJudgeNotes: false,
    })
  })
})

describe("collectExportUserIds", () => {
  it("dedupes ids across members, scorers, and note authors", () => {
    const payload = {
      hackathon: {
        id: HACKATHON_ID,
        name: "X",
        slug: "x",
        startsAt: null,
        endsAt: null,
      },
      filters: { winnersOnly: false, includeDrafts: false, includeJudgeNotes: true },
      generatedAt: "2026-01-01T00:00:00Z",
      submissions: [
        {
          id: "s1",
          title: "Proj",
          description: null,
          status: "submitted" as const,
          githubUrl: null,
          liveAppUrl: null,
          demoVideoUrl: null,
          screenshotUrl: null,
          createdAt: "2026-01-01T00:00:00Z",
          team: {
            id: "t1",
            name: "Team",
            members: [
              { clerkUserId: "u1", role: "participant" },
              { clerkUserId: "u2", role: "participant" },
            ],
          },
          result: null,
          prizes: [],
          scores: [
            { judgeClerkUserId: "u3", criteriaName: "Polish", score: 5 },
            { judgeClerkUserId: "u1", criteriaName: "Polish", score: 4 },
          ],
          judgeNotes: [{ judgeClerkUserId: "u4", notes: "nice" }],
          socialSubmissions: [],
        },
      ],
    }

    const ids = collectExportUserIds(payload)
    expect(ids.sort()).toEqual(["u1", "u2", "u3", "u4"])
  })

  it("returns empty array when payload has no users", () => {
    const payload = {
      hackathon: { id: HACKATHON_ID, name: "X", slug: "x", startsAt: null, endsAt: null },
      filters: { winnersOnly: false, includeDrafts: false, includeJudgeNotes: true },
      generatedAt: "2026-01-01T00:00:00Z",
      submissions: [],
    }
    expect(collectExportUserIds(payload)).toEqual([])
  })
})

describe("loadExportPayload loader errors", () => {
  beforeEach(() => resetSupabaseMocks())

  const baseSubmission = {
    id: "33333333-3333-3333-3333-333333333333",
    title: "Test Project",
    description: null,
    status: "submitted",
    github_url: null,
    live_app_url: null,
    demo_video_url: null,
    screenshot_url: null,
    created_at: "2026-05-27T00:00:00Z",
    team_id: "44444444-4444-4444-4444-444444444444",
    participant_id: null,
  }

  const baseExportRow = {
    id: EXPORT_ID,
    hackathon_id: HACKATHON_ID,
    filters: DEFAULT_EXPORT_FILTERS,
    status: "processing",
  }

  const baseHackathon = {
    id: HACKATHON_ID,
    name: "Test",
    slug: "test",
    starts_at: null,
    ends_at: null,
  }

  function setupBaseQueries(overrides: Record<string, ReturnType<typeof mockSuccess> | ReturnType<typeof mockError>>) {
    mockMultiTableQuery({
      submission_exports: mockSuccess(baseExportRow),
      hackathons: mockSuccess(baseHackathon),
      submissions: mockSuccess([baseSubmission]),
      teams: mockSuccess([{ id: baseSubmission.team_id, name: "Team A" }]),
      hackathon_participants: mockSuccess([]),
      hackathon_results: mockSuccess([]),
      prize_assignments: mockSuccess([]),
      judge_assignments: mockSuccess([]),
      scores: mockSuccess([]),
      judging_criteria: mockSuccess([]),
      social_media_submissions: mockSuccess([]),
      ...overrides,
    })
  }

  it("throws when loadTeams teams query fails", async () => {
    setupBaseQueries({ teams: mockError("teams db down") })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadTeams: teams query failed: teams db down/
    )
  })

  it("throws when loadTeams members query fails", async () => {
    setupBaseQueries({ hackathon_participants: mockError("members db down") })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadTeams: members query failed: members db down/
    )
  })

  it("throws when loadResults query fails", async () => {
    setupBaseQueries({ hackathon_results: mockError("results db down") })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadResults: results db down/
    )
  })

  it("throws when loadPrizeAssignments query fails", async () => {
    setupBaseQueries({ prize_assignments: mockError("prizes db down") })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadPrizeAssignments: prizes db down/
    )
  })

  it("throws when loadJudgeData assignments query fails", async () => {
    setupBaseQueries({ judge_assignments: mockError("assignments db down") })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadJudgeData: assignments query failed: assignments db down/
    )
  })

  it("throws when loadSocialSubmissions team query fails", async () => {
    setupBaseQueries({ social_media_submissions: mockError("social db down") })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadSocialSubmissions: team query failed: social db down/
    )
  })

  it("throws when loadJudgeData scores query fails", async () => {
    const assignment = {
      id: "55555555-5555-5555-5555-555555555555",
      submission_id: baseSubmission.id,
      notes: null,
      judge_participant_id: "66666666-6666-6666-6666-666666666666",
    }
    setupBaseQueries({
      judge_assignments: mockSuccess([assignment]),
      scores: mockError("scores db down"),
    })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadJudgeData: scores query failed: scores db down/
    )
  })

  it("throws when loadJudgeData judges query fails", async () => {
    const assignment = {
      id: "55555555-5555-5555-5555-555555555555",
      submission_id: baseSubmission.id,
      notes: null,
      judge_participant_id: "66666666-6666-6666-6666-666666666666",
    }
    setupBaseQueries({
      submissions: mockSuccess([{ ...baseSubmission, team_id: null }]),
      judge_assignments: mockSuccess([assignment]),
      hackathon_participants: mockError("judges db down"),
    })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadJudgeData: judges query failed: judges db down/
    )
  })

  it("throws when loadJudgeData criteria query fails", async () => {
    setupBaseQueries({
      judging_criteria: mockError("criteria db down"),
    })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadJudgeData: criteria query failed: criteria db down/
    )
  })

  it("throws when loadSocialSubmissions participant query fails", async () => {
    setupBaseQueries({
      submissions: mockSuccess([
        { ...baseSubmission, team_id: null, participant_id: "77777777-7777-7777-7777-777777777777" },
      ]),
      social_media_submissions: mockError("participant social db down"),
    })
    await expect(loadExportPayload(EXPORT_ID)).rejects.toThrow(
      /loadSocialSubmissions: participant query failed: participant social db down/
    )
  })
})
