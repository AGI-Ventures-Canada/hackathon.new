import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../lib/component-mocks"
import { dispatchPrepareProjectAction } from "@/lib/webmcp/client-events"
import { projectDraftStorageKey } from "@/lib/webmcp/project-draft-storage"
import type { Submission } from "@/lib/db/hackathon-types"
import type {
  EventGuideContext,
  EventViewerContext,
} from "@/lib/webmcp/event-attendee-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"

const mockRefresh = mock(() => {})
const mockCreateObjectURL = mock(() => "blob:submission-preview")
const mockRevokeObjectURL = mock(() => {})
const mockFetch = mock(() =>
  Promise.resolve(
    new Response(JSON.stringify({ submissionId: "sub_123", screenshots: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
)

import { clerkState, clerkMock } from "../../lib/clerk-mock"

mock.module("@clerk/nextjs", () => clerkMock)

const { SubmissionButton } = await import("@/components/hackathon/submission-button")
const { EventWebMcpTools } = await import("@/components/hackathon/event-webmcp-tools")

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
      new Response(JSON.stringify({ submissionId: "sub_123", screenshots: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  )
  globalThis.fetch = mockFetch as typeof fetch
})

afterEach(() => {
  cleanup()
  delete document.modelContext
})

function renderSubmissionButton(submission: Submission | null = null) {
  return render(
    <SubmissionButton
      hackathonSlug="test-hackathon"
      status="active"
      isRegistered
      submission={submission}
    />
  )
}

function openDialog(submission: Submission | null = null) {
  renderSubmissionButton(submission)
  fireEvent.click(screen.getByRole("button", {
    name: submission ? "Edit Submission" : "Submit Project",
  }))
  return screen.getByRole("dialog")
}

const existingSubmission = {
  id: "sub_123",
  hackathon_id: "hackathon_123",
  participant_id: "participant_123",
  team_id: null,
  title: "Project Atlas",
  description: "An AI teammate for hackathon teams.",
  github_url: "https://github.com/acme/atlas",
  live_app_url: "https://atlas.vercel.app",
  demo_video_url: "https://youtube.com/watch?v=atlas-demo",
  screenshot_url: "https://storage.test/screenshot-1.webp",
  status: "submitted",
  metadata: {
    screenshotUrls: {
      "0": "https://storage.test/screenshot-1.webp",
      "1": "https://storage.test/screenshot-2.webp",
    },
  },
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
} as Submission

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

  it("preserves saved progress and screenshots when an agent prepares project fields", async () => {
    window.localStorage.setItem(
      "oatmeal:submission-draft:test-hackathon",
      JSON.stringify({
        title: "Older title",
        githubUrl: "https://github.com/acme/older",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Older description",
        currentStep: 5,
        screenshots: [
          { slot: 0, url: "https://storage.test/draft-1.webp" },
          { slot: 1, url: "https://storage.test/draft-2.webp" },
        ],
      })
    )
    renderSubmissionButton()

    let outcome: ReturnType<typeof dispatchPrepareProjectAction> | undefined
    act(() => {
      outcome = dispatchPrepareProjectAction({
        title: "Prepared title",
        githubUrl: "https://github.com/acme/prepared",
        liveAppUrl: "https://prepared.example.com",
        demoVideoUrl: "https://video.example.com/demo",
        description: "Prepared description",
      })
    })

    expect(outcome).toEqual({ ok: true })
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByAltText("Screenshot 1 preview")).toBeDefined()
    expect(within(dialog).getByAltText("Screenshot 2 preview")).toBeDefined()
    const stored = JSON.parse(
      window.localStorage.getItem(
        projectDraftStorageKey("test-hackathon", "user_123")
      ) as string
    )
    expect(stored).toEqual({
      title: "Prepared title",
      githubUrl: "https://github.com/acme/prepared",
      liveAppUrl: "https://prepared.example.com",
      demoVideoUrl: "https://video.example.com/demo",
      description: "Prepared description",
      currentStep: 5,
      screenshots: [
        { slot: 0, url: "https://storage.test/draft-1.webp" },
        { slot: 1, url: "https://storage.test/draft-2.webp" },
      ],
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to Title step" }))
    expect((within(dialog).getByLabelText("Title") as HTMLInputElement).value).toBe("Prepared title")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("safely restores a legacy screenshot draft and ignores invalid screenshot slots", async () => {
    window.localStorage.setItem(
      "oatmeal:submission-draft:test-hackathon",
      JSON.stringify({
        title: "Legacy project",
        githubUrl: "github.com/acme/legacy",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Legacy description",
        currentStep: 999,
        screenshots: [
          { slot: 9, url: "https://storage.test/invalid.webp" },
          { slot: 0, url: "" },
        ],
        screenshotPreview: "https://storage.test/legacy.webp",
      }),
    )

    const dialog = openDialog()
    expect(await within(dialog).findByText("Add another screenshot")).toBeDefined()
    expect(within(dialog).getByAltText("Screenshot 1 preview").getAttribute("src"))
      .toBe("https://storage.test/legacy.webp")
    expect(within(dialog).queryByAltText("Screenshot 2 preview")).toBeNull()
  })

  it("falls back to an empty draft when saved browser data is malformed", () => {
    window.localStorage.setItem(
      "oatmeal:submission-draft:test-hackathon",
      "{not-json",
    )
    const dialog = openDialog()
    expect(within(dialog).getByLabelText("Title")).toBeDefined()
    expect((within(dialog).getByLabelText("Title") as HTMLInputElement).value).toBe("")
  })

  it("fails closed when browser storage does not retain an agent-prepared draft", async () => {
    const originalStorage = window.localStorage
    const values = new Map<string, string>()
    const unverifiedStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (_key: string, _value: string) => {},
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: () => null,
      length: 0,
    } as Storage
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: unverifiedStorage,
    })
    try {
      renderSubmissionButton()
      let outcome: ReturnType<typeof dispatchPrepareProjectAction> | undefined
      act(() => {
        outcome = dispatchPrepareProjectAction({
          title: "Prepared title",
          githubUrl: "https://github.com/acme/prepared",
          liveAppUrl: "",
          demoVideoUrl: "",
          description: "Prepared description",
        })
      })
      expect(outcome).toMatchObject({
        ok: false,
        error: { code: "storage_unavailable", retryable: false },
      })
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalStorage,
      })
    }
  })

  it("revokes an unsaved blob preview when agent preparation replaces a closed form", async () => {
    const dialog = openDialog()
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to Screenshots step" }))
    fireEvent.change(dialog.querySelector("input[type='file']") as HTMLInputElement, {
      target: {
        files: [new File(["image"], "preview.png", { type: "image/png" })],
      },
    })
    await waitFor(() => expect(within(dialog).getByAltText("Screenshot 1 preview")).toBeDefined())
    fireEvent.click(screen.getByRole("button", { name: "Close Dialog" }))

    act(() => {
      dispatchPrepareProjectAction({
        title: "Prepared title",
        githubUrl: "https://github.com/acme/prepared",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Prepared description",
      })
    })
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:submission-preview")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects URL credentials and reports signed-out WebMCP storage failures", async () => {
    const registeredTools: WebMcpTool[] = []
    document.modelContext = {
      registerTool: mock(async (tool) => {
        registeredTools.push(tool)
      }),
    }
    clerkState.isSignedIn = false
    const originalStorage = window.localStorage
    const blockedStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Storage is blocked", "SecurityError")
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blockedStorage,
    })
    const guide: EventGuideContext = {
      name: "Agent Jam",
      slug: "test-hackathon",
      description: "Build useful agents.",
      status: "active",
      startsAt: "2026-08-25T12:00:00.000Z",
      endsAt: "2026-08-26T12:00:00.000Z",
      locationType: "virtual",
      locationName: null,
      locationUrl: "https://example.com",
      organizerName: "AGI Ventures",
      schedule: [],
      announcements: [],
      challenges: [],
      resultsPublished: false,
    }
    const viewer: EventViewerContext = {
      signedIn: false,
      registered: false,
      role: null,
      participantCount: 12,
      nextStep: "Sign in and register.",
      sponsor: null,
      team: null,
      project: null,
    }

    try {
      render(
        <>
          <EventWebMcpTools
            guide={guide}
            viewer={viewer}
            canRegisterViewer
            registrationOpensAt={null}
            isFormingCaptain={false}
            registrationClosesAt={null}
            allowLateRegistration
            atCapacity={false}
            isOrganizer={false}
            viewerUserId={null}
          />
          <SubmissionButton
            hackathonSlug="test-hackathon"
            status="active"
            isRegistered={false}
            submission={null}
          />
        </>,
      )
      await waitFor(() => {
        expect(registeredTools.some((tool) => tool.name === "prepare_project")).toBe(true)
      })
      const prepareProject = registeredTools.find((tool) => tool.name === "prepare_project")!
      const credentialResult = await prepareProject.execute({
        title: "Prepared title",
        githubUrl: "https://user:secret@github.com/acme/prepared",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Prepared description",
      }, { signal: new AbortController().signal })
      expect(credentialResult).toEqual({
        ok: false,
        error: {
          code: "invalid_github_url",
          message: "Use a GitHub repository URL.",
          retryable: false,
        },
      })

      let result: Awaited<ReturnType<WebMcpTool["execute"]>> | undefined
      await act(async () => {
        result = await prepareProject.execute({
          title: "Prepared title",
          githubUrl: "https://github.com/acme/prepared",
          liveAppUrl: "",
          demoVideoUrl: "",
          description: "Prepared description",
        }, { signal: new AbortController().signal })
      })

      expect(result).toEqual({
        ok: false,
        error: {
          code: "storage_unavailable",
          message: "Turn on browser storage, then try again.",
          retryable: false,
        },
      })
      expect(screen.queryByText("Project draft ready")).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalStorage,
      })
    }
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
    expect(url).toBe("/api/public/hackathons/test-hackathon/submissions/complete")
    expect(init.method).toBe("POST")
    expect(init.headers).toBeUndefined()
    const formData = init.body as FormData
    expect(JSON.parse(formData.get("payload") as string)).toEqual({
      title: "Project Atlas",
      description: "An AI teammate for hackathon teams.",
      githubUrl: "https://github.com/acme/atlas",
      liveAppUrl: "https://atlas.vercel.app",
      demoVideoUrl: "https://youtube.com/watch?v=atlas-demo",
      retainedScreenshotSlots: [],
      requestId: expect.any(String),
    })
  })

  it("uploads a new screenshot with the project in one request", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({
        submissionId: "sub_123",
        screenshots: [{ slot: 0, url: "https://storage.test/saved.webp" }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const dialog = openDialog()
    completeRequiredSteps(dialog)
    const screenshot = new File(["screenshot"], "screenshot.png", { type: "image/png" })
    fireEvent.change(dialog.querySelector("input[type='file']") as HTMLInputElement, {
      target: { files: [screenshot] },
    })

    await waitFor(() => {
      expect(within(dialog).getByAltText("Screenshot 1 preview")).toBeDefined()
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit Project" }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockRefresh).toHaveBeenCalledTimes(1)
    })
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/public/hackathons/test-hackathon/submissions/complete")
    const formData = init.body as FormData
    const uploadedScreenshot = formData.get("screenshot_0") as File
    expect(uploadedScreenshot.name).toBe("screenshot.png")
    expect(uploadedScreenshot.type).toBe("image/png")
    expect(uploadedScreenshot.size).toBe(screenshot.size)
    expect(JSON.parse(formData.get("payload") as string).retainedScreenshotSlots).toEqual([])
  })

  it("removes an existing screenshot with one request", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({
        submissionId: "sub_123",
        screenshots: [{ slot: 1, url: "https://storage.test/screenshot-2.webp" }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const dialog = openDialog(existingSubmission)
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to Screenshots step" }))
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Remove" })[0])
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockRefresh).toHaveBeenCalledTimes(1)
    })
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const formData = init.body as FormData
    expect(JSON.parse(formData.get("payload") as string).retainedScreenshotSlots).toEqual([1])
    expect(formData.get("screenshot_0")).toBeNull()
    expect(formData.get("screenshot_1")).toBeNull()
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

  it("shows a distinct disabled button when the team was disbanded", () => {
    render(
      <SubmissionButton
        hackathonSlug="test-hackathon"
        status="active"
        isRegistered
        submission={null}
        teamStatus="disbanded"
      />
    )

    const button = screen.getByRole("button", { name: "Team is no longer active" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute("title")).toBe(
      "Your team is no longer active. Ask the organizer if you need help."
    )
    expect(screen.queryByRole("button", { name: "Submit Project" })).toBeNull()
  })

  it("rejects screenshots over 4MB in total before the final request", async () => {
    const dialog = openDialog()
    completeRequiredSteps(dialog)
    const fileInput = dialog.querySelector("input[type='file']") as HTMLInputElement
    fireEvent.change(fileInput, {
      target: {
        files: [
          new File([new Uint8Array(2_100_000)], "first.png", { type: "image/png" }),
          new File([new Uint8Array(2_100_000)], "second.png", { type: "image/png" }),
        ],
      },
    })

    expect(within(dialog).getByText("Screenshots must be 4MB or less in total")).toBeDefined()
    expect(within(dialog).queryByAltText("Screenshot 1 preview")).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects one screenshot over 4MB before previewing or submitting", () => {
    const dialog = openDialog()
    completeRequiredSteps(dialog)
    fireEvent.change(dialog.querySelector("input[type='file']") as HTMLInputElement, {
      target: {
        files: [
          new File([new Uint8Array(4_200_000)], "too-large.png", { type: "image/png" }),
        ],
      },
    })
    expect(within(dialog).getByText("Screenshots must be 4MB or less in total")).toBeDefined()
    expect(within(dialog).queryByAltText("Screenshot 1 preview")).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("honestly reports a screenshot failure after the project is saved", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({
        error: "Failed to upload screenshot",
        code: "screenshot_sync_failed",
        projectSaved: true,
        submissionId: "sub_123",
        screenshots: [
          null,
          { slot: 9, url: "https://storage.test/invalid.webp" },
          { slot: 1, url: "https://storage.test/saved.webp" },
        ],
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    )
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
          "Your project was saved, but screenshot changes did not finish. Failed to upload screenshot"
        )
      ).toBeDefined()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(within(dialog).getByAltText("Screenshot 2 preview").getAttribute("src"))
      .toBe("https://storage.test/saved.webp")
  })
})
