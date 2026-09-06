import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { JudgingNotification } from "@/lib/services/judging-notifications"

type SendEmailInput = {
  to: string | string[]; subject: string; html?: string; text?: string
  from?: string; replyTo?: string; headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>; idempotencyKey?: string
}
let sendEmailImpl: (input: SendEmailInput) => Promise<{ id: string } | null> = async () => ({ id: "accepted" })
const mockSendEmail = mock((input: SendEmailInput) => sendEmailImpl(input))
const mockSendEmailWithResult = mock(async (input: SendEmailInput, execution?: { beforeAttempt?: () => Promise<void> }) => {
  try {
    await execution?.beforeAttempt?.()
    const result = await mockSendEmail(input)
    return result ? { ok: true, id: result.id } : { ok: false, id: null }
  } catch { return { ok: false, id: null } }
})
mock.module("@/lib/email/resend", () => ({ sendEmailWithResult: mockSendEmailWithResult }))
const { sendJudgingUpdateEmail } = await import("@/lib/email/judging-updates")
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
const originalReplyTo = process.env.RESEND_REPLY_TO_EMAIL
beforeEach(() => {
  mockSendEmail.mockClear()
  mockSendEmailWithResult.mockClear()
  sendEmailImpl = async () => ({ id: "accepted" })
  process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
  process.env.RESEND_REPLY_TO_EMAIL = "Judging help <judging@example.com>"
})
afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO_EMAIL
  else process.env.RESEND_REPLY_TO_EMAIL = originalReplyTo
})

describe("judging inbox update emails", () => {
  const notice: JudgingNotification = {
    id: "notice-1", hackathon_id: "event-1", clerk_user_id: "judge-1", round_id: null,
    kind: "scores_due", identity: "event/deadline/1h", title: "Your scores are due soon",
    body: "You have 2 reviews left to finish.", action_path: "/e/build/judge?view=left",
    metadata: { deadline: "2026-11-01T07:30:00Z", urgency: "urgent" },
    scheduled_for: "2026-11-01T06:30:00Z", created_at: "2026-11-01T06:30:00Z",
    email_required: true, email_sent_at: null, read_at: null, resolved_at: null, fail_count: 0,
  }
  const input = { to: "judge@example.com", notification: notice, eventName: "Build Together", timezone: "America/Toronto" }

  it("uses the current review count, local judging deadline, and direct work link", async () => {
    expect(await sendJudgingUpdateEmail(input)).toBe(true)
    const delivered = mockSendEmail.mock.calls[0][0]
    expect(delivered.text).toContain("You have 2 reviews left to finish.")
    expect(delivered.text).toContain("Sunday, November 1, 2026 at 2:30 AM EST")
    expect(delivered.html).toContain("https://example.com/e/build/judge?view=left")
    expect(delivered.text).toContain("Open my judging")
    expect(delivered.tags).toContainEqual({ name: "type", value: "judging_scores_due" })
    expect(delivered.idempotencyKey).toBe("judging-update/notice-1")
  })

  it("links to personal reminder settings and gives a truthful reply unsubscribe", async () => {
    await sendJudgingUpdateEmail(input)
    const delivered = mockSendEmail.mock.calls[0][0]
    expect(delivered.html).toContain("https://example.com/e/build/judge#judging-updates")
    expect(delivered.text).toContain("Change my reminders")
    expect(delivered.headers?.["List-Unsubscribe"]).toBe("<mailto:judging@example.com?subject=unsubscribe>")
    expect(delivered.headers?.["List-Unsubscribe-Post"]).toBeUndefined()
    expect(delivered.replyTo).toBe("judging@example.com")
  })

  it("routes organizer notices to judging management and its own reminder controls", async () => {
    await sendJudgingUpdateEmail({ ...input, notification: { ...notice, kind: "organizer_progress", action_path: "/e/build/manage/judging" } })
    const delivered = mockSendEmail.mock.calls[0][0]
    expect(delivered.text).toContain("Check judging")
    expect(delivered.html).toContain("https://example.com/e/build/manage/judging#judging-updates")
    expect(delivered.text).not.toContain("Open my judging")
  })

  it("never reports provider rejection or missing URL configuration as delivery", async () => {
    sendEmailImpl = async () => null
    expect(await sendJudgingUpdateEmail(input)).toBe(false)
    mockSendEmail.mockClear()
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(await sendJudgingUpdateEmail(input)).toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("keeps a stable delivery key when retrying a provider error", async () => {
    sendEmailImpl = async () => { throw new Error("Provider unavailable") }
    expect(await sendJudgingUpdateEmail(input)).toBe(false)
    sendEmailImpl = async () => ({ id: "accepted-on-retry" })
    expect(await sendJudgingUpdateEmail(input)).toBe(true)
    expect(mockSendEmail.mock.calls.map(([call]) => call.idempotencyKey)).toEqual(["judging-update/notice-1", "judging-update/notice-1"])
  })

  it("rechecks eligibility after rendering and before contacting the provider", async () => {
    const beforeAttempt = mock(async () => { throw new Error("Judging closed") })
    expect(await sendJudgingUpdateEmail({ ...input, beforeAttempt })).toBe(false)
    expect(beforeAttempt).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendEmailWithResult.mock.calls[0][1]?.beforeAttempt).toBe(beforeAttempt)
  })
})
