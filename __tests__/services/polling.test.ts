import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { buildPollPayload } = await import("@/lib/services/polling")

const hackathonId = "11111111-1111-1111-1111-111111111111"

function createMockChains(overrides: {
  hackathon?: Record<string, unknown> | null
  hackathonError?: { message: string } | null
  submissionCount?: number | null
  teamCount?: number | null
  judgingTotal?: number | null
  judgingComplete?: number | null
  mentorCount?: number | null
  rooms?: Record<string, unknown>[] | null
  challenges?: Record<string, unknown>[] | null
  announcements?: Record<string, unknown>[] | null
} = {}) {
  const {
    hackathon = {
      status: "active",
      phase: "build",
      starts_at: "2026-04-28T09:00:00Z",
      ends_at: "2026-04-28T17:00:00Z",
      challenge_released_at: "2026-04-28T10:00:00Z",
    },
    hackathonError = null,
    submissionCount = 5,
    teamCount = 10,
    judgingTotal = 20,
    judgingComplete = 8,
    mentorCount = 3,
    rooms = [],
    challenges = [],
    announcements = [],
  } = overrides

  const chains: Record<string, ReturnType<typeof createChainableMock>> = {
    hackathons: createChainableMock({ data: hackathon, error: hackathonError }),
    submissions: createChainableMock({ data: null, error: null, count: submissionCount }),
    teams: createChainableMock({ data: null, error: null, count: teamCount }),
    rooms: createChainableMock({ data: rooms, error: null }),
    mentor_requests: createChainableMock({ data: null, error: null, count: mentorCount }),
    challenges: createChainableMock({ data: challenges, error: null }),
    hackathon_announcements: createChainableMock({ data: announcements, error: null }),
    hackathon_schedule_items: createChainableMock({ data: [], error: null }),
  }

  let judgeCallCount = 0
  const judgeChainTotal = createChainableMock({ data: null, error: null, count: judgingTotal })
  const judgeChainComplete = createChainableMock({ data: null, error: null, count: judgingComplete })

  setMockFromImplementation((table) => {
    if (table === "judge_assignments") {
      judgeCallCount++
      return judgeCallCount === 1 ? judgeChainTotal : judgeChainComplete
    }
    return chains[table] ?? createChainableMock({ data: null, error: null })
  })

  return chains
}

describe("Polling Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("buildPollPayload", () => {
    it("returns full poll payload for active hackathon", async () => {
      createMockChains()

      const result = await buildPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.phase).toBe("build")
      expect(result!.status).toBe("active")
      expect(result!.ts).toBeGreaterThan(0)
    })

    it("includes global timer when hackathon is active with ends_at", async () => {
      createMockChains()

      const result = await buildPollPayload(hackathonId)

      expect(result!.timers.global).toEqual({
        endsAt: "2026-04-28T17:00:00Z",
        label: "Build ends",
      })
    })

    it("does not include global timer when hackathon is not active", async () => {
      createMockChains({
        hackathon: {
          status: "judging",
          phase: "preliminaries",
          starts_at: "2026-04-28T09:00:00Z",
          ends_at: "2026-04-28T17:00:00Z",
          challenge_released_at: null,
        },
      })

      const result = await buildPollPayload(hackathonId)

      expect(result!.timers.global).toBeUndefined()
    })

    it("includes challenge info when released", async () => {
      createMockChains({
        challenges: [{
          id: "challenge-1",
          hackathon_id: hackathonId,
          title: "Private until release",
          description: "Build an agent",
          resources: [],
          sort_order: 0,
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        }],
      })

      const result = await buildPollPayload(hackathonId)

      expect(result!.challenge).toEqual({
        released: true,
        releasedAt: "2026-04-28T10:00:00Z",
        challenges: [expect.objectContaining({ title: "Private until release" })],
      })
    })

    it("never loads or serializes challenges before release", async () => {
      const chains = createMockChains({
        hackathon: {
          status: "active",
          phase: "build",
          starts_at: "2026-04-28T09:00:00Z",
          ends_at: "2026-04-28T17:00:00Z",
          challenge_released_at: null,
        },
        challenges: [{
          id: "challenge-secret",
          hackathon_id: hackathonId,
          title: "Secret prompt",
          description: "Do not reveal",
          resources: [],
          sort_order: 0,
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        }],
      })

      const result = await buildPollPayload(hackathonId)

      expect(result!.challenge!.released).toBe(false)
      expect(result!.challenge!.releasedAt).toBeNull()
      expect(result!.challenge!.challenges).toEqual([])
      expect(JSON.stringify(result)).not.toContain("Secret prompt")
      expect(chains.challenges.select).not.toHaveBeenCalled()
    })

    it("serializes only announcements for everyone", async () => {
      const chains = createMockChains({
        announcements: [
          {
            id: "public-announcement",
            title: "Doors open",
            body: "Welcome",
            priority: "normal",
            audience: "everyone",
            published_at: "2026-04-28T10:00:00Z",
          },
          {
            id: "judge-announcement",
            title: "Judge briefing",
            body: "Private judging details",
            priority: "urgent",
            audience: "judges",
            published_at: "2026-04-28T10:00:00Z",
          },
        ],
      })

      const result = await buildPollPayload(hackathonId)

      expect(result!.announcements).toEqual([
        expect.objectContaining({ id: "public-announcement", audience: "everyone" }),
      ])
      expect(JSON.stringify(result)).not.toContain("Private judging details")
      expect(chains.hackathon_announcements.eq).toHaveBeenCalledWith("audience", "everyone")
    })

    it("includes stats from all count queries", async () => {
      createMockChains({
        submissionCount: 12,
        teamCount: 30,
        judgingTotal: 50,
        judgingComplete: 25,
        mentorCount: 7,
      })

      const result = await buildPollPayload(hackathonId)

      expect(result!.stats).toEqual({
        submissionCount: 12,
        teamCount: 30,
        judgingComplete: 25,
        judgingTotal: 50,
        mentorQueueOpen: 7,
      })
    })

    it("defaults counts to 0 when queries return null", async () => {
      createMockChains({
        submissionCount: null,
        teamCount: null,
        judgingTotal: null,
        judgingComplete: null,
        mentorCount: null,
      })

      const result = await buildPollPayload(hackathonId)

      expect(result!.stats.submissionCount).toBe(0)
      expect(result!.stats.teamCount).toBe(0)
      expect(result!.stats.judgingTotal).toBe(0)
      expect(result!.stats.judgingComplete).toBe(0)
      expect(result!.stats.mentorQueueOpen).toBe(0)
    })

    it("returns null when hackathon is not found", async () => {
      createMockChains({
        hackathon: null,
        hackathonError: { message: "Not found" },
      })

      const result = await buildPollPayload(hackathonId)

      expect(result).toBeNull()
    })

    it("includes room timer data", async () => {
      createMockChains({
        rooms: [
          { id: "room-1", name: "Room A", timer_ends_at: "2026-04-28T14:00:00Z", timer_label: "Demos" },
          { id: "room-2", name: "Room B", timer_ends_at: null, timer_label: null },
        ],
      })

      const result = await buildPollPayload(hackathonId)

      expect(result!.timers.rooms).toHaveLength(2)
      expect(result!.timers.rooms[0]).toEqual({
        id: "room-1",
        name: "Room A",
        endsAt: "2026-04-28T14:00:00Z",
        label: "Demos",
      })
      expect(result!.timers.rooms[1]).toEqual({
        id: "room-2",
        name: "Room B",
        endsAt: null,
        label: null,
      })
    })

    it("returns empty rooms array when no rooms exist", async () => {
      createMockChains({ rooms: null })

      const result = await buildPollPayload(hackathonId)

      expect(result!.timers.rooms).toEqual([])
    })
  })
})
