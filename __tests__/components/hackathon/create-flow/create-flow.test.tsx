import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { act, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { resetComponentMocks, setRouter, setSearchParams, setClerkIsSignedIn, setClerkOrganization } from "../../../lib/component-mocks"
import {
  createDefaultHackathonDraft,
  createDraftEnvelope,
  serializeDraftEnvelope,
  type DraftState,
} from "@/lib/hackathon-draft"
import type { WebMcpTool } from "@/lib/webmcp/types"
import { FetchResponseError } from "@/lib/utils/fetch"
import { acknowledgeCreatedEventNavigation } from "@/lib/created-event-navigation"

mock.module("@/components/sign-in-required-dialog", () => ({
  SignInRequiredDialog: ({ open, description, redirectQuery }: {
    open: boolean
    description: string
    redirectQuery?: string
  }) => open ? (
    <div data-testid="sign-in-dialog" data-redirect-query={redirectQuery}>{description}</div>
  ) : null,
}))

mock.module("@/components/org-gate-dialog", () => ({
  OrgGateDialog: ({
    open,
    onOpenChange,
    onOrgSelected,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onOrgSelected: () => void | Promise<void>
  }) => open ? (
    <div data-testid="org-gate-dialog">
      Organization Required
      <button
        type="button"
        onClick={async () => {
          await onOrgSelected()
          onOpenChange(false)
        }}
      >
        Pick Test Org
      </button>
    </div>
  ) : null,
}))

mock.module("@/components/ui/address-autocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, placeholder, id }: {
    value: string
    onChange: (val: string) => void
    placeholder?: string
    id?: string
  }) => (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

mock.module("@/components/ui/markdown-editor", () => ({
  MarkdownEditor: ({ value, onChange, placeholder }: {
    value: string
    onChange: (val: string) => void
    placeholder?: string
  }) => (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

mock.module("@/components/ui/date-time-range-picker", () => ({
  DateTimeRangePicker: ({ onChange }: {
    onChange: (range: { from: Date | null; to: Date | null }) => void
  }) => (
    <div data-testid="date-range-picker">
      <button
        type="button"
        onClick={() => onChange({
          from: new Date("2026-09-03T13:00:00.000Z"),
          to: new Date("2026-09-04T21:00:00.000Z"),
        })}
      >
        Set test dates
      </button>
    </div>
  ),
}))

const storageMap = new Map<string, string>()
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => storageMap.set(key, value),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
      get length() { return storageMap.size },
      key: (index: number) => [...storageMap.keys()][index] ?? null,
    },
    writable: true,
  })
}

function findStorageEntry(prefix: string) {
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) {
        return { key, storage, value: storage.getItem(key)! }
      }
    }
  }
  return null
}

function createControllableStorage() {
  const values = new Map<string, string>()
  let blocked = false
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("storage blocked")
      values.set(key, value)
    },
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
  } as Storage
  return {
    storage,
    setBlocked: (next: boolean) => {
      blocked = next
    },
  }
}

function installDraftStorages(local: Storage, session: Storage) {
  const originals = {
    globalLocal: globalThis.localStorage,
    globalSession: globalThis.sessionStorage,
    windowLocal: window.localStorage,
    windowSession: window.sessionStorage,
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  })
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  })
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: local,
  })
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: session,
  })
  return () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originals.globalLocal,
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originals.globalSession,
    })
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originals.windowLocal,
    })
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: originals.windowSession,
    })
  }
}

const { CreateFlow } = await import("@/components/hackathon/create-flow/create-flow")

const mockPush = mock(() => {})
const mockReplace = mock(() => {})
const mockBack = mock(() => {})
const defaultSubmit = (_state: DraftState, _draftId: string) =>
  Promise.resolve({ id: "h_1", slug: "test-hackathon" })
const mockOnSubmit = mock(defaultSubmit)
const initialState = createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z"))

beforeEach(() => {
  resetComponentMocks()
  mockPush.mockClear()
  mockReplace.mockClear()
  mockBack.mockClear()
  mockOnSubmit.mockReset()
  mockOnSubmit.mockImplementation(defaultSubmit)
  setRouter({ push: mockPush, replace: mockReplace, back: mockBack })
  setClerkIsSignedIn(true)
  setClerkOrganization({ id: "org_1", name: "Test Org" })
  storageMap.clear()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  delete document.modelContext
  storageMap.clear()
  localStorage.clear()
  sessionStorage.clear()
})

function renderFlow() {
  return render(
    <CreateFlow initialState={initialState} onSubmit={mockOnSubmit} />
  )
}

async function goToNameStep() {
  fireEvent.click(await screen.findByRole("button", {
    name: /Start from scratch|Keep editing/,
  }))
  await waitFor(() => {
    expect(screen.getByPlaceholderText("My Awesome Hackathon")).toBeDefined()
  })
}

describe("CreateFlow", () => {
  describe("import step", () => {
    it("renders import chooser after restoring the saved draft", async () => {
      renderFlow()
      expect(await screen.findByText("Create a hackathon")).toBeDefined()
      expect(screen.getByText("Start from scratch")).toBeDefined()
      expect(screen.getByText("Import from URL")).toBeDefined()
    })

    it("does not show progress bar or action bar on step 0", async () => {
      renderFlow()
      await screen.findByText("Create a hackathon")
      expect(screen.queryByRole("progressbar")).toBeNull()
      expect(screen.queryByText("Continue")).toBeNull()
    })

    it("names the mobile close button", async () => {
      renderFlow()
      await screen.findByText("Create a hackathon")

      expect(screen.getByRole("button", { name: "Close" }).getAttribute("aria-label")).toBe("Close")
    })

    it("advances to name step when Start from scratch is clicked", async () => {
      renderFlow()
      await goToNameStep()
      expect(screen.getByText("What's your hackathon called?")).toBeDefined()
    })

    it("labels a restored draft before the user continues editing", async () => {
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(createDraftEnvelope(
          { ...initialState, name: "Saved Event" },
          {
            draftId: "11111111-1111-4111-8111-111111111111",
            now: new Date(),
          },
        )),
      )

      renderFlow()

      expect(await screen.findByText("Keep editing")).toBeDefined()
      expect(screen.getByText("Saved Event")).toBeDefined()
      fireEvent.click(screen.getByText("Keep editing"))
      expect(await screen.findByDisplayValue("Saved Event")).toBeDefined()
    })

    it("does not open an empty review when an auth return draft is missing", async () => {
      setSearchParams(new URLSearchParams("review=true"))

      renderFlow()

      expect(await screen.findByText(/couldn't restore your saved draft/i)).toBeDefined()
      expect(screen.getByText("Create a hackathon")).toBeDefined()
      expect(screen.queryByText("Review your event")).toBeNull()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("shows URL input when Import from URL is clicked", async () => {
      renderFlow()
      fireEvent.click(await screen.findByText("Import from URL"))
      await waitFor(() => {
        expect(screen.getByText("Paste the event URL")).toBeDefined()
      })
    })

    it("returns from URL import mode to the chooser without keeping its form", async () => {
      renderFlow()
      fireEvent.click(await screen.findByText("Import from URL"))
      await screen.findByText("Paste the event URL")

      fireEvent.click(screen.getByRole("button", { name: /back/i }))

      expect(await screen.findByText("Create a hackathon")).toBeDefined()
      expect(screen.queryByText("Paste the event URL")).toBeNull()
    })

    it("closes through browser history when a previous page exists", async () => {
      const originalLength = Object.getOwnPropertyDescriptor(
        window.history,
        "length",
      )
      Object.defineProperty(window.history, "length", {
        configurable: true,
        value: 2,
      })
      try {
        renderFlow()
        fireEvent.click(await screen.findByRole("button", { name: /close/i }))

        expect(mockBack).toHaveBeenCalledTimes(1)
        expect(mockPush).not.toHaveBeenCalled()
      } finally {
        if (originalLength) {
          Object.defineProperty(window.history, "length", originalLength)
        } else {
          delete (window.history as { length?: number }).length
        }
      }
    })

    it("closes to home when there is no previous page", async () => {
      const originalLength = Object.getOwnPropertyDescriptor(
        window.history,
        "length",
      )
      Object.defineProperty(window.history, "length", {
        configurable: true,
        value: 1,
      })
      try {
        renderFlow()
        fireEvent.click(await screen.findByRole("button", { name: /close/i }))

        expect(mockPush).toHaveBeenCalledWith("/home")
        expect(mockBack).not.toHaveBeenCalled()
      } finally {
        if (originalLength) {
          Object.defineProperty(window.history, "length", originalLength)
        } else {
          delete (window.history as { length?: number }).length
        }
      }
    })
  })

  describe("step navigation", () => {
    it("shows 1 / 5 step counter on name step", async () => {
      renderFlow()
      await goToNameStep()
      expect(screen.getByText("1 / 5")).toBeDefined()
    })

    it("advances to step 2 when Continue is clicked with a name", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Continue"))

      await waitFor(() => {
        expect(screen.getByText("When does it happen?")).toBeDefined()
        expect(screen.getByText("2 / 5")).toBeDefined()
      })
    })

    it("shows error when trying to advance without a name", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.click(screen.getByText("Continue"))
      expect(screen.getByText("Give your hackathon a name first")).toBeDefined()
    })

    it("clears error when typing a name", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.click(screen.getByText("Continue"))
      expect(screen.getByText("Give your hackathon a name first")).toBeDefined()

      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "X" },
      })
      expect(screen.queryByText("Give your hackathon a name first")).toBeNull()
    })

    it("rejects an over-limit pasted name without crashing or losing the draft", async () => {
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "a".repeat(121) } })

      expect(await screen.findByText(/too long or isn't valid/i)).toBeDefined()
      await waitFor(() => expect(input.value).toBe(""))
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("navigates back with the Back button", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Continue"))

      await waitFor(() => screen.getByText("2 / 5"))

      fireEvent.click(screen.getByRole("button", { name: "Back" }))

      await waitFor(() => {
        expect(screen.getByText("1 / 5")).toBeDefined()
      })
    })

    it("shows Create Event button on last step", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })

      fireEvent.click(screen.getByText("Continue"))
      await waitFor(() => screen.getByText("2 / 5"))
      fireEvent.click(screen.getByText("Continue"))
      await waitFor(() => screen.getByText("3 / 5"))
      fireEvent.click(screen.getByText("Continue"))
      await waitFor(() => screen.getByText("4 / 5"))
      fireEvent.click(screen.getByText("Continue"))
      await waitFor(() => screen.getByText("5 / 5"))

      expect(screen.getByText("Create Event")).toBeDefined()
    })

    it("keeps dates, hybrid location, and description through final review", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Full Flow Hackathon" },
      })
      fireEvent.click(screen.getByText("Continue"))
      await screen.findByText("When does it happen?")
      fireEvent.click(screen.getByText("Set test dates"))
      fireEvent.click(screen.getByText("Continue"))

      await screen.findByText("Where will it take place?")
      fireEvent.click(screen.getByRole("button", { name: /hybrid/i }))
      fireEvent.change(screen.getByPlaceholderText("Search for a venue..."), {
        target: { value: "Main Hall" },
      })
      const meetingLink = screen.getByLabelText("Meeting link")
      fireEvent.change(meetingLink, { target: { value: "meet.example.com/room" } })
      fireEvent.blur(meetingLink)
      fireEvent.click(screen.getByRole("button", { name: /in-person/i }))
      expect(screen.queryByLabelText("Meeting link")).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: /virtual/i }))
      expect(screen.queryByPlaceholderText("Search for a venue...")).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: /hybrid/i }))
      expect(screen.getByDisplayValue("Main Hall")).toBeDefined()
      expect(screen.getByDisplayValue("https://meet.example.com/room")).toBeDefined()
      fireEvent.click(screen.getByText("Continue"))

      await screen.findByText("Tell people what it's about")
      fireEvent.change(
        screen.getByPlaceholderText(/what will participants build/i),
        { target: { value: "Build something useful" } },
      )
      fireEvent.click(screen.getByText("Continue"))
      await screen.findByText("Review your event")
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
      expect(mockOnSubmit.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          name: "Full Flow Hackathon",
          startsAt: "2026-09-03T13:00:00.000Z",
          endsAt: "2026-09-04T21:00:00.000Z",
          locationType: "hybrid",
          locationName: "Main Hall",
          locationUrl: "https://meet.example.com/room",
          description: "Build something useful",
        }),
      )
    })
  })

  describe("skip functionality", () => {
    it("hides Skip when name is empty", async () => {
      renderFlow()
      await goToNameStep()
      expect(screen.queryByText("Skip to review")).toBeNull()
    })

    it("shows Skip when name is non-empty", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      expect(screen.getByText("Skip to review")).toBeDefined()
    })
  })

  describe("submission", () => {
    it("calls onSubmit with state when submitting", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
        const arg = mockOnSubmit.mock.calls[0][0]
        const draftId = mockOnSubmit.mock.calls[0][1]
        expect(arg.name).toBe("My Hackathon")
        expect(draftId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        )
        const completed = JSON.parse(
          localStorage.getItem("oatmeal:create-from-scratch")!,
        ).completedDraft
        expect(completed.draftId).toBe(draftId)
        expect(completed.revision).toBeGreaterThan(0)
        expect(completed.eventSlug).toBe("test-hackathon")
      })
    })

    it("submits the forked snapshot when another tab takes the key at click time", async () => {
      mockOnSubmit.mockRejectedValueOnce(new Error("Keep the draft open"))
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "This tab's event" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      const firstTab = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      const otherTab = {
        ...firstTab,
        draftId: "22222222-2222-4222-8222-222222222222",
        state: { ...firstTab.state, name: "Other tab's event" },
        savedAt: new Date(Date.now() + 1_000).toISOString(),
      }
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        JSON.stringify(otherTab),
      )

      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
      const submittedDraftId = mockOnSubmit.mock.calls[0][1]
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "This tab's event" }),
        submittedDraftId,
        "org_1",
      )
      expect(submittedDraftId).not.toBe(firstTab.draftId)
      expect(submittedDraftId).not.toBe(otherTab.draftId)
      expect(JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      ).draftId).toBe(otherTab.draftId)
    })

    it("keeps the draft when a success response has an unsafe event slug", async () => {
      mockOnSubmit.mockResolvedValueOnce({ id: "h_1", slug: "//other-site" })
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Safe draft" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      const submitted = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )

      fireEvent.click(screen.getByText("Create Event"))

      expect(await screen.findByText(/page address was invalid/i)).toBeDefined()
      expect(mockReplace).not.toHaveBeenCalled()
      expect(JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      ).draftId).toBe(submitted.draftId)
      expect(screen.getByRole("button", { name: "Create Event" })).toBeDefined()
    })

    it("keeps a draft conflict visible when the server has no event link", async () => {
      mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
        message: "This saved draft already created an event.",
        status: 422,
        code: "draft_conflict",
      }))
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Conflict Draft" },
      })
      fireEvent.click(screen.getByText("Skip to review"))

      fireEvent.click(screen.getByText("Create Event"))

      expect(
        await screen.findByText(/already created.*newer edits are saved/i),
      ).toBeDefined()
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it("reports when stale auth finds this draft completed by another tab", async () => {
      mockOnSubmit.mockImplementationOnce((_state, draftId) => {
        const submitted = JSON.parse(
          localStorage.getItem("oatmeal:create-from-scratch")!,
        )
        localStorage.setItem(
          `oatmeal:create-from-scratch:completed:${draftId}`,
          JSON.stringify({
            completedDraft: {
              draftId,
              revision: submitted.revision,
              savedAt: submitted.savedAt,
              completedAt: new Date().toISOString(),
              eventSlug: "created-elsewhere",
            },
          }),
        )
        return Promise.reject(new FetchResponseError({
          message: "Sign in again",
          status: 401,
          code: "unauthorized",
        }))
      })
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Completed Elsewhere" },
      })
      fireEvent.click(screen.getByText("Skip to review"))

      fireEvent.click(screen.getByText("Create Event"))

      expect(
        await screen.findByText(/created in another tab/i),
      ).toBeDefined()
      expect(screen.queryByTestId("sign-in-dialog")).toBeNull()
      expect(mockReplace).toHaveBeenCalledWith("/e/created-elsewhere/manage")
    })

    it("shows sign-in dialog when not signed in", async () => {
      setClerkIsSignedIn(false)
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(screen.getByTestId("sign-in-dialog")).toBeDefined()
      })
    })

    it("restores the signed-out draft after sign-in and still waits for Create Event", async () => {
      setClerkIsSignedIn(false)
      const signedOutView = renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Keep My Draft" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))
      await screen.findByTestId("sign-in-dialog")
      await waitFor(() => {
        expect(localStorage.getItem("oatmeal:create-from-scratch")).not.toBeNull()
      })

      signedOutView.unmount()
      setClerkIsSignedIn(true)
      setSearchParams(new URLSearchParams("review=true"))
      renderFlow()

      expect(await screen.findByText("Review your event")).toBeDefined()
      expect(screen.getByText("Keep My Draft")).toBeDefined()
      expect(mockOnSubmit).not.toHaveBeenCalled()

      fireEvent.click(screen.getByText("Create Event"))
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1)
      })
      expect(mockOnSubmit.mock.calls[0]?.[2]).toBe("org_1")
    })

    it("re-saves the draft after stale client auth and waits for another Create Event click", async () => {
      mockOnSubmit.mockImplementationOnce((_state, _draftId) => {
        localStorage.removeItem("oatmeal:create-from-scratch")
        sessionStorage.removeItem("oatmeal:create-from-scratch")
        return Promise.reject(new FetchResponseError({
          message: "Sign in again to continue.",
          status: 401,
          code: "unauthorized",
        }))
      })
      const staleSessionView = renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Keep After Session Ends" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      expect(await screen.findByTestId("sign-in-dialog")).toBeDefined()
      const saved = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(saved.state.name).toBe("Keep After Session Ends")
      expect(saved.draftId).toBe(mockOnSubmit.mock.calls[0][1])
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
      expect(mockReplace).not.toHaveBeenCalled()

      staleSessionView.unmount()
      setSearchParams(new URLSearchParams("review=true"))
      renderFlow()

      expect(await screen.findByText("Review your event")).toBeDefined()
      expect(screen.getByText("Keep After Session Ends")).toBeDefined()
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    it("shows org gate dialog when signed in but no org", async () => {
      setClerkOrganization(null)
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(screen.getByTestId("org-gate-dialog")).toBeDefined()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("requires a separate Create Event click after choosing an organization", async () => {
      setClerkOrganization(null)
      const view = renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))
      fireEvent.click(await screen.findByText("Pick Test Org"))

      await waitFor(() => {
        expect(screen.queryByTestId("org-gate-dialog")).toBeNull()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()

      setClerkOrganization({ id: "org_1", name: "Test Org" })
      view.rerender(
        <CreateFlow initialState={initialState} onSubmit={mockOnSubmit} />,
      )
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1)
      })
    })

    it("uses the keyboard to open review before the one human create action", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Keyboard Hackathon" },
      })

      fireEvent.keyDown(window, { key: "Enter", metaKey: true })
      await waitFor(() => {
        expect(screen.getByText("Review your event")).toBeDefined()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()

      fireEvent.keyDown(window, { key: "Enter", metaKey: true })
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1)
      })
    })

    it("lets focused review buttons handle Enter without a global create", async () => {
      const user = userEvent.setup()
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Keyboard Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to review"))

      const back = screen.getByRole("button", { name: /back/i })
      back.focus()
      await user.keyboard("{Enter}")

      expect(mockOnSubmit).not.toHaveBeenCalled()
      expect(screen.getByText("4 / 5")).toBeDefined()

      fireEvent.click(screen.getByText("Skip to review"))
      const create = screen.getByRole("button", { name: "Create Event" })
      create.focus()
      await user.keyboard("{Enter}")

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
    })

    it("lets a signed-out WebMCP session open the saved sign-in choice", async () => {
      const registeredTools: WebMcpTool[] = []
      document.modelContext = {
        registerTool: mock(async (tool) => {
          registeredTools.push(tool)
        }),
      }
      setClerkIsSignedIn(false)
      renderFlow()

      await waitFor(() => {
        expect(registeredTools.some((tool) => tool.name === "open_sign_in")).toBe(true)
      })
      const tool = registeredTools.find((candidate) => candidate.name === "open_sign_in")!
      const result = await tool.execute({}, {
        signal: new AbortController().signal,
      }) as { ok: boolean; requiresHumanAction: boolean }

      expect(result.ok).toBe(true)
      expect(result.requiresHumanAction).toBe(true)
      await waitFor(() => {
        expect(screen.getByTestId("sign-in-dialog")).toBeDefined()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  describe("localStorage", () => {
    let restoreDraftStorages: (() => void) | null = null
    let localDraftStorage: ReturnType<typeof createControllableStorage> | null = null
    let sessionDraftStorage: ReturnType<typeof createControllableStorage> | null = null

    beforeEach(() => {
      localDraftStorage = createControllableStorage()
      sessionDraftStorage = createControllableStorage()
      restoreDraftStorages = installDraftStorages(
        localDraftStorage.storage,
        sessionDraftStorage.storage,
      )
    })

    afterEach(() => {
      restoreDraftStorages?.()
      restoreDraftStorages = null
      localDraftStorage = null
      sessionDraftStorage = null
    })

    it("falls back to session storage before sending a signed-out user to sign in", async () => {
      const originalGlobalLocalStorage = globalThis.localStorage
      const originalWindowLocalStorage = window.localStorage
      const blockedStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error("storage blocked")
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as Storage
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: blockedStorage,
      })
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: blockedStorage,
      })
      window.sessionStorage.clear()

      try {
        setClerkIsSignedIn(false)
        renderFlow()
        await goToNameStep()
        fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
          target: { value: "Session Draft" },
        })
        fireEvent.click(screen.getByText("Skip to review"))
        fireEvent.click(screen.getByText("Create Event"))

        expect(await screen.findByTestId("sign-in-dialog")).toBeDefined()
        expect(
          JSON.parse(window.sessionStorage.getItem("oatmeal:create-from-scratch")!).state.name,
        ).toBe("Session Draft")
      } finally {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: originalGlobalLocalStorage,
        })
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          value: originalWindowLocalStorage,
        })
        window.sessionStorage.clear()
      }
    })

    it("does not leave the page when both browser storage options are blocked", async () => {
      const originalGlobalLocalStorage = globalThis.localStorage
      const originalGlobalSessionStorage = globalThis.sessionStorage
      const originalWindowLocalStorage = window.localStorage
      const originalWindowSessionStorage = window.sessionStorage
      const blockedStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error("storage blocked")
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as Storage
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: blockedStorage,
      })
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: blockedStorage,
      })
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: blockedStorage,
      })
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: blockedStorage,
      })

      try {
        setClerkIsSignedIn(false)
        renderFlow()
        await goToNameStep()
        fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
          target: { value: "Unsaved Draft" },
        })
        fireEvent.click(screen.getByText("Skip to review"))
        fireEvent.click(screen.getByText("Create Event"))

        expect(await screen.findByText(/turn on browser storage/i)).toBeDefined()
        expect(screen.queryByTestId("sign-in-dialog")).toBeNull()
        expect(mockOnSubmit).not.toHaveBeenCalled()
      } finally {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: originalGlobalLocalStorage,
        })
        Object.defineProperty(globalThis, "sessionStorage", {
          configurable: true,
          value: originalGlobalSessionStorage,
        })
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          value: originalWindowLocalStorage,
        })
        Object.defineProperty(window, "sessionStorage", {
          configurable: true,
          value: originalWindowSessionStorage,
        })
      }
    })

    it("opens the created event when browser storage cannot record completion", async () => {
      mockOnSubmit.mockImplementationOnce(async () => {
        localDraftStorage!.setBlocked(true)
        sessionDraftStorage!.setBlocked(true)
        return { id: "h_1", slug: "created-event" }
      })
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Completion-safe Draft" },
      })
      fireEvent.click(screen.getByText("Skip to review"))

      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/created-event/manage")
      })
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    it("saves state to localStorage on change", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Saved Hackathon" },
      })

      await waitFor(() => {
        const stored = localStorage.getItem("oatmeal:create-from-scratch")
        expect(stored).not.toBeNull()
        expect(JSON.parse(stored!).state.name).toBe("Saved Hackathon")
      })
    })

    it("returns a WebMCP storage error without claiming an unsaved revision", async () => {
      const registeredTools: WebMcpTool[] = []
      document.modelContext = {
        registerTool: mock(async (tool) => {
          registeredTools.push(tool)
        }),
      }
      renderFlow()
      await goToNameStep()
      await waitFor(() => {
        expect(
          registeredTools.some((tool) => tool.name === "update_hackathon_draft"),
        ).toBe(true)
      })
      const beforeLocal = localStorage.getItem("oatmeal:create-from-scratch")
      const beforeSession = sessionStorage.getItem("oatmeal:create-from-scratch")
      localDraftStorage!.setBlocked(true)
      sessionDraftStorage!.setBlocked(true)
      const tool = registeredTools.find(
        (candidate) => candidate.name === "update_hackathon_draft",
      )!
      let result: unknown

      await act(async () => {
        result = await tool.execute({
          expectedRevision: 0,
          patch: { name: "Visible but unsaved" },
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
      expect(
        (screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement).value,
      ).toBe("Visible but unsaved")
      expect(localStorage.getItem("oatmeal:create-from-scratch")).toBe(beforeLocal)
      expect(sessionStorage.getItem("oatmeal:create-from-scratch")).toBe(beforeSession)
    })

    it("restores state from localStorage on mount", async () => {
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        JSON.stringify({
          state: {
            name: "Restored Hackathon",
            description: null,
            startsAt: null,
            endsAt: null,
            locationType: null,
            locationName: null,
            locationUrl: null,
            imageUrl: null,
            sponsors: [],
            rules: null,
            prizes: [],
            challenges: [],
            agendaItems: [],
          },
          savedAt: Date.now(),
        })
      )

      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      await waitFor(() => expect(input.value).toBe("Restored Hackathon"))
    })

    it("restores the newest saved copy across local and session storage", async () => {
      const draftId = "11111111-1111-4111-8111-111111111111"
      const oldCopy = {
        ...createDraftEnvelope(
          { ...initialState, name: "Old local copy" },
          { draftId, now: new Date(Date.now() - 2_000) },
        ),
        revision: 1,
      }
      const newCopy = {
        ...createDraftEnvelope(
          { ...initialState, name: "New session copy" },
          { draftId, now: new Date(Date.now() - 1_000) },
        ),
        revision: 2,
      }
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(oldCopy),
      )
      sessionStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(newCopy),
      )

      renderFlow()
      await goToNameStep()

      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      await waitFor(() => expect(input.value).toBe("New session copy"))
      expect(
        JSON.parse(localStorage.getItem("oatmeal:create-from-scratch")!).revision,
      ).toBe(2)
    })

    it("edits and creates identical dual-storage drafts after future-clock correction", async () => {
      const draftId = "11111111-1111-4111-8111-111111111111"
      const state = { ...initialState, name: "Clock-safe draft" }
      const local = createDraftEnvelope(state, {
        draftId,
        now: new Date(Date.now() + 4 * 60 * 1_000),
      })
      const session = {
        ...local,
        savedAt: new Date(Date.now() + 6 * 60 * 1_000).toISOString(),
      }
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(local),
      )
      sessionStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(session),
      )

      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText(
        "My Awesome Hackathon",
      ) as HTMLInputElement
      expect(input.value).toBe("Clock-safe draft")
      expect(screen.queryByText(/review both copies/i)).toBeNull()

      fireEvent.change(input, { target: { value: "Clock-safe edit" } })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Clock-safe edit" }),
          draftId,
          "org_1",
        )
      })
      expect(findStorageEntry("oatmeal:create-from-scratch:branch:")).toBeNull()
    })

    it("prefers the highest revision when browser clocks disagree", async () => {
      const draftId = "11111111-1111-4111-8111-111111111111"
      const highRevision = {
        ...createDraftEnvelope(
          { ...initialState, name: "Highest revision" },
          { draftId, now: new Date(Date.now() - 2_000) },
        ),
        revision: 4,
      }
      const newerClock = {
        ...createDraftEnvelope(
          { ...initialState, name: "Newer clock" },
          { draftId, now: new Date(Date.now() - 1_000) },
        ),
        revision: 3,
      }
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(highRevision),
      )
      sessionStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(newerClock),
      )

      renderFlow()
      await goToNameStep()

      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      await waitFor(() => expect(input.value).toBe("Highest revision"))
      expect(
        JSON.parse(localStorage.getItem("oatmeal:create-from-scratch")!).revision,
      ).toBe(4)
    })

    it("keeps equal-revision edits in separate stores instead of choosing by clock", async () => {
      const draftId = "11111111-1111-4111-8111-111111111111"
      const localCopy = {
        ...createDraftEnvelope(
          { ...initialState, name: "Local branch" },
          { draftId, now: new Date(Date.now() - 2_000) },
        ),
        revision: 2,
      }
      const sessionCopy = {
        ...createDraftEnvelope(
          { ...initialState, name: "Session branch" },
          { draftId, now: new Date(Date.now() - 1_000) },
        ),
        revision: 2,
      }
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(localCopy),
      )
      sessionStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(sessionCopy),
      )

      renderFlow()
      await goToNameStep()
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      expect(await screen.findByText(/different edits in another tab/i)).toBeDefined()
      expect(mockOnSubmit).not.toHaveBeenCalled()
      expect(JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      ).state.name).toBe("Local branch")
      expect(JSON.parse(
        sessionStorage.getItem("oatmeal:create-from-scratch")!,
      ).state.name).toBe("Session branch")
    })

    it("selects the newest draft ID while keeping the other saved copy", async () => {
      const localCopy = createDraftEnvelope(
        { ...initialState, name: "Local event" },
        {
          draftId: "11111111-1111-4111-8111-111111111111",
          now: new Date(Date.now() - 2_000),
        },
      )
      const sessionCopy = createDraftEnvelope(
        { ...initialState, name: "Session event" },
        {
          draftId: "22222222-2222-4222-8222-222222222222",
          now: new Date(Date.now() - 1_000),
        },
      )
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(localCopy),
      )
      sessionStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(sessionCopy),
      )
      mockOnSubmit.mockRejectedValueOnce(new Error("Keep the draft open"))

      renderFlow()
      await goToNameStep()
      await waitFor(() => {
        expect(
          (screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement).value,
        ).toBe("Session event")
      })
      expect(screen.getByText(/opened the newest copy/i)).toBeDefined()
      const selectedBranch = findStorageEntry(
        `oatmeal:create-from-scratch:branch:${sessionCopy.draftId}`,
      )
      expect(selectedBranch).not.toBeNull()
      expect(JSON.parse(selectedBranch!.value).draftId).toBe(sessionCopy.draftId)

      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Session event" }),
        sessionCopy.draftId,
        "org_1",
      )
      expect(JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      ).draftId).toBe(localCopy.draftId)
      expect(JSON.parse(
        sessionStorage.getItem("oatmeal:create-from-scratch")!,
      ).draftId).toBe(sessionCopy.draftId)
    })

    it("forks the in-memory draft when another first-load tab wins the primary key", async () => {
      mockOnSubmit.mockRejectedValueOnce(new Error("Keep the draft open"))
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "First tab event" } })
      const firstTab = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      const otherTab = createDraftEnvelope(
        { ...initialState, name: "Other tab event" },
        { draftId: "22222222-2222-4222-8222-222222222222" },
      )
      const serializedOther = serializeDraftEnvelope(otherTab)
      localStorage.setItem("oatmeal:create-from-scratch", serializedOther)
      const storageEvent = new Event("storage") as StorageEvent
      Object.defineProperties(storageEvent, {
        key: { value: "oatmeal:create-from-scratch" },
        oldValue: { value: serializeDraftEnvelope(firstTab) },
        newValue: { value: serializedOther },
      })
      window.dispatchEvent(storageEvent)

      await waitFor(() => {
        expect(screen.getByText(/saved as a separate draft/i)).toBeDefined()
      })
      expect(input.value).toBe("First tab event")
      const selectedBranch = findStorageEntry("oatmeal:create-from-scratch:branch:")
      expect(selectedBranch).not.toBeNull()
      const forked = JSON.parse(selectedBranch!.value)
      expect(forked.state.name).toBe("First tab event")
      expect(forked.draftId).not.toBe(firstTab.draftId)
      expect(forked.draftId).not.toBe(otherTab.draftId)

      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "First tab event" }),
        forked.draftId,
        "org_1",
      )
      expect(JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      ).draftId).toBe(otherTab.draftId)
    })

    it("adds a local edit to a newer draft from another tab", async () => {
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "First tab" } })
      const current = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      const newer = {
        ...current,
        revision: current.revision + 1,
        state: { ...current.state, name: "Other tab" },
        savedAt: new Date(Date.now() + 1_000).toISOString(),
      }
      localStorage.setItem("oatmeal:create-from-scratch", JSON.stringify(newer))

      fireEvent.change(input, { target: { value: "Stale edit" } })

      await waitFor(() => expect(input.value).toBe("Stale edit"))
      expect(
        JSON.parse(localStorage.getItem("oatmeal:create-from-scratch")!).state.name,
      ).toBe("Stale edit")
      expect(screen.getByText(/edit was added to the newest version/i)).toBeDefined()
    })

    it("does not clear a newer draft after an older tab finishes creating", async () => {
      let finishCreate!: (value: { id: string; slug: string }) => void
      mockOnSubmit.mockImplementationOnce(
        () => new Promise((resolve) => {
          finishCreate = resolve
        }),
      )
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "Submitting tab" } })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))
      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))

      const current = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      const newer = {
        ...current,
        state: { ...current.state, name: "Newer tab" },
        savedAt: new Date(Date.now() + 1_000).toISOString(),
      }
      localStorage.setItem("oatmeal:create-from-scratch", JSON.stringify(newer))
      finishCreate({ id: "h_1", slug: "test-hackathon" })

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/test-hackathon/manage")
      })
      expect(
        JSON.parse(localStorage.getItem("oatmeal:create-from-scratch")!).state.name,
      ).toBe("Newer tab")
      expect(
        JSON.parse(localStorage.getItem("oatmeal:create-from-scratch")!).draftId,
      ).not.toBe(current.draftId)
    })

    it("keeps the submitted draft without explicit proof the event committed", async () => {
      mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
        message: "Your event was created, but setup could not be scheduled. Keep this page open and try again.",
        status: 503,
        code: "finalization_unscheduled",
        retryable: true,
        existingEvent: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Created event",
          slug: "created-event",
        },
      }))
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Setup retry event" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      const submitted = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )

      fireEvent.click(screen.getByText("Create Event"))

      expect(await screen.findByText(/setup could not be scheduled/i)).toBeDefined()
      const preserved = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(preserved.draftId).toBe(submitted.draftId)
      expect(preserved.state.name).toBe("Setup retry event")
      expect(mockReplace).not.toHaveBeenCalled()
      expect(screen.getByText("Create Event").closest("button")?.disabled).toBe(false)
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    it("opens a committed event and rotates newer edits when setup was not scheduled", async () => {
      let rejectCreate!: (reason: unknown) => void
      mockOnSubmit.mockImplementationOnce(
        () => new Promise((_resolve, reject) => {
          rejectCreate = reject
        }),
      )
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Submitted setup event" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      const submitted = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      fireEvent.click(screen.getByText("Create Event"))
      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))

      localStorage.setItem("oatmeal:create-from-scratch", JSON.stringify({
        ...submitted,
        revision: submitted.revision + 1,
        state: { ...submitted.state, name: "New setup edits" },
        savedAt: new Date(Date.now() + 1_000).toISOString(),
      }))
      rejectCreate(new FetchResponseError({
        message: "Your event was created, but setup could not be scheduled.",
        status: 503,
        code: "finalization_unscheduled",
        retryable: true,
        committed: true,
        existingEvent: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Created event",
          slug: "created-event",
        },
      }))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/created-event/manage")
      })
      const recovered = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(recovered.state.name).toBe("New setup edits")
      expect(recovered.draftId).not.toBe(submitted.draftId)
      expect(recovered.revision).toBe(0)
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    it("opens the existing event and preserves newer work after a lost success response", async () => {
      mockOnSubmit.mockImplementationOnce(() => Promise.reject(
        new FetchResponseError({
          message: "This saved draft already created an event.",
          status: 422,
          code: "draft_conflict",
          retryable: false,
          existingEvent: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Created event",
            slug: "created-event",
          },
        }),
      ))
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Recovered event" },
      })
      const consumedDraftId = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      ).draftId
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/created-event/manage")
      })
      const recovered = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(recovered.state.name).toBe("Recovered event")
      expect(recovered.draftId).not.toBe(consumedDraftId)
      expect(recovered.revision).toBe(0)

      expect(screen.getByText("Create Event")).toBeDefined()
      expect(screen.getByRole("button", { name: "Open Event" }).hasAttribute("disabled")).toBe(false)
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    it("keeps draft B when retrying draft A returns a lost-success conflict", async () => {
      mockOnSubmit.mockRejectedValueOnce(new Error("The success response was lost"))
      mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
        message: "This saved draft already created an event.",
        status: 422,
        code: "draft_conflict",
        retryable: false,
        existingEvent: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Draft A event",
          slug: "draft-a-event",
        },
      }))
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Draft A" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      const draftA = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )

      fireEvent.click(screen.getByText("Create Event"))
      expect(await screen.findByText("The success response was lost")).toBeDefined()

      fireEvent.click(screen.getByText("Back"))
      const description = await screen.findByPlaceholderText(
        "What will participants build? What's the theme?",
      )
      fireEvent.change(description, { target: { value: "Draft B details" } })
      fireEvent.click(screen.getByText("Continue"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/draft-a-event/manage")
      })
      const draftB = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(draftB.state.name).toBe("Draft A")
      expect(draftB.state.description).toBe("Draft B details")
      expect(draftB.draftId).not.toBe(draftA.draftId)
      expect(draftB.revision).toBe(0)
      expect(screen.getByRole("button", { name: "Open Event" })).toBeDefined()
      expect(screen.getByText("Create Event")).toBeDefined()
      expect(mockOnSubmit).toHaveBeenCalledTimes(2)
    })

    it("keeps an Org A draft when a lost-response retry is made under Org B", async () => {
      mockOnSubmit.mockRejectedValueOnce(new Error("The Org A response was lost"))
      mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
        message: "This draft was already used with another organization.",
        status: 422,
        code: "draft_organization_conflict",
        retryable: false,
      }))
      const view = renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Org A draft" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      const orgADraft = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )

      fireEvent.click(screen.getByText("Create Event"))
      expect(await screen.findByText("The Org A response was lost")).toBeDefined()

      setClerkOrganization({ id: "org_2", name: "Org B" })
      view.rerender(
        <CreateFlow initialState={initialState} onSubmit={mockOnSubmit} />,
      )
      fireEvent.click(screen.getByText("Create Event"))

      expect(await screen.findByText(/switch back to the organization you first used/i)).toBeDefined()
      const preserved = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(preserved.draftId).toBe(orgADraft.draftId)
      expect(preserved.state.name).toBe("Org A draft")
      expect(findStorageEntry("oatmeal:create-from-scratch:branch:")).toBeNull()
      expect(mockReplace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/e\//))
      expect(mockOnSubmit).toHaveBeenCalledTimes(2)
    })

    it("rotates newer edits after a lost success response", async () => {
      let rejectCreate!: (reason: unknown) => void
      mockOnSubmit.mockImplementationOnce(
        () => new Promise((_resolve, reject) => {
          rejectCreate = reject
        }),
      )
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Submitted event" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      const submitted = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      fireEvent.click(screen.getByText("Create Event"))
      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))

      localStorage.setItem("oatmeal:create-from-scratch", JSON.stringify({
        ...submitted,
        revision: submitted.revision + 1,
        state: { ...submitted.state, name: "Newer unsent edits" },
        savedAt: new Date(Date.now() + 1_000).toISOString(),
      }))
      rejectCreate(new FetchResponseError({
        message: "This saved draft already created an event.",
        status: 422,
        code: "draft_conflict",
        retryable: false,
        existingEvent: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Created event",
          slug: "created-event",
        },
      }))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/created-event/manage")
      })
      const recovered = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(recovered.state.name).toBe("Newer unsent edits")
      expect(recovered.draftId).not.toBe(submitted.draftId)
      expect(recovered.revision).toBe(0)
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    it("does not overwrite other drafts after a lost success response", async () => {
      mockOnSubmit.mockImplementationOnce(() => {
        localStorage.setItem(
          "oatmeal:create-from-scratch",
          serializeDraftEnvelope(createDraftEnvelope(
            { ...initialState, name: "Other local event" },
            { draftId: "22222222-2222-4222-8222-222222222222" },
          )),
        )
        sessionStorage.setItem(
          "oatmeal:create-from-scratch",
          serializeDraftEnvelope(createDraftEnvelope(
            { ...initialState, name: "Other session event" },
            { draftId: "33333333-3333-4333-8333-333333333333" },
          )),
        )
        return Promise.reject(new FetchResponseError({
          message: "This saved draft already created an event.",
          status: 422,
          code: "draft_conflict",
          retryable: false,
          existingEvent: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Created event",
            slug: "created-event",
          },
        }))
      })
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Branch recovery" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/created-event/manage")
      })
      const preservedBranch = findStorageEntry(
        "oatmeal:create-from-scratch:branch:",
      )
      expect(preservedBranch).not.toBeNull()
      expect(JSON.parse(preservedBranch!.value).state.name).toBe("Branch recovery")
      expect(
        JSON.parse(localStorage.getItem("oatmeal:create-from-scratch")!).state.name,
      ).toBe("Other local event")
      expect(
        JSON.parse(sessionStorage.getItem("oatmeal:create-from-scratch")!).state.name,
      ).toBe("Other session event")
    })

    it("restores a same-revision branch after a reload", async () => {
      const firstView = renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "This tab's event" } })
      const current = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      const otherTab = {
        ...current,
        state: { ...current.state, name: "Other tab's event" },
      }
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        JSON.stringify(otherTab),
      )
      fireEvent(window, new window.StorageEvent("storage", {
        key: "oatmeal:create-from-scratch",
        newValue: JSON.stringify(otherTab),
      }))

      let branch: ReturnType<typeof findStorageEntry> = null
      await waitFor(() => {
        branch = findStorageEntry("oatmeal:create-from-scratch:branch:")
        expect(branch).not.toBeNull()
      })
      expect(JSON.parse(branch!.value).state.name).toBe("This tab's event")
      firstView.unmount()

      renderFlow()
      await goToNameStep()
      const restored = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      await waitFor(() => expect(restored.value).toBe("This tab's event"))
      expect(JSON.parse(branch!.storage.getItem(branch!.key)!).state.name).toBe("This tab's event")
    })

    it("honors completion records for forked branch keys", async () => {
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "Forked event" } })
      const current = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      const otherTab = {
        ...current,
        state: { ...current.state, name: "Other event" },
      }
      localStorage.setItem("oatmeal:create-from-scratch", JSON.stringify(otherTab))
      fireEvent(window, new window.StorageEvent("storage", {
        key: "oatmeal:create-from-scratch",
        newValue: JSON.stringify(otherTab),
      }))

      let branchEntry: ReturnType<typeof findStorageEntry> = null
      await waitFor(() => {
        branchEntry = findStorageEntry("oatmeal:create-from-scratch:branch:")
        expect(branchEntry).not.toBeNull()
      })
      const branch = JSON.parse(branchEntry!.value)
      const completionKey = `${branchEntry!.key}:completed:${branch.draftId}`
      const tombstone = JSON.stringify({
        completedDraft: {
          draftId: branch.draftId,
          revision: branch.revision,
          savedAt: branch.savedAt,
          completedAt: new Date().toISOString(),
        },
      })
      branchEntry!.storage.setItem(completionKey, tombstone)
      fireEvent(window, new window.StorageEvent("storage", {
        key: completionKey,
        newValue: tombstone,
      }))

      expect(await screen.findByText(/created in another tab/i)).toBeDefined()
      fireEvent.click(screen.getByText("Skip to review"))
      expect(screen.queryByText("Create Event")).toBeNull()
      expect(screen.getByText("Opening Event…").closest("button")?.disabled).toBe(true)
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("stays on the page when newer in-flight edits cannot be preserved", async () => {
      const local = createControllableStorage()
      const session = createControllableStorage()
      const restoreStorages = installDraftStorages(local.storage, session.storage)
      let finishCreate!: (value: { id: string; slug: string }) => void
      try {
        mockOnSubmit.mockImplementationOnce(
          () => new Promise((resolve) => {
            finishCreate = resolve
          }),
        )
        renderFlow()
        await goToNameStep()
        fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
          target: { value: "Submitting tab" },
        })
        fireEvent.click(screen.getByText("Skip to review"))
        fireEvent.click(screen.getByText("Create Event"))
        await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))

        const current = JSON.parse(
          local.storage.getItem("oatmeal:create-from-scratch")!,
        )
        const newer = {
          ...current,
          revision: current.revision + 1,
          state: { ...current.state, name: "Newer tab" },
          savedAt: new Date(Date.now() + 1_000).toISOString(),
        }
        fireEvent(window, new window.StorageEvent("storage", {
          key: "oatmeal:create-from-scratch",
          newValue: JSON.stringify(newer),
        }))
        local.setBlocked(true)
        session.setBlocked(true)
        finishCreate({ id: "h_1", slug: "test-hackathon" })

        await waitFor(() => {
          expect(
            screen.getAllByText(/newer edits aren't saved yet/i).length,
          ).toBeGreaterThan(0)
        })
        expect(mockReplace).not.toHaveBeenCalledWith("/e/test-hackathon/manage")
      } finally {
        restoreStorages()
      }
    })

    it("rotates before an edit after completion storage fails", async () => {
      const local = createControllableStorage()
      const session = createControllableStorage()
      const restoreStorages = installDraftStorages(local.storage, session.storage)
      mockOnSubmit.mockImplementationOnce(() => {
        local.setBlocked(true)
        session.setBlocked(true)
        return Promise.resolve({ id: "h_1", slug: "test-hackathon" })
      })

      try {
        renderFlow()
        await goToNameStep()
        fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
          target: { value: "Created version" },
        })
        const consumedDraftId = JSON.parse(
          local.storage.getItem("oatmeal:create-from-scratch")!,
        ).draftId
        fireEvent.click(screen.getByText("Skip to review"))
        fireEvent.click(screen.getByText("Create Event"))

        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalledWith("/e/test-hackathon/manage")
        })
        local.setBlocked(false)
        session.setBlocked(false)

        fireEvent.click(screen.getByText("Back"))
        fireEvent.click(screen.getByText("Back"))
        fireEvent.click(screen.getByText("Back"))
        fireEvent.click(screen.getByText("Back"))
        const nameInput = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
        fireEvent.change(nameInput, { target: { value: "New follow-up event" } })

        const recovered = JSON.parse(
          local.storage.getItem("oatmeal:create-from-scratch")!,
        )
        expect(recovered.draftId).not.toBe(consumedDraftId)
        expect(recovered.state.name).toBe("New follow-up event")
      } finally {
        restoreStorages()
      }
    })

    it("detects a completed draft even when the storage event was missed", async () => {
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "Created elsewhere" } })
      const current = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      localStorage.setItem("oatmeal:create-from-scratch", JSON.stringify({
        completedDraft: {
          draftId: current.draftId,
          revision: current.revision,
          savedAt: current.savedAt,
          completedAt: new Date().toISOString(),
        },
      }))

      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      expect(await screen.findByText(/created in another tab/i)).toBeDefined()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("rotates newer edits when an older revision was completed elsewhere", async () => {
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "Created version" } })
      const completedEnvelope = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      fireEvent.change(input, { target: { value: "Newer unsent edits" } })
      const tombstone = JSON.stringify({
        completedDraft: {
          draftId: completedEnvelope.draftId,
          revision: completedEnvelope.revision,
          savedAt: completedEnvelope.savedAt,
          completedAt: new Date().toISOString(),
        },
      })
      localStorage.setItem(
        `oatmeal:create-from-scratch:completed:${completedEnvelope.draftId}`,
        tombstone,
      )
      localStorage.setItem("oatmeal:create-from-scratch", tombstone)

      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      expect(await screen.findByText(/newer edits were saved as a new draft/i)).toBeDefined()
      expect(mockOnSubmit).not.toHaveBeenCalled()
      const recovered = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(recovered.state.name).toBe("Newer unsent edits")
      expect(recovered.draftId).not.toBe(completedEnvelope.draftId)
    })

    it("allows a fresh draft after a completed event", async () => {
      const firstView = renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "First event" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))
      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/test-hackathon/manage")
      })
      firstView.unmount()
      expect(acknowledgeCreatedEventNavigation("test-hackathon")).toBe(true)
      mockReplace.mockClear()

      renderFlow()
      await goToNameStep()
      expect(mockReplace).not.toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "Open Event" })).toBeDefined()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Second event" },
      })
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(2))
    })

    it("keeps same-revision edits when a matching completion record exists", async () => {
      const firstView = renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Created snapshot" },
      })
      const submitted = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      fireEvent.click(screen.getByText("Skip to review"))
      fireEvent.click(screen.getByText("Create Event"))
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/test-hackathon/manage")
      })

      const divergent = {
        ...submitted,
        state: { ...submitted.state, name: "Same revision, new content" },
      }
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        JSON.stringify(divergent),
      )
      firstView.unmount()

      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      await waitFor(() => expect(input.value).toBe("Same revision, new content"))
      const recovered = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      expect(recovered.draftId).not.toBe(submitted.draftId)
    })

    it("does not resurrect a draft completed in another tab", async () => {
      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      fireEvent.change(input, { target: { value: "Created elsewhere" } })
      const current = JSON.parse(
        localStorage.getItem("oatmeal:create-from-scratch")!,
      )
      const tombstone = JSON.stringify({
        completedDraft: {
          draftId: current.draftId,
          revision: current.revision,
          savedAt: current.savedAt,
          completedAt: new Date().toISOString(),
        },
      })
      localStorage.setItem("oatmeal:create-from-scratch", tombstone)
      fireEvent(window, new window.StorageEvent("storage", {
        key: "oatmeal:create-from-scratch",
        newValue: tombstone,
      }))

      expect(await screen.findByText(/created in another tab/i)).toBeDefined()
      fireEvent.change(input, { target: { value: "Duplicate event" } })
      fireEvent.click(screen.getByText("Skip to review"))
      expect(screen.queryByText("Create Event")).toBeNull()
      expect(screen.getByText("Opening Event…").closest("button")?.disabled).toBe(true)

      expect(localStorage.getItem("oatmeal:create-from-scratch")).toBe(tombstone)
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("upgrades an older saved envelope to a server-safe draft UUID", async () => {
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        serializeDraftEnvelope(createDraftEnvelope(
          { ...initialState, name: "Old ID Draft" },
          { draftId: "draft-before-idempotency", now: new Date() },
        )),
      )

      renderFlow()
      await goToNameStep()

      const stored = JSON.parse(localStorage.getItem("oatmeal:create-from-scratch")!)
      expect(stored.state.name).toBe("Old ID Draft")
      expect(stored.draftId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    })
  })
})
