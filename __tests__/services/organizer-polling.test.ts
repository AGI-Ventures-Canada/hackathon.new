import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { buildOrganizerPollPayload } = await import(
  "@/lib/services/organizer-polling"
)

const hackathonId = "11111111-1111-1111-1111-111111111111"

function createMockChains(overrides: {
  hackathon?: Record<string, unknown> | null
  hackathonError?: { message: string } | null
  submissionCount?: number | null
  participantCount?: number | null
  teamCount?: number | null
  assignmentTotal?: number | null
  assignmentComplete?: number | null
  judgeCount?: number | null
  prizeCount?: number | null
  judgeDisplayCount?: number | null
  mentorCount?: number | null
  challengeScheduleItem?: { starts_at: string } | null
  pendingJudgeInvCount?: number | null
} = {}) {
  const {
    hackathon = {
      status: "active",
      phase: "build",
      description: "A test hackathon",
      banner_url: "https://example.com/banner.png",
      challenge_title: "Build an AI tool",
      challenge_released_at: "2026-04-28T10:00:00Z",
      results_published_at: null,
      starts_at: "2026-04-28T09:00:00Z",
      ends_at: "2026-04-28T17:00:00Z",
      location_type: "in_person",
      feedback_survey_url: null,
      feedback_survey_sent_at: null,
    },
    hackathonError = null,
    submissionCount = 5,
    participantCount = 20,
    teamCount = 10,
    assignmentTotal = 20,
    assignmentComplete = 8,
    judgeCount = 3,
    prizeCount = 2,
    judgeDisplayCount = 3,
    mentorCount = 1,
    challengeScheduleItem = null,
    pendingJudgeInvCount = 0,
  } = overrides

  const chains: Record<string, ReturnType<typeof createChainableMock>> = {
    hackathons: createChainableMock({
      data: hackathon,
      error: hackathonError,
    }),
    submissions: createChainableMock({
      data: null,
      error: null,
      count: submissionCount,
    }),
    hackathon_participants: createChainableMock({
      data: null,
      error: null,
      count: participantCount,
    }),
    teams: createChainableMock({
      data: null,
      error: null,
      count: teamCount,
    }),
    prizes: createChainableMock({
      data: null,
      error: null,
      count: prizeCount,
    }),
    hackathon_judges_display: createChainableMock({
      data: null,
      error: null,
      count: judgeDisplayCount,
    }),
    mentor_requests: createChainableMock({
      data: null,
      error: null,
      count: mentorCount,
    }),
    judge_invitations: createChainableMock({
      data: null,
      error: null,
      count: pendingJudgeInvCount,
    }),
  }

  let judgeAssignmentCallCount = 0
  const judgeChainTotal = createChainableMock({
    data: null,
    error: null,
    count: assignmentTotal,
  })
  const judgeChainComplete = createChainableMock({
    data: null,
    error: null,
    count: assignmentComplete,
  })

  const challengeReleaseChain = createChainableMock({
    data: challengeScheduleItem,
    error: null,
  })

  let participantCallCount = 0
  const participantChain = createChainableMock({
    data: null,
    error: null,
    count: participantCount,
  })
  const judgeCountChain = createChainableMock({
    data: null,
    error: null,
    count: judgeCount,
  })

  setMockFromImplementation((table) => {
    if (table === "judge_assignments") {
      judgeAssignmentCallCount++
      return judgeAssignmentCallCount === 1
        ? judgeChainTotal
        : judgeChainComplete
    }
    if (table === "hackathon_schedule_items") {
      return challengeReleaseChain
    }
    if (table === "hackathon_participants") {
      participantCallCount++
      return participantCallCount === 1 ? participantChain : judgeCountChain
    }
    return chains[table] ?? createChainableMock({ data: null, error: null })
  })
}

describe("Organizer Polling Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("buildOrganizerPollPayload", () => {
    it("returns null when hackathon not found", async () => {
      createMockChains({
        hackathon: null,
        hackathonError: { message: "Not found" },
      })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).toBeNull()
    })

    it("returns correct ActionItemsInput shape for a basic hackathon", async () => {
      createMockChains()

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.status).toBe("active")
      expect(result!.phase).toBe("build")
      expect(result!.submissionCount).toBe(5)
      expect(result!.participantCount).toBe(20)
      expect(result!.teamCount).toBe(10)
      expect(result!.judgingProgress).toEqual({
        totalAssignments: 20,
        completedAssignments: 8,
      })
      expect(result!.judgeCount).toBe(3)
      expect(result!.prizeCount).toBe(2)
      expect(result!.judgeDisplayCount).toBe(3)
      expect(result!.mentorQueue).toEqual({ open: 1 })
      expect(result!.challengeReleased).toBe(true)
      expect(result!.challengeExists).toBe(true)
      expect(result!.challengeReleaseTime).toBeNull()
      expect(result!.resultsPublishedAt).toBeNull()
      expect(result!.description).toBe("A test hackathon")
      expect(result!.bannerUrl).toBe("https://example.com/banner.png")
      expect(result!.startsAt).toBe("2026-04-28T09:00:00Z")
      expect(result!.endsAt).toBe("2026-04-28T17:00:00Z")
      expect(result!.locationType).toBe("in_person")
      expect(result!.feedbackSurveyUrl).toBeNull()
      expect(result!.feedbackSurveySentAt).toBeNull()
      expect(result!.pendingJudgeInvitationCount).toBe(0)
    })

    it("handles challenge schedule item lookup", async () => {
      createMockChains({
        challengeScheduleItem: { starts_at: "2026-04-28T11:00:00Z" },
      })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.challengeReleaseTime).toBe("2026-04-28T11:00:00Z")
    })

    it("returns null challengeReleaseTime when no schedule item exists", async () => {
      createMockChains({ challengeScheduleItem: null })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.challengeReleaseTime).toBeNull()
    })

    it("includes pending judge invitation count", async () => {
      createMockChains({ pendingJudgeInvCount: 7 })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.pendingJudgeInvitationCount).toBe(7)
    })

    it("defaults counts to 0 when queries return null", async () => {
      createMockChains({
        submissionCount: null,
        participantCount: null,
        teamCount: null,
        assignmentTotal: null,
        assignmentComplete: null,
        judgeCount: null,
        prizeCount: null,
        judgeDisplayCount: null,
        mentorCount: null,
        pendingJudgeInvCount: null,
      })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.submissionCount).toBe(0)
      expect(result!.participantCount).toBe(0)
      expect(result!.teamCount).toBe(0)
      expect(result!.judgingProgress.totalAssignments).toBe(0)
      expect(result!.judgingProgress.completedAssignments).toBe(0)
      expect(result!.judgeCount).toBe(0)
      expect(result!.prizeCount).toBe(0)
      expect(result!.judgeDisplayCount).toBe(0)
      expect(result!.mentorQueue.open).toBe(0)
      expect(result!.pendingJudgeInvitationCount).toBe(0)
    })

    it("sets challengeReleased to false when challenge_released_at is null", async () => {
      createMockChains({
        hackathon: {
          status: "active",
          phase: "build",
          description: null,
          banner_url: null,
          challenge_title: "A challenge",
          challenge_released_at: null,
          results_published_at: null,
          starts_at: "2026-04-28T09:00:00Z",
          ends_at: "2026-04-28T17:00:00Z",
          location_type: null,
          feedback_survey_url: null,
          feedback_survey_sent_at: null,
        },
      })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.challengeReleased).toBe(false)
      expect(result!.challengeExists).toBe(true)
    })

    it("sets challengeExists to false when challenge_title is null", async () => {
      createMockChains({
        hackathon: {
          status: "draft",
          phase: null,
          description: null,
          banner_url: null,
          challenge_title: null,
          challenge_released_at: null,
          results_published_at: null,
          starts_at: null,
          ends_at: null,
          location_type: null,
          feedback_survey_url: null,
          feedback_survey_sent_at: null,
        },
      })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.challengeExists).toBe(false)
      expect(result!.challengeReleased).toBe(false)
    })

    it("includes feedback survey fields when present", async () => {
      createMockChains({
        hackathon: {
          status: "completed",
          phase: null,
          description: "Done",
          banner_url: null,
          challenge_title: "Challenge",
          challenge_released_at: "2026-04-28T10:00:00Z",
          results_published_at: "2026-04-29T12:00:00Z",
          starts_at: "2026-04-28T09:00:00Z",
          ends_at: "2026-04-28T17:00:00Z",
          location_type: "virtual",
          feedback_survey_url: "https://example.com/survey",
          feedback_survey_sent_at: "2026-04-29T14:00:00Z",
        },
      })

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.feedbackSurveyUrl).toBe("https://example.com/survey")
      expect(result!.feedbackSurveySentAt).toBe("2026-04-29T14:00:00Z")
      expect(result!.resultsPublishedAt).toBe("2026-04-29T12:00:00Z")
      expect(result!.locationType).toBe("virtual")
    })
  })
})
