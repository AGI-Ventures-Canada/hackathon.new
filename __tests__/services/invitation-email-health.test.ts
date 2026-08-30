import { beforeEach, describe, expect, it } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  countFailedReminderEmails,
  countUnsentInvitationEmails,
  getUnsentInvitationEmailCounts,
} = await import(
  "@/lib/services/invitation-email-health"
)

describe("invitation email health", () => {
  beforeEach(() => resetSupabaseMocks())

  it("adds unsent invitations and direct judge notifications", async () => {
    setMockFromImplementation((table) => createChainableMock({
      data: null,
      error: null,
      count: table === "team_invitations"
        ? 2
        : table === "judge_invitations"
          ? 3
          : 4,
    }))

    await expect(countUnsentInvitationEmails("h1")).resolves.toBe(9)
    await expect(getUnsentInvitationEmailCounts("h1")).resolves.toEqual({
      teams: 2,
      judges: 7,
      total: 9,
    })
  })

  it("fails open for the organizer page when a count query fails", async () => {
    setMockFromImplementation((table) =>
      createChainableMock(
        table === "team_invitations"
          ? { data: null, error: { message: "down" } }
          : { data: null, error: null, count: table === "judge_invitations" ? 1 : 0 },
      ),
    )

    await expect(countUnsentInvitationEmails("h1")).resolves.toBe(1)
  })

  it("counts reminder failures and exhausted judge/workflow deliveries", async () => {
    setMockFromImplementation((table) => createChainableMock({
      data: null,
      error: null,
      count: table === "scheduled_reminders"
        ? 4
        : table === "judge_pending_notifications"
          ? 2
          : 1,
    }))

    await expect(countFailedReminderEmails("h1")).resolves.toBe(7)
  })

  it("keeps healthy counts visible when one health query fails", async () => {
    setMockFromImplementation((table) => createChainableMock(
      table === "lifecycle_notification_dispatches"
        ? { data: null, error: { message: "down" } }
        : { data: null, error: null, count: 2 },
    ))

    await expect(countFailedReminderEmails("h1")).resolves.toBe(4)
  })
})
