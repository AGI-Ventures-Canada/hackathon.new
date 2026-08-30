import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const refresh = mock(() => {})

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({ orgId: "org_test" }),
}))

const { TestEventBanner } = await import(
  "@/components/hackathon/manage/test-event-banner"
)

describe("TestEventBanner", () => {
  beforeEach(() => {
    refresh.mockClear()
  })

  afterEach(() => {
    cleanup()
    mock.restore()
  })

  it("plainly explains the full cleanup before conversion", () => {
    render(<TestEventBanner hackathonId="11111111-1111-4111-8111-111111111111" />)

    fireEvent.click(screen.getByRole("button", { name: "Make this a real event" }))

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "We'll remove everyone, all teams, projects, judges, invites, and scores from this test event. Event setup stays.",
    )
  })

  it("converts in the active organization and refreshes the organizer page", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "launch-lab-test-event",
      status: "draft",
      isTestEvent: false,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })))
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
    render(<TestEventBanner hackathonId="11111111-1111-4111-8111-111111111111" />)
    fireEvent.click(screen.getByRole("button", { name: "Make this a real event" }))

    fireEvent.click(screen.getByRole("button", { name: "Make it real" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/hackathons/11111111-1111-4111-8111-111111111111/convert-test-event",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ expectedOrganizationId: "org_test" }),
      }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })
})
