import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockTableQuery,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const mockDispatchChallengesReleased = mock(() => Promise.resolve())
mock.module("@/lib/services/notification-dispatcher", () => ({
  dispatchChallengesReleasedNotifications: mockDispatchChallengesReleased,
}))

const {
  listChallenges,
  getChallengeById,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  reorderChallenges,
  releaseChallenge,
  releaseLinkedChallenges,
  releaseAllUnreleasedChallenges,
  processScheduledChallengeReleases,
  tagSubmissionChallenges,
  getSubmissionChallengeIds,
  listChallengeIdsForSubmissions,
  resolveSubmissionChallengeIds,
} = await import("@/lib/services/challenges")

const hackathonId = "11111111-1111-1111-1111-111111111111"
const tenantId = "22222222-2222-2222-2222-222222222222"
const challengeId = "33333333-3333-3333-3333-333333333333"
const otherTenantId = "44444444-4444-4444-4444-444444444444"

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: challengeId,
    hackathon_id: hackathonId,
    title: "Theme A",
    description: "Description",
    resources: [{ label: "Docs", url: "https://example.com" }],
    sort_order: 0,
    created_at: "2026-04-28T00:00:00Z",
    updated_at: "2026-04-28T00:00:00Z",
    released_at: null,
    scheduled_release_at: null,
    release_linked_to: "event_start",
    ...overrides,
  }
}

describe("Challenges Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockDispatchChallengesReleased.mockClear()
  })

  describe("listChallenges", () => {
    it("returns mapped challenges on success", async () => {
      mockTableQuery("challenges", mockSuccess([makeRow()]))

      const result = await listChallenges(hackathonId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(challengeId)
      expect(result[0].title).toBe("Theme A")
      expect(result[0].resources).toEqual([{ label: "Docs", url: "https://example.com" }])
      expect(result[0].sortOrder).toBe(0)
    })

    it("returns empty array when no challenges exist", async () => {
      mockTableQuery("challenges", mockSuccess([]))

      const result = await listChallenges(hackathonId)

      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      mockTableQuery("challenges", mockError("Query failed"))

      const result = await listChallenges(hackathonId)

      expect(result).toEqual([])
    })

    it("filters out resources without urls", async () => {
      mockTableQuery(
        "challenges",
        mockSuccess([makeRow({ resources: [{ label: "No URL" }, { label: "Good", url: "https://x.com" }] })]),
      )

      const result = await listChallenges(hackathonId)

      expect(result[0].resources).toEqual([{ label: "Good", url: "https://x.com" }])
    })
  })

  describe("getChallengeById", () => {
    it("returns challenge on success", async () => {
      mockTableQuery("challenges", mockSuccess(makeRow()))

      const result = await getChallengeById(challengeId)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(challengeId)
    })

    it("returns null on error", async () => {
      mockTableQuery("challenges", mockError("Not found"))

      const result = await getChallengeById(challengeId)

      expect(result).toBeNull()
    })
  })

  describe("createChallenge", () => {
    it("creates with correct sort_order based on existing count", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({
            data: makeRow({ sort_order: 2 }),
            error: null,
            count: 2,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createChallenge(hackathonId, tenantId, {
        title: "New",
        description: "Desc",
        resources: [],
      })

      expect(result).not.toBeNull()
      expect(result!.sortOrder).toBe(2)
    })

    it("returns null when tenant does not own hackathon", async () => {
      mockTableQuery("hackathons", mockSuccess(null))

      const result = await createChallenge(hackathonId, otherTenantId, {
        title: "New",
      })

      expect(result).toBeNull()
    })

    it("returns null when insert fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({ data: null, error: { message: "fail" }, count: 0 })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createChallenge(hackathonId, tenantId, { title: "New" })

      expect(result).toBeNull()
    })
  })

  describe("updateChallenge", () => {
    it("updates when tenant owns the challenge", async () => {
      setMockFromImplementation((table) => {
        if (table === "challenges") {
          return createChainableMock({
            data: {
              ...makeRow({ title: "Updated" }),
              hackathons: { tenant_id: tenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await updateChallenge(challengeId, tenantId, { title: "Updated" })

      expect(result).not.toBeNull()
      expect(result!.title).toBe("Updated")
    })

    it("returns null when tenant does not own the challenge", async () => {
      setMockFromImplementation((table) => {
        if (table === "challenges") {
          return createChainableMock({
            data: {
              hackathon_id: hackathonId,
              hackathons: { tenant_id: otherTenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await updateChallenge(challengeId, tenantId, { title: "X" })

      expect(result).toBeNull()
    })
  })

  describe("deleteChallenge", () => {
    it("deletes when tenant owns the challenge", async () => {
      setMockFromImplementation((table) => {
        if (table === "challenges") {
          return createChainableMock({
            data: {
              hackathon_id: hackathonId,
              hackathons: { tenant_id: tenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await deleteChallenge(challengeId, tenantId)

      expect(result).toBe(true)
    })

    it("returns false when tenant does not own the challenge", async () => {
      setMockFromImplementation((table) => {
        if (table === "challenges") {
          return createChainableMock({
            data: {
              hackathon_id: hackathonId,
              hackathons: { tenant_id: otherTenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await deleteChallenge(challengeId, tenantId)

      expect(result).toBe(false)
    })
  })

  describe("reorderChallenges", () => {
    it("reorders when all IDs belong to hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({
            data: [{ id: "a" }, { id: "b" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await reorderChallenges(hackathonId, tenantId, ["b", "a"])

      expect(result).toBe(true)
    })

    it("returns false when an ID does not belong to hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({
            data: [{ id: "a" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await reorderChallenges(hackathonId, tenantId, ["a", "unknown"])

      expect(result).toBe(false)
    })

    it("returns false when tenant does not own hackathon", async () => {
      mockTableQuery("hackathons", mockSuccess(null))

      const result = await reorderChallenges(hackathonId, otherTenantId, [])

      expect(result).toBe(false)
    })

    it("returns false when orderedIds contains duplicates", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({
            data: [{ id: "a" }, { id: "b" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await reorderChallenges(hackathonId, tenantId, ["a", "a"])

      expect(result).toBe(false)
    })
  })

  describe("releaseChallenge", () => {
    function mockReleaseChallengeFlow(opts: {
      ownershipTenant?: string
      hackathonStatus?: string
      hackathonChallengeReleasedAt?: string | null
      releasedRow?: Record<string, unknown> | null
    } = {}) {
      const status = opts.hackathonStatus ?? "published"
      const ownershipTenant = opts.ownershipTenant ?? tenantId
      const releasedRow = opts.releasedRow === undefined
        ? makeRow({ released_at: "2026-05-14T00:00:00Z" })
        : opts.releasedRow

      let challengesCalls = 0
      setMockFromImplementation((table) => {
        if (table === "challenges") {
          challengesCalls++
          if (challengesCalls === 1) {
            return createChainableMock({
              data: {
                hackathon_id: hackathonId,
                hackathons: { tenant_id: ownershipTenant },
              },
              error: null,
            })
          }
          return createChainableMock({
            data: releasedRow ? [releasedRow] : [],
            error: null,
          })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              id: hackathonId,
              tenant_id: tenantId,
              name: "Test Hack",
              slug: "test-hack",
              status,
              challenge_released_at: opts.hackathonChallengeReleasedAt ?? null,
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })
    }

    it("releases a single challenge and dispatches notification", async () => {
      mockReleaseChallengeFlow()

      const result = await releaseChallenge(challengeId, tenantId)

      expect(result).not.toBeNull()
      expect(result!.releasedAt).not.toBeNull()
      expect(mockDispatchChallengesReleased).toHaveBeenCalledTimes(1)
      const call = mockDispatchChallengesReleased.mock.calls[0]?.[0] as {
        trigger: string
        challenges: Array<{ title: string }>
      }
      expect(call.trigger).toBe("manual")
      expect(call.challenges).toHaveLength(1)
    })

    it("returns null when tenant does not own the challenge", async () => {
      mockReleaseChallengeFlow({ ownershipTenant: otherTenantId })

      const result = await releaseChallenge(challengeId, tenantId)

      expect(result).toBeNull()
      expect(mockDispatchChallengesReleased).not.toHaveBeenCalled()
    })

    it("does not dispatch when hackathon status is draft", async () => {
      mockReleaseChallengeFlow({ hackathonStatus: "draft" })

      const result = await releaseChallenge(challengeId, tenantId)

      expect(result).not.toBeNull()
      expect(mockDispatchChallengesReleased).not.toHaveBeenCalled()
    })

    it("returns null when no row is updated (already released)", async () => {
      mockReleaseChallengeFlow({ releasedRow: null })

      const result = await releaseChallenge(challengeId, tenantId)

      expect(result).toBeNull()
    })
  })

  describe("releaseLinkedChallenges", () => {
    function mockLinkedReleaseFlow(linkedTo: "event_start" | "event_publish", opts: {
      status?: string
      pendingIds?: string[]
      released?: Array<Record<string, unknown>>
    } = {}) {
      const status = opts.status ?? "published"
      const pendingIds = opts.pendingIds ?? [challengeId]
      const released = opts.released ?? pendingIds.map((id) =>
        makeRow({ id, release_linked_to: linkedTo, released_at: "2026-05-14T00:00:00Z" }),
      )

      let challengesCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              id: hackathonId,
              tenant_id: tenantId,
              name: "Test Hack",
              slug: "test-hack",
              status,
              challenge_released_at: null,
            },
            error: null,
          })
        }
        if (table === "challenges") {
          challengesCalls++
          if (challengesCalls === 1) {
            return createChainableMock({
              data: pendingIds.map((id) => ({ id })),
              error: null,
            })
          }
          return createChainableMock({ data: released, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
    }

    it("releases all matching challenges and dispatches once", async () => {
      mockLinkedReleaseFlow("event_publish", {
        pendingIds: [challengeId, "55555555-5555-5555-5555-555555555555"],
      })

      const result = await releaseLinkedChallenges(hackathonId, tenantId, "event_publish")

      expect(result).toHaveLength(2)
      expect(mockDispatchChallengesReleased).toHaveBeenCalledTimes(1)
      const call = mockDispatchChallengesReleased.mock.calls[0]?.[0] as {
        trigger: string
        challenges: Array<{ title: string }>
      }
      expect(call.trigger).toBe("event_publish")
      expect(call.challenges).toHaveLength(2)
    })

    it("returns empty array when nothing is pending", async () => {
      mockLinkedReleaseFlow("event_start", { pendingIds: [] })

      const result = await releaseLinkedChallenges(hackathonId, tenantId, "event_start")

      expect(result).toEqual([])
      expect(mockDispatchChallengesReleased).not.toHaveBeenCalled()
    })

    it("returns empty array when tenant does not own hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              id: hackathonId,
              tenant_id: otherTenantId,
              name: "X",
              slug: "x",
              status: "published",
              challenge_released_at: null,
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await releaseLinkedChallenges(hackathonId, tenantId, "event_publish")

      expect(result).toEqual([])
    })

    it("does not dispatch when status is not published or active", async () => {
      mockLinkedReleaseFlow("event_publish", { status: "draft" })

      const result = await releaseLinkedChallenges(hackathonId, tenantId, "event_publish")

      expect(result).toHaveLength(1)
      expect(mockDispatchChallengesReleased).not.toHaveBeenCalled()
    })
  })

  describe("releaseAllUnreleasedChallenges", () => {
    it("releases all pending challenges and reports them", async () => {
      let challengesCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              id: hackathonId,
              tenant_id: tenantId,
              name: "Test Hack",
              slug: "test-hack",
              status: "active",
              challenge_released_at: null,
            },
            error: null,
          })
        }
        if (table === "challenges") {
          challengesCalls++
          if (challengesCalls === 1) {
            return createChainableMock({
              data: [{ id: challengeId }],
              error: null,
            })
          }
          return createChainableMock({
            data: [makeRow({ released_at: "2026-05-14T00:00:00Z" })],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await releaseAllUnreleasedChallenges(hackathonId, tenantId)

      expect(result).toHaveLength(1)
      expect(mockDispatchChallengesReleased).toHaveBeenCalledTimes(1)
    })

    it("returns empty when nothing is pending", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              id: hackathonId,
              tenant_id: tenantId,
              name: "Test Hack",
              slug: "test-hack",
              status: "active",
              challenge_released_at: null,
            },
            error: null,
          })
        }
        if (table === "challenges") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await releaseAllUnreleasedChallenges(hackathonId, tenantId)

      expect(result).toEqual([])
    })
  })

  describe("processScheduledChallengeReleases", () => {
    it("returns empty result when no challenges are due", async () => {
      mockTableQuery("challenges", mockSuccess([]))

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
      expect(result.releases).toEqual([])
      expect(result.errors).toEqual([])
    })

    it("reports DB error when fetching due challenges fails", async () => {
      mockTableQuery("challenges", mockError("Connection failed"))

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain("Connection failed")
    })

    it("releases all due challenges grouped by hackathon and dispatches one notification per hackathon", async () => {
      const otherId = "55555555-5555-5555-5555-555555555555"
      const otherTenant = "66666666-6666-6666-6666-666666666666"

      let challengesCalls = 0
      setMockFromImplementation((table) => {
        if (table === "challenges") {
          challengesCalls++
          if (challengesCalls === 1) {
            return createChainableMock({
              data: [
                { id: challengeId, hackathon_id: hackathonId },
                { id: otherId, hackathon_id: otherId },
              ],
              error: null,
            })
          }
          const isFirstHack = challengesCalls === 2
          return createChainableMock({
            data: isFirstHack
              ? [makeRow({ released_at: "2026-05-14T00:00:00Z" })]
              : [makeRow({ id: otherId, hackathon_id: otherId, released_at: "2026-05-14T00:00:00Z" })],
            error: null,
          })
        }
        if (table === "hackathons") {
          const isFirst = challengesCalls === 1
          return createChainableMock({
            data: {
              id: isFirst ? hackathonId : otherId,
              tenant_id: isFirst ? tenantId : otherTenant,
              name: "Hack",
              slug: "hack",
              status: "active",
              challenge_released_at: null,
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(2)
      expect(result.releases).toHaveLength(2)
      expect(mockDispatchChallengesReleased).toHaveBeenCalledTimes(2)
      const triggers = mockDispatchChallengesReleased.mock.calls.map(
        (c) => (c[0] as { trigger: string }).trigger,
      )
      expect(triggers.every((t) => t === "scheduled")).toBe(true)
    })

    it("skips a hackathon if status is not active or published", async () => {
      let challengesCalls = 0
      setMockFromImplementation((table) => {
        if (table === "challenges") {
          challengesCalls++
          if (challengesCalls === 1) {
            return createChainableMock({
              data: [{ id: challengeId, hackathon_id: hackathonId }],
              error: null,
            })
          }
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              id: hackathonId,
              tenant_id: tenantId,
              name: "Hack",
              slug: "hack",
              status: "draft",
              challenge_released_at: null,
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
      expect(result.releases).toEqual([])
    })
  })

  describe("getSubmissionChallengeIds", () => {
    it("returns challenge IDs for submission", async () => {
      mockTableQuery(
        "submission_challenges",
        mockSuccess([{ challenge_id: "c1" }, { challenge_id: "c2" }]),
      )

      const result = await getSubmissionChallengeIds("s1")

      expect(result).toEqual(["c1", "c2"])
    })

    it("returns empty array on error", async () => {
      mockTableQuery("submission_challenges", mockError("fail"))

      const result = await getSubmissionChallengeIds("s1")

      expect(result).toEqual([])
    })
  })

  describe("tagSubmissionChallenges", () => {
    it("clears and inserts new tags when all IDs belong to hackathon and are released", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({ data: { hackathon_id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({
            data: [
              { id: "c1", released_at: "2026-05-14T00:00:00Z" },
              { id: "c2", released_at: "2026-05-14T00:00:00Z" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await tagSubmissionChallenges("s1", ["c1", "c2"])

      expect(result).toBe(true)
    })

    it("clears only when given empty array (skips validation)", async () => {
      mockTableQuery("submission_challenges", mockSuccess(null))

      const result = await tagSubmissionChallenges("s1", [])

      expect(result).toBe(true)
    })

    it("returns false when a challenge does not belong to the submission's hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({ data: { hackathon_id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({
            data: [{ id: "c1", released_at: "2026-05-14T00:00:00Z" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await tagSubmissionChallenges("s1", ["c1", "c2"])

      expect(result).toBe(false)
    })

    it("returns false when a tagged challenge is not yet released", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({ data: { hackathon_id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({
            data: [
              { id: "c1", released_at: "2026-05-14T00:00:00Z" },
              { id: "c2", released_at: null },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await tagSubmissionChallenges("s1", ["c1", "c2"])

      expect(result).toBe(false)
    })

    it("returns false when submission lookup fails", async () => {
      mockTableQuery("submissions", mockError("Not found"))

      const result = await tagSubmissionChallenges("s1", ["c1"])

      expect(result).toBe(false)
    })
  })

  describe("resolveSubmissionChallengeIds", () => {
    function mockReleasedChallenges(rows: Array<{ id: string; released: boolean }>) {
      mockTableQuery(
        "challenges",
        mockSuccess(
          rows.map((r) => makeRow({ id: r.id, released_at: r.released ? "2026-05-14T00:00:00Z" : null })),
        ),
      )
    }

    it("returns empty when zero challenges are released", async () => {
      mockReleasedChallenges([{ id: "c1", released: false }])

      const result = await resolveSubmissionChallengeIds(hackathonId, undefined)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.challengeIds).toEqual([])
    })

    it("auto-tags the single released challenge when only one exists", async () => {
      mockReleasedChallenges([{ id: "c1", released: true }, { id: "c2", released: false }])

      const result = await resolveSubmissionChallengeIds(hackathonId, undefined)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.challengeIds).toEqual(["c1"])
    })

    it("rejects with challenge_required when multiple released and none provided", async () => {
      mockReleasedChallenges([
        { id: "c1", released: true },
        { id: "c2", released: true },
      ])

      const result = await resolveSubmissionChallengeIds(hackathonId, undefined)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("challenge_required")
    })

    it("accepts provided IDs when multiple released and IDs are all released", async () => {
      mockReleasedChallenges([
        { id: "c1", released: true },
        { id: "c2", released: true },
      ])

      const result = await resolveSubmissionChallengeIds(hackathonId, ["c1"])

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.challengeIds).toEqual(["c1"])
    })

    it("rejects when provided IDs include an unreleased challenge", async () => {
      mockReleasedChallenges([
        { id: "c1", released: true },
        { id: "c2", released: true },
        { id: "c3", released: false },
      ])

      const result = await resolveSubmissionChallengeIds(hackathonId, ["c1", "c3"])

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("invalid_challenge_id")
    })
  })

  describe("listChallengeIdsForSubmissions", () => {
    it("returns empty map when no submission IDs given", async () => {
      const result = await listChallengeIdsForSubmissions([])

      expect(result.size).toBe(0)
    })

    it("groups challenge IDs by submission ID", async () => {
      mockTableQuery(
        "submission_challenges",
        mockSuccess([
          { submission_id: "s1", challenge_id: "c1" },
          { submission_id: "s1", challenge_id: "c2" },
          { submission_id: "s2", challenge_id: "c1" },
        ]),
      )

      const result = await listChallengeIdsForSubmissions(["s1", "s2"])

      expect(result.get("s1")).toEqual(["c1", "c2"])
      expect(result.get("s2")).toEqual(["c1"])
    })

    it("returns empty map on error", async () => {
      mockTableQuery("submission_challenges", mockError("fail"))

      const result = await listChallengeIdsForSubmissions(["s1"])

      expect(result.size).toBe(0)
    })
  })
})
