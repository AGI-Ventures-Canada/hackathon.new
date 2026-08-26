import { describe, expect, it } from "bun:test"
import { getJudgeInvitationMessage } from "@/lib/judge-invitation-message"

describe("getJudgeInvitationMessage", () => {
  it("says when a draft-event invitation is queued", () => {
    expect(getJudgeInvitationMessage("judge@example.com", true)).toBe(
      "Invite saved for judge@example.com. It'll send when the event goes live.",
    )
  })

  it("says when an invitation was sent now", () => {
    expect(getJudgeInvitationMessage("judge@example.com", false)).toBe(
      "Invitation sent to judge@example.com",
    )
  })

  it("says when an invitation was saved but not sent", () => {
    expect(getJudgeInvitationMessage("judge@example.com", false, true)).toBe(
      "Invite saved for judge@example.com, but we couldn't confirm the email was sent. Use Send again in the invite list.",
    )
  })
})
