import { describe, expect, it } from "bun:test"
import {
  getJudgeAddedMessage,
  getJudgeInvitationMessage,
} from "@/lib/judge-invitation-message"

describe("getJudgeInvitationMessage", () => {
  it("says when a draft-event invitation is queued", () => {
    expect(getJudgeInvitationMessage("judge@example.com", true)).toBe(
      "Invite saved for judge@example.com. This event is still a draft. We'll send it when you go live.",
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

describe("getJudgeAddedMessage", () => {
  it("matches sent, queued, and failed delivery states", () => {
    expect(getJudgeAddedMessage("Jamie", false)).toBe(
      "Jamie was added as a judge and emailed.",
    )
    expect(getJudgeAddedMessage("Jamie", true)).toBe(
      "Jamie was added as a judge. This event is still a draft. We'll send it when you go live.",
    )
    expect(getJudgeAddedMessage("Jamie", false, true)).toBe(
      "Jamie was added as a judge, but we couldn't confirm the email was sent.",
    )
  })
})
