import { describe, it, expect, beforeEach } from "bun:test"
import {
  resetSupabaseMocks,
  mockRpcCall,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const { buildOrganizerPollPayload } = await import(
  "@/lib/services/organizer-polling"
)

const hackathonId = "11111111-1111-1111-1111-111111111111"

function makeRpcPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    phase: "build",
    description: "A test hackathon",
    banner_url: "https://example.com/banner.png",
    challenge_count: 1,
    challenge_released_at: "2026-04-28T10:00:00Z",
    results_published_at: null,
    starts_at: "2099-04-28T09:00:00Z",
    ends_at: "2099-04-28T17:00:00Z",
    registration_closes_at: "2099-04-28T09:00:00Z",
    allow_late_registration: true,
    location_type: "in_person",
    feedback_survey_url: null,
    feedback_survey_sent_at: null,
    submission_count: 5,
    unassigned_submission_count: 0,
    participant_count: 20,
    team_count: 10,
    pending_team_approval_count: 0,
    assignment_total: 20,
    assignment_complete: 8,
    judge_count: 3,
    prize_count: 2,
    judge_display_count: 3,
    mentor_open_count: 1,
    challenge_release_time: null,
    pending_judge_invitation_count: 0,
    planned_round_count: 0,
    active_round_count: 0,
    complete_round_count: 0,
    ...overrides,
  }
}

describe("Organizer Polling Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("buildOrganizerPollPayload", () => {
    it("returns null when RPC errors", async () => {
      mockRpcCall("get_organizer_poll_data", mockError("Not found"))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).toBeNull()
    })

    it("returns null when RPC returns no data", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(null))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).toBeNull()
    })

    it("returns correct ActionItemsInput shape for a basic hackathon", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload()))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.status).toBe("active")
      expect(result!.phase).toBe("build")
      expect(result!.submissionCount).toBe(5)
      expect(result!.unassignedSubmissionCount).toBe(0)
      expect(result!.participantCount).toBe(20)
      expect(result!.teamCount).toBe(10)
      expect(result!.pendingTeamApprovalCount).toBe(0)
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
      expect(result!.startsAt).toBe("2099-04-28T09:00:00Z")
      expect(result!.endsAt).toBe("2099-04-28T17:00:00Z")
      expect(result!.registrationClosesAt).toBe("2099-04-28T09:00:00Z")
      expect(result!.allowLateRegistration).toBe(true)
      expect(result!.locationType).toBe("in_person")
      expect(result!.feedbackSurveyUrl).toBeNull()
      expect(result!.feedbackSurveySentAt).toBeNull()
      expect(result!.pendingJudgeInvitationCount).toBe(0)
    })

    it("handles challenge schedule item lookup", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(
        makeRpcPayload({ challenge_release_time: "2026-04-28T11:00:00Z" })
      ))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.challengeReleaseTime).toBe("2026-04-28T11:00:00Z")
    })

    it("returns effective status when event dates make it live", async () => {
      const startsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload({
        status: "published",
        starts_at: startsAt,
        ends_at: endsAt,
      })))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.status).toBe("active")
    })

    it("maps round counts into rounds summary", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload({
        planned_round_count: 2,
        active_round_count: 1,
        complete_round_count: 0,
      })))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.rounds).toEqual({ plannedCount: 2, activeCount: 1, completeCount: 0 })
    })

    it("defaults round counts to 0 when null", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload({
        planned_round_count: null,
        active_round_count: null,
        complete_round_count: null,
      })))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.rounds).toEqual({ plannedCount: 0, activeCount: 0, completeCount: 0 })
    })

    it("includes pending judge invitation count", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(
        makeRpcPayload({ pending_judge_invitation_count: 7 })
      ))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.pendingJudgeInvitationCount).toBe(7)
    })

    it("includes teams waiting for approval count", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(
        makeRpcPayload({ pending_team_approval_count: 3 })
      ))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.pendingTeamApprovalCount).toBe(3)
    })

    it("defaults counts to 0 when null", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload({
        submission_count: null,
        unassigned_submission_count: null,
        participant_count: null,
        team_count: null,
        pending_team_approval_count: null,
        assignment_total: null,
        assignment_complete: null,
        judge_count: null,
        prize_count: null,
        judge_display_count: null,
        mentor_open_count: null,
        pending_judge_invitation_count: null,
      })))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.submissionCount).toBe(0)
      expect(result!.unassignedSubmissionCount).toBe(0)
      expect(result!.participantCount).toBe(0)
      expect(result!.teamCount).toBe(0)
      expect(result!.pendingTeamApprovalCount).toBe(0)
      expect(result!.judgingProgress.totalAssignments).toBe(0)
      expect(result!.judgingProgress.completedAssignments).toBe(0)
      expect(result!.judgeCount).toBe(0)
      expect(result!.prizeCount).toBe(0)
      expect(result!.judgeDisplayCount).toBe(0)
      expect(result!.mentorQueue.open).toBe(0)
      expect(result!.pendingJudgeInvitationCount).toBe(0)
    })

    it("maps unassigned_submission_count when present", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(
        makeRpcPayload({ unassigned_submission_count: 4 })
      ))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.unassignedSubmissionCount).toBe(4)
    })

    it("sets challengeReleased to false when challenge_released_at is null", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload({
        challenge_released_at: null,
        challenge_count: 1,
      })))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.challengeReleased).toBe(false)
      expect(result!.challengeExists).toBe(true)
    })

    it("sets challengeExists to false when challenge_count is zero", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload({
        challenge_count: 0,
        challenge_released_at: null,
      })))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.challengeExists).toBe(false)
      expect(result!.challengeReleased).toBe(false)
    })

    it("includes feedback survey fields when present", async () => {
      mockRpcCall("get_organizer_poll_data", mockSuccess(makeRpcPayload({
        status: "completed",
        phase: null,
        results_published_at: "2026-04-29T12:00:00Z",
        location_type: "virtual",
        feedback_survey_url: "https://example.com/survey",
        feedback_survey_sent_at: "2026-04-29T14:00:00Z",
      })))

      const result = await buildOrganizerPollPayload(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.feedbackSurveyUrl).toBe("https://example.com/survey")
      expect(result!.feedbackSurveySentAt).toBe("2026-04-29T14:00:00Z")
      expect(result!.resultsPublishedAt).toBe("2026-04-29T12:00:00Z")
      expect(result!.locationType).toBe("virtual")
    })
  })
})
