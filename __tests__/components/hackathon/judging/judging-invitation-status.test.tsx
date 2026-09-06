import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"
import { JudgingInvitationStatus } from "@/components/hackathon/judging/judging-invitation-status"
import type { JudgingSetup } from "@/lib/judging/setup"

const originalFetch = globalThis.fetch
const fetchMock = mock<typeof fetch>()
const failed = {
  id: "failed",
  email: "failed@example.com",
  delivery: "failed",
  deliveryError: "Please try again.",
  nextAttemptAt: null,
  canRemind: false, canRetry: true,
}
const sent = {
  id: "sent",
  email: "sent@example.com",
  delivery: "sent",
  nextReminderAt: "2026-09-06T14:00:00Z",
  canRemind: false, canRetry: true,
}
const setup = {
  id: "event",
  settings: { timezone: "UTC" },
  invitations: [failed, sent],
} as unknown as JudgingSetup

describe("invitation delivery details", () => {
  beforeEach(() => {
    cleanup()
    resetComponentMocks()
    fetchMock.mockReset()
    globalThis.fetch = fetchMock
  })
  afterEach(() => {
    cleanup()
    globalThis.fetch = originalFetch
  })
  it("opens failed delivery details directly and retries only that recipient", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              email: failed.email,
              outcome: "invited",
              delivery: "sent",
              message: "Invitation sent",
            },
          ],
        }),
      ),
    )
    const saved = mock(() => {})
    render(<JudgingInvitationStatus setup={setup} failedOnly onSaved={saved} />)
    expect(screen.queryByText(sent.email)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry invitation" }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/judging/judges/batch")
    expect(JSON.parse(String(options?.body))).toMatchObject({
      emails: [failed.email],
      retryFailed: true,
      preview: false,
    })
    expect(screen.getByRole("status").textContent).toContain("accepted by the provider")
  })
  it("shows the next reminder and disables nudges during the cooldown", () => {
    render(<JudgingInvitationStatus setup={setup} onSaved={() => {}} />)
    expect(
      (screen.getByRole("button", { name: "Remind judge" }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText(/You can remind them again after/)).toBeDefined()
  })
})
