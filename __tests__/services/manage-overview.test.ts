import { describe, it, expect, beforeEach } from "bun:test"
import {
  resetSupabaseMocks,
  mockRpcCall,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const { getManageOverviewStats } = await import("@/lib/services/manage-overview")

describe("getManageOverviewStats", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns counts from the organizer poll payload", async () => {
    mockRpcCall("get_organizer_poll_data", mockSuccess({
      status: "active",
      phase: "build",
      description: null,
      banner_url: null,
      challenge_count: 1,
      challenge_released_at: "2026-04-01T00:00:00Z",
      results_published_at: null,
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-02T00:00:00Z",
      location_type: "virtual",
      feedback_survey_url: null,
      feedback_survey_sent_at: null,
      submission_count: 0,
      unassigned_submission_count: 0,
      participant_count: 25,
      team_count: 8,
      pending_team_approval_count: 2,
      assignment_total: 0,
      assignment_complete: 0,
      judge_count: 0,
      prize_count: 0,
      judge_display_count: 0,
      mentor_open_count: 3,
      challenge_release_time: null,
      pending_judge_invitation_count: 0,
      planned_round_count: 0,
      active_round_count: 0,
      complete_round_count: 0,
      perk_count: 0,
      perks_none: false,
      community_url: null,
      terms_content: null,
    }))

    const result = await getManageOverviewStats("h1")

    expect(result.participantCount).toBe(25)
    expect(result.teamCount).toBe(8)
    expect(result.pendingTeamApprovalCount).toBe(2)
    expect(result.mentorQueue.open).toBe(3)
    expect(result.challengeReleased).toBe(true)
  })

  it("returns zeros on poll errors", async () => {
    mockRpcCall("get_organizer_poll_data", mockError("DB error"))

    const result = await getManageOverviewStats("h1")

    expect(result.participantCount).toBe(0)
    expect(result.teamCount).toBe(0)
    expect(result.pendingTeamApprovalCount).toBe(0)
    expect(result.mentorQueue.open).toBe(0)
    expect(result.challengeReleased).toBe(false)
  })

  it("returns challengeReleased false when not released", async () => {
    mockRpcCall("get_organizer_poll_data", mockSuccess({
      status: "active",
      phase: null,
      description: null,
      banner_url: null,
      challenge_count: 1,
      challenge_released_at: null,
      results_published_at: null,
      starts_at: null,
      ends_at: null,
      location_type: null,
      feedback_survey_url: null,
      feedback_survey_sent_at: null,
      submission_count: 0,
      unassigned_submission_count: 0,
      participant_count: 0,
      team_count: 0,
      pending_team_approval_count: 0,
      assignment_total: 0,
      assignment_complete: 0,
      judge_count: 0,
      prize_count: 0,
      judge_display_count: 0,
      mentor_open_count: 0,
      challenge_release_time: null,
      pending_judge_invitation_count: 0,
      planned_round_count: 0,
      active_round_count: 0,
      complete_round_count: 0,
      perk_count: 0,
      perks_none: false,
      community_url: null,
      terms_content: null,
    }))

    const result = await getManageOverviewStats("h1")

    expect(result.challengeReleased).toBe(false)
  })
})
