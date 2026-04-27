import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockTableQuery,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const {
  listChallenges,
  getChallengeById,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  reorderChallenges,
  releaseChallenges,
  processScheduledChallengeReleases,
  tagSubmissionChallenges,
  getSubmissionChallengeIds,
  listChallengeIdsForSubmissions,
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
    ...overrides,
  }
}

describe("Challenges Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
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

  describe("releaseChallenges", () => {
    it("releases when challenges exist and not already released", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { challenge_released_at: null },
            error: null,
          })
        }
        if (table === "challenges") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await releaseChallenges(hackathonId, tenantId)

      expect(result).toBe(true)
    })

    it("returns true and is a noop when already released", async () => {
      mockTableQuery(
        "hackathons",
        mockSuccess({ challenge_released_at: "2026-04-28T00:00:00Z" }),
      )

      const result = await releaseChallenges(hackathonId, tenantId)

      expect(result).toBe(true)
    })

    it("returns false when no challenges exist", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { challenge_released_at: null },
            error: null,
          })
        }
        if (table === "challenges") {
          return createChainableMock({ data: null, error: null, count: 0 })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await releaseChallenges(hackathonId, tenantId)

      expect(result).toBe(false)
    })

    it("returns false when hackathon fetch fails", async () => {
      mockTableQuery("hackathons", mockError("Not found"))

      const result = await releaseChallenges(hackathonId, tenantId)

      expect(result).toBe(false)
    })
  })

  describe("processScheduledChallengeReleases", () => {
    it("returns empty result when no active hackathons need release", async () => {
      mockTableQuery("hackathons", mockSuccess([]))

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
      expect(result.releases).toEqual([])
      expect(result.errors).toEqual([])
    })

    it("reports DB error when fetching hackathons fails", async () => {
      mockTableQuery("hackathons", mockError("Connection failed"))

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain("Connection failed")
    })

    it("releases when trigger item has custom time in the past", async () => {
      const past = new Date(Date.now() - 60_000).toISOString()

      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          if (hackathonCalls === 1) {
            return createChainableMock({
              data: [{ id: hackathonId, tenant_id: tenantId }],
              error: null,
            })
          }
          return createChainableMock({
            data: { challenge_released_at: null },
            error: null,
          })
        }
        if (table === "hackathon_schedule_items") {
          return createChainableMock({
            data: [
              { hackathon_id: hackathonId, starts_at: past, linked_to: null },
            ],
            error: null,
          })
        }
        if (table === "challenges") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(1)
      expect(result.releases).toEqual([{ hackathonId }])
    })

    it("skips hackathons where the trigger item is still linked to event_start", async () => {
      const past = new Date(Date.now() - 60_000).toISOString()

      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: [{ id: hackathonId, tenant_id: tenantId }],
            error: null,
          })
        }
        if (table === "hackathon_schedule_items") {
          return createChainableMock({
            data: [
              {
                hackathon_id: hackathonId,
                starts_at: past,
                linked_to: "event_start",
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
      expect(result.releases).toEqual([])
    })

    it("skips hackathons with a custom time still in the future", async () => {
      const future = new Date(Date.now() + 60 * 60_000).toISOString()

      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: [{ id: hackathonId, tenant_id: tenantId }],
            error: null,
          })
        }
        if (table === "hackathon_schedule_items") {
          return createChainableMock({
            data: [
              { hackathon_id: hackathonId, starts_at: future, linked_to: null },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
      expect(result.releases).toEqual([])
    })

    it("isolates errors per hackathon and continues processing others", async () => {
      const past = new Date(Date.now() - 60_000).toISOString()
      const otherId = "55555555-5555-5555-5555-555555555555"
      const otherTenant = "66666666-6666-6666-6666-666666666666"

      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          if (hackathonCalls === 1) {
            return createChainableMock({
              data: [
                { id: hackathonId, tenant_id: tenantId },
                { id: otherId, tenant_id: otherTenant },
              ],
              error: null,
            })
          }
          if (hackathonCalls === 2) {
            throw new Error("simulated DB blow-up")
          }
          return createChainableMock({
            data: { challenge_released_at: null },
            error: null,
          })
        }
        if (table === "hackathon_schedule_items") {
          return createChainableMock({
            data: [
              { hackathon_id: hackathonId, starts_at: past, linked_to: null },
              { hackathon_id: otherId, starts_at: past, linked_to: null },
            ],
            error: null,
          })
        }
        if (table === "challenges") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(1)
      expect(result.releases).toEqual([{ hackathonId: otherId }])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain(hackathonId)
      expect(result.errors[0]).toContain("simulated DB blow-up")
    })

    it("skips when no schedule items match", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: [{ id: hackathonId, tenant_id: tenantId }],
            error: null,
          })
        }
        if (table === "hackathon_schedule_items") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processScheduledChallengeReleases()

      expect(result.processed).toBe(0)
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
    it("clears and inserts new tags when all IDs belong to hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({ data: { hackathon_id: hackathonId }, error: null })
        }
        if (table === "challenges") {
          return createChainableMock({ data: [{ id: "c1" }, { id: "c2" }], error: null })
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
          return createChainableMock({ data: [{ id: "c1" }], error: null })
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
