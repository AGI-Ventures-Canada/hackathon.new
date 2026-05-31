import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../lib/component-mocks"

const mockRefresh = mock(() => {})
const mockCreateObjectURL = mock(() => "blob:submission-preview")
const mockRevokeObjectURL = mock(() => {})
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
  mockCreateObjectURL.mockClear()
  mockRevokeObjectURL.mockClear()
  Object.defineProperty(URL, "createObjectURL", {
    value: mockCreateObjectURL,
    writable: true,
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    value: mockRevokeObjectURL,
    writable: true,
  })
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

function completeRequiredSteps(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText("Title"), {
    target: { value: "Project Atlas" },
  })
  fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

  fireEvent.change(within(dialog).getByLabelText("GitHub URL"), {
    target: { value: "github.com/acme/atlas" },
  })
  fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
  fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
  fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

  fireEvent.change(within(dialog).getByLabelText("What is this?"), {
    target: { value: "An AI teammate for hackathon teams." },
  })
  fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
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
    expect(within(dialog).queryByRole("textbox", { name: /Video link/ })).toBeNull()
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
    expect(within(dialog).getByRole("textbox", { name: /Video link/ })).toBeDefined()

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
    expect(within(dialog).getByLabelText("Live App / Project URL")).toBeDefined()

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))
    expect(within(dialog).getByLabelText("What is this?")).toBeDefined()

    fireEvent.change(within(dialog).getByLabelText("What is this?"), {
      target: { value: "An AI teammate for hackathon teams." },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Go to Screenshots step" })).toBeDefined()
      expect(within(dialog).getAllByText("Screenshots").length).toBeGreaterThan(0)
      expect(within(dialog).getByText("Upload screenshots")).toBeDefined()
      expect(within(dialog).queryByText("App Screenshot")).toBeNull()
    })
  })

  it("shows a video preview after a supported video link is entered", async () => {
    const dialog = openDialog()

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Project Atlas" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.change(within(dialog).getByLabelText("GitHub URL"), {
      target: { value: "github.com/acme/atlas" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.change(within(dialog).getByRole("textbox", { name: /Video link/ }), {
      target: { value: "youtube.com/watch?v=dQw4w9WgXcQ" },
    })

    await waitFor(() => {
      expect(within(dialog).getByTitle("YouTube video")).toBeDefined()
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

    fireEvent.change(within(dialog).getByRole("textbox", { name: /Video link/ }), {
      target: { value: "youtube.com/watch?v=atlas-demo" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }))

    fireEvent.change(within(dialog).getByLabelText("Live App / Project URL"), {
      target: { value: "atlas.vercel.app" },
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
      demoVideoUrl: "https://youtube.com/watch?v=atlas-demo",
    })
  })

  it("shows a disabled 'Waiting for team approval' button when the team is pending approval", () => {
    render(
      <SubmissionButton
        hackathonSlug="test-hackathon"
        status="active"
        isRegistered
        submission={null}
        pendingTeamApproval
      />
    )

    const button = screen.getByRole("button", { name: /Waiting for team approval/i })
    expect(button).toBeDefined()
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole("button", { name: "Submit Project" })).toBeNull()
  })

  it("does not open the submission dialog when the team is pending approval", () => {
    render(
      <SubmissionButton
        hackathonSlug="test-hackathon"
        status="active"
        isRegistered
        submission={null}
        pendingTeamApproval
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Waiting for team approval/i }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("renders the submit button when the team is not pending approval", () => {
    render(
      <SubmissionButton
        hackathonSlug="test-hackathon"
        status="active"
        isRegistered
        submission={null}
        pendingTeamApproval={false}
      />
    )

    expect(screen.getByRole("button", { name: "Submit Project" })).toBeDefined()
    expect(screen.queryByRole("button", { name: /Waiting for team approval/i })).toBeNull()
  })

  it("does not claim screenshots changed when the first upload fails", async () => {
    mockFetch.mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith("/submissions/screenshot")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Failed to upload screenshot", code: "upload_failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        )
      }

      return Promise.resolve(
        new Response(JSON.stringify({ submissionId: "sub_123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    })
    const dialog = openDialog()
    completeRequiredSteps(dialog)

    const fileInput = dialog.querySelector("input[type='file']") as HTMLInputElement
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["screenshot"], "screenshot.png", { type: "image/png" })],
      },
    })

    await waitFor(() => {
      expect(within(dialog).getByAltText("Screenshot 1 preview")).toBeDefined()
    })

    fireEvent.click(within(dialog).getByRole("button", { name: "Submit Project" }))

    await waitFor(() => {
      expect(
        within(dialog).getByText(
          "Your project was saved, but screenshots were not updated. Failed to upload screenshot"
        )
      ).toBeDefined()
    })
    expect(within(dialog).queryByText(/screenshot change failed/)).toBeNull()
  })
})
