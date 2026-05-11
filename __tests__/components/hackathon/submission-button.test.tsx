import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../lib/component-mocks"

const mockRefresh = mock(() => {})
const mockFetch = mock(() =>
  Promise.resolve(
    new Response(JSON.stringify({ submissionId: "sub_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
)

import { clerkState, clerkMock } from "../../lib/clerk-mock"

mock.module("@clerk/nextjs", () => clerkMock)

const { SubmissionButton } = await import("@/components/hackathon/submission-button")

beforeEach(() => {
  resetComponentMocks()
  clerkState.isLoaded = true
  clerkState.isSignedIn = true
  setRouter({ refresh: mockRefresh })
  window.localStorage.clear()
  mockRefresh.mockClear()
  mockFetch.mockClear()
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ submissionId: "sub_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  )
  globalThis.fetch = mockFetch as typeof fetch
})

afterEach(() => {
  cleanup()
})

function renderSubmissionButton() {
  return render(
    <SubmissionButton
      hackathonSlug="test-hackathon"
      status="active"
      isRegistered
      submission={null}
    />
  )
}

function openDialog() {
  renderSubmissionButton()
  fireEvent.click(screen.getByRole("button", { name: "Submit Project" }))
  return screen.getByRole("dialog")
}

describe("SubmissionButton", () => {
  it("shows the updated copy and starts with only the title field", () => {
    const dialog = openDialog()

    expect(within(dialog).getByText("Submit Your Project")).toBeDefined()
    expect(
      within(dialog).getByText("Submit your hackathon project to the competition.")
    ).toBeDefined()
    expect(within(dialog).getByLabelText("Title")).toBeDefined()
    expect(within(dialog).queryByLabelText("GitHub URL")).toBeNull()
    expect(within(dialog).queryByText("Project Title")).toBeNull()
    expect(within(dialog).queryByText("Elevator Pitch")).toBeNull()
    expect(within(dialog).queryByText("App Screenshot")).toBeNull()
  })

  it("validates and advances one field at a time", async () => {
    const dialog = openDialog()

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
    expect(within(dialog).getByText("Title is required")).toBeDefined()

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Project Atlas" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
    expect(within(dialog).getByLabelText("GitHub URL")).toBeDefined()
    expect(within(dialog).queryByLabelText("Title")).toBeNull()

    fireEvent.change(within(dialog).getByLabelText("GitHub URL"), {
      target: { value: "https://github.com/acme/atlas" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
    expect(within(dialog).getByLabelText("Live App / Project URL")).toBeDefined()

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
    expect(within(dialog).getByLabelText("Video link (optional)")).toBeDefined()

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
    expect(within(dialog).getByLabelText("What is this?")).toBeDefined()

    fireEvent.change(within(dialog).getByLabelText("What is this?"), {
      target: { value: "An AI teammate for hackathon teams." },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Go to Screenshots step" })).toBeDefined()
      expect(within(dialog).getAllByText("Screenshots").length).toBeGreaterThan(0)
      expect(within(dialog).getByText("Upload screenshot")).toBeDefined()
      expect(within(dialog).queryByText("App Screenshot")).toBeNull()
    })
  })

  it("lets users jump between steps and restores draft progress after closing", async () => {
    const dialog = openDialog()

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Project Atlas" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to GitHub step" }))

    expect(within(dialog).getByLabelText("GitHub URL")).toBeDefined()

    fireEvent.change(within(dialog).getByLabelText("GitHub URL"), {
      target: { value: "github.com/acme/atlas" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Close Dialog" }))

    fireEvent.click(screen.getByRole("button", { name: "Submit Project" }))

    await waitFor(() => {
      const reopenedDialog = screen.getByRole("dialog")
      expect(within(reopenedDialog).getByLabelText("GitHub URL")).toBeDefined()
      expect(
        (within(reopenedDialog).getByLabelText("GitHub URL") as HTMLInputElement).value
      ).toBe("github.com/acme/atlas")
    })
  })

  it("submits the completed step flow", async () => {
    const dialog = openDialog()

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Project Atlas" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.change(within(dialog).getByLabelText("GitHub URL"), {
      target: { value: "github.com/acme/atlas" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.change(within(dialog).getByLabelText("Live App / Project URL"), {
      target: { value: "atlas.vercel.app" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.change(within(dialog).getByLabelText("Video link (optional)"), {
      target: { value: "youtube.com/watch?v=dQw4w9WgXcQ" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.change(within(dialog).getByLabelText("What is this?"), {
      target: { value: "An AI teammate for hackathon teams." },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.click(within(dialog).getByRole("button", { name: "Submit Project" }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockRefresh).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/public/hackathons/test-hackathon/submissions")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Project Atlas",
      description: "An AI teammate for hackathon teams.",
      githubUrl: "https://github.com/acme/atlas",
      liveAppUrl: "https://atlas.vercel.app",
      demoVideoUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    })
  })
})
