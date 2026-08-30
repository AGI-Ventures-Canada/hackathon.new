import { beforeEach, describe, expect, it } from "bun:test"
import {
  createChainableMock,
  mockRpcCall,
  mockSuccess,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  createOrganizerCustomActionItem,
  deleteOrganizerCustomActionItem,
  getOrganizerTaskBoard,
  importLegacyOrganizerActionState,
  setOrganizerActionItemState,
} = await import(
  "@/lib/services/organizer-action-items"
)

const hackathonId = "11111111-1111-1111-1111-111111111111"

function pollData() {
  return {
    id: hackathonId,
    slug: "build-day",
    name: "Build Day",
    status: "draft",
    phase: null,
    description: null,
    banner_url: null,
    challenge_count: 0,
    challenge_released_at: null,
    results_published_at: null,
    starts_at: "2099-09-10T12:00:00.000Z",
    ends_at: "2099-09-11T20:00:00.000Z",
    registration_opens_at: "2099-08-30T12:00:00.000Z",
    registration_closes_at: "2099-09-09T20:00:00.000Z",
    allow_late_registration: true,
    location_type: "virtual",
    require_location_verification: false,
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
    unsent_team_invitation_email_count: 0,
    unsent_judge_invitation_email_count: 0,
    failed_reminder_count: 0,
    planned_round_count: 0,
    active_round_count: 0,
    complete_round_count: 0,
    perk_count: 0,
    perks_none: false,
    community_url: null,
    terms_content: null,
  }
}

describe("organizer action item service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockRpcCall("get_organizer_poll_data", mockSuccess(pollData()))
  })

  it("merges generated state and shared custom tasks", async () => {
    setMockFromImplementation((table) => {
      if (table === "prizes" || table === "judging_criteria") {
        return createChainableMock({ data: [], error: null })
      }
      if (table === "organizer_action_item_state") {
        return createChainableMock({
          data: [{
            hackathon_id: hackathonId,
            action_id: "review-team-settings",
            item_kind: "generated",
            state: "completed",
            item: {
              id: "review-team-settings",
              label: "Review team size settings",
              severity: "info",
              close: { kind: "manual" },
            },
            updated_at: "2026-08-30T12:00:00.000Z",
          }],
          error: null,
        })
      }
      if (table === "organizer_custom_action_items") {
        return createChainableMock({
          data: [{
            id: "custom-call-venue",
            hackathon_id: hackathonId,
            label: "Call the venue",
            severity: "warning",
            completed_at: null,
            updated_at: "2026-08-30T13:00:00.000Z",
          }],
          error: null,
        })
      }
      return createChainableMock({ data: [], error: null })
    })

    const page = await getOrganizerTaskBoard(hackathonId, { state: "all", limit: 50 })

    expect(page.event).toEqual({ name: "Build Day", slug: "build-day" })
    expect(page.items.find((task) => task.taskRef === "review-team-settings")?.state).toBe(
      "completed",
    )
    expect(page.items.find((task) => task.taskRef === "custom-call-venue")).toMatchObject({
      custom: true,
      state: "pending",
      label: "Call the venue",
    })
  })

  it("paginates the shared list and reports a stable next offset", async () => {
    setMockFromImplementation((table) => {
      if (table === "prizes" || table === "judging_criteria") {
        return createChainableMock({ data: [], error: null })
      }
      return createChainableMock({ data: [], error: null })
    })

    const page = await getOrganizerTaskBoard(hackathonId, { offset: 0, limit: 2 })

    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.nextOffset).toBe(2)
  })

  it("fails without applying a partial board when stored custom tasks exceed the cap", async () => {
    setMockFromImplementation((table) => {
      if (table === "prizes" || table === "judging_criteria") {
        return createChainableMock({ data: [], error: null })
      }
      if (table === "organizer_custom_action_items") {
        return createChainableMock({
          data: Array.from({ length: 501 }, (_, index) => ({
            id: `custom-${index}`,
            hackathon_id: hackathonId,
            label: `Task ${index}`,
            severity: "info",
            completed_at: null,
            updated_at: "2026-08-30T13:00:00.000Z",
          })),
          error: null,
        })
      }
      return createChainableMock({ data: [], error: null })
    })

    await expect(getOrganizerTaskBoard(hackathonId)).rejects.toMatchObject({
      code: "task_board_unavailable",
    })
  })

  it("maps the database task cap to a clear retry-safe conflict", async () => {
    setMockFromImplementation((table) => {
      if (table === "organizer_custom_action_items") {
        return createChainableMock({
          data: null,
          error: {
            code: "23514",
            message: "organizer_custom_action_items_limit",
          },
        })
      }
      return createChainableMock({ data: [], error: null })
    })

    await expect(
      createOrganizerCustomActionItem(
        hackathonId,
        "One task too many",
        "info",
        "user-1",
        "custom-over-limit",
      ),
    ).rejects.toMatchObject({ code: "custom_action_limit_reached" })
  })

  it("checks a custom task version in the update itself", async () => {
    const custom = createChainableMock({ data: null, error: null })
    setMockFromImplementation((table) => {
      if (table === "organizer_custom_action_items") return custom
      return createChainableMock({ data: [], error: null })
    })

    await expect(
      setOrganizerActionItemState(
        hackathonId,
        "custom-call-venue",
        "completed",
        "user-1",
        "2026-08-30T12:00:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "stale_action" })
    expect(custom.eq).toHaveBeenCalledWith(
      "updated_at",
      "2026-08-30T12:00:00.000Z",
    )
    expect(custom.select).toHaveBeenCalledTimes(1)
  })

  it("checks a custom task version in the delete itself", async () => {
    const custom = createChainableMock({ data: [], error: null })
    setMockFromImplementation((table) => {
      if (table === "organizer_custom_action_items") return custom
      return createChainableMock({ data: [], error: null })
    })

    await expect(
      deleteOrganizerCustomActionItem(
        hackathonId,
        "custom-call-venue",
        "2026-08-30T12:00:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "stale_action" })
    expect(custom.eq).toHaveBeenCalledWith(
      "updated_at",
      "2026-08-30T12:00:00.000Z",
    )
  })

  it("does not upsert over a stale generated task", async () => {
    const generated = createChainableMock({ data: null, error: null })
    setMockFromImplementation((table) => {
      if (table === "prizes" || table === "judging_criteria") {
        return createChainableMock({ data: [], error: null })
      }
      if (table === "organizer_action_item_state") return generated
      return createChainableMock({ data: [], error: null })
    })

    await expect(
      setOrganizerActionItemState(
        hackathonId,
        "review-team-settings",
        "completed",
        "user-1",
        "2026-08-30T12:00:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "stale_action" })
    expect(generated.update).toHaveBeenCalledTimes(1)
    expect(generated.upsert).not.toHaveBeenCalled()
    expect(generated.eq).toHaveBeenCalledWith(
      "updated_at",
      "2026-08-30T12:00:00.000Z",
    )
  })

  it("rejects false historical completion snapshots during legacy import", async () => {
    const generated = createChainableMock({ data: [], error: null })
    setMockFromImplementation((table) => {
      if (table === "organizer_action_item_state") return generated
      return createChainableMock({ data: [], error: null })
    })

    const result = await importLegacyOrganizerActionState(
      hackathonId,
      {
        completedIds: ["old-transition", "old-auto"],
        dismissedIds: [],
        customItems: [],
        completedSnapshots: {
          "old-transition": {
            id: "old-transition",
            label: "Move on",
            severity: "urgent",
            close: { kind: "transition", targetStatus: "active" },
          },
          "old-auto": {
            id: "old-auto",
            label: "Email everyone",
            severity: "warning",
            close: { kind: "auto", isComplete: false },
          },
        },
      },
      "user-1",
    )

    expect(result.generatedCount).toBe(0)
    expect(generated.upsert).not.toHaveBeenCalled()
  })
})
