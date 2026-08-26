import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { JudgeAssignments } from "@/components/hackathon/judging/judge-assignments"

const originalFetch = globalThis.fetch
let fetcher = mock(async () => Response.json({}))

function renderAssignments() {
  return render(
    <JudgeAssignments
      hackathonId="11111111-1111-1111-1111-111111111111"
      initialJudges={[]}
      initialAssignments={[]}
      initialInvitations={[]}
      submissions={[]}
      anonymousJudging={false}
    />,
  )
}

async function invite(email: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add Judge" }))
  fireEvent.click(screen.getByRole("button", { name: "Invite by email" }))
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: email },
  })
  fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }))
}

beforeEach(() => {
  fetcher = mock(async () => Response.json({}))
  globalThis.fetch = fetcher as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe("JudgeAssignments invitation delivery", () => {
  it("shows queued copy when a draft-event invite will send at go-live", async () => {
    fetcher.mockImplementation(async () =>
      Response.json({
        invitation: { id: "invite-queued" },
        queued: true,
      }),
    )
    renderAssignments()

    await invite("queued@example.com")

    expect(
      await screen.findByText(
        "Invite saved for queued@example.com. It'll send when the event goes live.",
      ),
    ).toBeDefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      email: "queued@example.com",
    })
  })

  it("keeps the dialog open with recovery copy when email delivery is unconfirmed", async () => {
    fetcher.mockImplementation(async () =>
      Response.json({
        invitation: { id: "invite-failed" },
        queued: false,
        delivery: "failed",
      }),
    )
    renderAssignments()

    await invite("retry@example.com")

    expect(
      await screen.findByText(
        "Invite saved for retry@example.com, but we couldn't confirm the email was sent. Use Send again in the invite list.",
      ),
    ).toBeDefined()
    expect(screen.getByRole("dialog")).toBeDefined()
    await waitFor(() => expect(screen.getByText("retry@example.com")).toBeDefined())
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
