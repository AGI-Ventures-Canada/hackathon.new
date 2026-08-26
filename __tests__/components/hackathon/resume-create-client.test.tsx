import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import {
  resetComponentMocks,
  setRouter,
  setSearchParams,
} from "../../lib/component-mocks"
import { createAuthResumeTarget } from "@/lib/auth/create-resume"

const mockReplace = mock((_destination: string) => {})

mock.module("@/components/hackathon/event-import-editor", () => ({
  EventImportRecovery: (props: {
    sourceUrl: string
    storageKey: string
    submitPath: string
  }) => (
    <div
      data-testid="event-import-recovery"
      data-source-url={props.sourceUrl}
      data-storage-key={props.storageKey}
      data-submit-path={props.submitPath}
    />
  ),
}))

const { ResumeCreateClient } = await import(
  "@/components/hackathon/resume-create-client"
)

beforeEach(() => {
  resetComponentMocks()
  mockReplace.mockClear()
  setRouter({ replace: mockReplace })
  setSearchParams(new URLSearchParams())
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

function resumeToken(target: string) {
  return new URL(target, "https://app.example").searchParams.get("token")!
}

describe("ResumeCreateClient", () => {
  it("shows a recovery message when the token is missing", async () => {
    render(<ResumeCreateClient />)

    expect(screen.getByText("Restoring your draft…")).toBeDefined()
    expect(
      await screen.findByText("We couldn't restore that draft"),
    ).toBeDefined()
    expect(
      screen.getByRole("link", { name: "Start a new event" }).getAttribute("href"),
    ).toBe("/create")
  })

  it("continues a stored same-origin redirect", async () => {
    const redirectUrl = `/create?${"draft=x&".repeat(900)}review=true`
    const target = createAuthResumeTarget(redirectUrl)
    expect(target).toMatch(/^\/resume-create\?token=/)
    setSearchParams(new URLSearchParams({ token: resumeToken(target!) }))

    render(<ResumeCreateClient />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(redirectUrl)
    })
    expect(screen.getByText("Restoring your draft…")).toBeDefined()
  })

  it("restores a saved external import without putting it in the URL", async () => {
    const sourceUrl = "https://events.example.com/hackathon"
    const storageKey = "oatmeal:external-import:safe-reference"
    const target = createAuthResumeTarget("/import?review=true", {
      sourceUrl,
      storageKey,
    })
    expect(target).toMatch(/^\/resume-create\?token=/)
    setSearchParams(new URLSearchParams({ token: resumeToken(target!) }))

    render(<ResumeCreateClient />)

    const recovery = await screen.findByTestId("event-import-recovery")
    expect(recovery.getAttribute("data-source-url")).toBe(sourceUrl)
    expect(recovery.getAttribute("data-storage-key")).toBe(storageKey)
    expect(recovery.getAttribute("data-submit-path")).toBe(
      "/api/dashboard/import/event",
    )
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("rejects a malformed token", async () => {
    setSearchParams(new URLSearchParams({ token: "not-a-token" }))
    render(<ResumeCreateClient />)

    expect(
      await screen.findByText("We couldn't restore that draft"),
    ).toBeDefined()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
