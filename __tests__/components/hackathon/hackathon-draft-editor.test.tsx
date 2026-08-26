import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test"
import { act, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { FetchResponseError } from "@/lib/utils/fetch"
import {
  createDraftEnvelope,
  serializeDraftEnvelope,
} from "@/lib/hackathon-draft"
import type { WebMcpTool } from "@/lib/webmcp/types"
import {
  createAuthResumeTarget,
  restoreAuthResumeTarget,
} from "@/lib/auth/create-resume"
import {
  resetComponentMocks,
  setRouter,
  setPathname,
  setSearchParams,
} from "../../lib/component-mocks"

const storage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() { return storage.size },
  key: () => null,
} as Storage

function createToggleableStorage(storageToWrap: Storage) {
  let writesBlocked = false
  const storage: Storage = {
    getItem: (key) => storageToWrap.getItem(key),
    setItem: (key, value) => {
      if (writesBlocked) throw new Error("Storage blocked")
      storageToWrap.setItem(key, value)
    },
    removeItem: (key) => {
      if (writesBlocked) throw new Error("Storage blocked")
      storageToWrap.removeItem(key)
    },
    clear: () => storageToWrap.clear(),
    key: (index) => storageToWrap.key(index),
    get length() {
      return storageToWrap.length
    },
  }
  return {
    storage,
    blockWrites: () => {
      writesBlocked = true
    },
  }
}

function installEditorStorages(local: Storage, session: Storage) {
  const originals = {
    globalLocal: globalThis.localStorage,
    globalSession: globalThis.sessionStorage,
    windowLocal: window.localStorage,
    windowSession: window.sessionStorage,
  }
  for (const [target, key, value] of [
    [globalThis, "localStorage", local],
    [globalThis, "sessionStorage", session],
    [window, "localStorage", local],
    [window, "sessionStorage", session],
  ] as const) {
    Object.defineProperty(target, key, { configurable: true, value })
  }
  return () => {
    for (const [target, key, value] of [
      [globalThis, "localStorage", originals.globalLocal],
      [globalThis, "sessionStorage", originals.globalSession],
      [window, "localStorage", originals.windowLocal],
      [window, "sessionStorage", originals.windowSession],
    ] as const) {
      Object.defineProperty(target, key, { configurable: true, value })
    }
  }
}

import { clerkState, clerkMock } from "../../lib/clerk-mock"

mock.module("@clerk/nextjs", () => clerkMock)

const mockPush = mock(() => {})
const mockReplace = mock(() => {})
const mockClipboardWriteText = mock(() => Promise.resolve())

type CapturedPreviewProps = {
  hackathon: {
    sponsors: Array<Record<string, unknown>>
    prizes: Array<Record<string, unknown>>
  }
  challenges: Array<Record<string, unknown>>
  scheduleItems: Array<Record<string, unknown>>
  onFormSave: (data: Record<string, unknown>) => Promise<boolean>
  onBannerChange?: (imageUrl: string | null) => void
  onAuthRequired?: () => void
}

let capturedPreviewProps: CapturedPreviewProps | null = null

mock.module("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} width={width as number} height={height as number} {...rest} />
  },
}))

mock.module("@/components/hackathon/preview/hackathon-preview-client", () => ({
  HackathonPreviewClient: (props: CapturedPreviewProps) => {
    capturedPreviewProps = props
    return (
      <div data-testid="preview">
        <button type="button" onClick={() => props.onBannerChange?.(null)}>
          Clear Banner
        </button>
        <button
          type="button"
          onClick={() => props.onBannerChange?.("https://example.com/draft-b.png")}
        >
          Set Draft B Banner
        </button>
        <button type="button" onClick={() => props.onAuthRequired?.()}>
          Upload Banner
        </button>
      </div>
    )
  },
}))

mock.module("@/components/sign-in-required-dialog", () => ({
  SignInRequiredDialog: (props: { open: boolean; redirectQuery?: string }) =>
    props.open ? (
      <div data-testid="sign-in-dialog" data-redirect-query={props.redirectQuery}>
        Sign In Required
      </div>
    ) : null,
}))

mock.module("@/components/create-organization-dialog", () => ({
  CreateOrganizationDialog: (props: { open: boolean; onSuccess?: () => void }) => {
    return props.open ? (
      <div data-testid="create-org-dialog">
        <button type="button" data-testid="simulate-org-created" onClick={() => props.onSuccess?.()}>
          Simulate Org Created
        </button>
      </div>
    ) : null
  },
}))

const { HackathonDraftEditor, loadSavedState } = await import(
  "@/components/hackathon/hackathon-draft-editor"
)
const { EventImportRecovery } = await import(
  "@/components/hackathon/event-import-editor"
)

const defaultState = {
  name: "Test Hackathon",
  description: null,
  startsAt: null,
  endsAt: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  locationType: null as "in_person" | "virtual" | "hybrid" | null,
  locationName: null,
  locationUrl: null,
  imageUrl: null,
  sponsors: [],
  rules: null,
  prizes: [],
  challenges: [],
  agendaItems: [],
}

beforeEach(() => {
  resetComponentMocks()
  clerkState.isSignedIn = true
  clerkState.organization = { id: "org_1", name: "Test Org" }
  clerkState.memberships = []
  clerkState.setActive.mockClear()
  mockPush.mockClear()
  mockReplace.mockClear()
  mockClipboardWriteText.mockClear()
  capturedPreviewProps = null
  storage.clear()
  for (const candidate of [
    globalThis.localStorage,
    globalThis.sessionStorage,
    window.localStorage,
    window.sessionStorage,
  ]) {
    candidate.clear()
  }
  setRouter({ push: mockPush, replace: mockReplace })
  setPathname("/luma.com/test")
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText: mockClipboardWriteText },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  delete document.modelContext
  sessionStorage.clear()
})

describe("HackathonDraftEditor", () => {
  const mockOnSubmit = mock(() => Promise.resolve({ slug: "test-hackathon" }))

  beforeEach(() => {
    mockOnSubmit.mockClear()
  })

  function renderEditor(overrides?: Partial<Parameters<typeof HackathonDraftEditor>[0]>) {
    return render(
      <HackathonDraftEditor
        initialState={defaultState}
        storageKey="test-draft"
        onSubmit={mockOnSubmit}
        {...overrides}
      />
    )
  }

  async function waitForDraftHydration() {
    await waitFor(() => {
      expect(screen.queryByText("Restoring your draft…")).toBeNull()
    })
  }

  it("waits for draft hydration before rendering editable controls", async () => {
    renderEditor()
    expect(screen.getByText("Restoring your draft…")).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText("Create Event")).toBeDefined()
    })
  })

  it("submits when org is active", async () => {
    renderEditor()
    await waitForDraftHydration()
    fireEvent.click(screen.getByText("Create Event"))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled()
      expect(mockReplace).toHaveBeenCalledWith("/e/test-hackathon/manage")
    })
    expect(mockOnSubmit).toHaveBeenCalledWith(
      defaultState,
      expect.any(String),
      { kind: "scratch", url: null },
      "org_1",
    )
  })

  it("maps rich draft details into the preview and skips incomplete agenda rows", async () => {
    renderEditor({
      initialState: {
        ...defaultState,
        startsAt: "2026-09-03T13:00:00.000Z",
        endsAt: "2026-09-04T21:00:00.000Z",
        sponsors: [{ name: "Gold Partner", tier: "gold" }],
        prizes: [{
          name: "Best Build",
          description: "For the strongest project",
          value: "$1,000",
        }],
        challenges: [{
          title: "Build for teams",
          description: "Help people work together",
          resources: [{
            label: "Starter kit",
            url: "https://example.com/starter",
          }],
        }],
        agendaItems: [
          {
            title: "Opening",
            description: "Welcome everyone",
            startsAt: "2026-09-03T13:30:00.000Z",
            endsAt: "2026-09-03T14:00:00.000Z",
            location: "Main room",
            speakers: ["Alex", "Sam"],
          },
          {
            title: "No time yet",
            description: null,
            startsAt: null,
            endsAt: null,
            location: null,
            speakers: [],
          },
        ],
      },
    })
    await waitForDraftHydration()

    expect(capturedPreviewProps?.hackathon.sponsors).toEqual([
      expect.objectContaining({
        id: "draft-0",
        name: "Gold Partner",
        tier: "gold",
        display_order: 0,
      }),
    ])
    expect(capturedPreviewProps?.hackathon.prizes).toEqual([
      expect.objectContaining({
        id: "draft-0",
        name: "Best Build",
        description: "For the strongest project",
        value: "$1,000",
      }),
    ])
    expect(capturedPreviewProps?.challenges).toEqual([
      expect.objectContaining({
        id: "draft-0",
        title: "Build for teams",
        sortOrder: 0,
      }),
    ])
    expect(capturedPreviewProps?.scheduleItems).toHaveLength(1)
    expect(capturedPreviewProps?.scheduleItems[0]).toEqual(
      expect.objectContaining({
        id: "draft-0",
        title: "Opening",
        location: "Main room",
        sort_order: 0,
      }),
    )
  })

  it("applies every preview edit atomically and rejects an invalid edit", async () => {
    renderEditor()
    await waitForDraftHydration()
    const allFields = {
      name: "Updated Hackathon",
      description: "Updated description",
      startsAt: "2026-09-03T13:00:00.000Z",
      endsAt: "2026-09-04T21:00:00.000Z",
      registrationOpensAt: "2026-08-26T12:00:00.000Z",
      registrationClosesAt: "2026-09-02T12:00:00.000Z",
      locationType: "hybrid" as const,
      locationName: "Main Hall",
      locationUrl: "https://example.com/join",
      imageUrl: "https://example.com/banner.png",
      sponsors: [{ name: "Partner", tier: null }],
      rules: "Be kind",
      prizes: [{ name: "Top Prize", description: null, value: "$500" }],
      challenges: [{ title: "Challenge", description: null, resources: [] }],
      agendaItems: [{
        title: "Kickoff",
        description: null,
        startsAt: "2026-09-03T13:00:00.000Z",
        endsAt: "2026-09-03T13:30:00.000Z",
        location: null,
        speakers: [],
      }],
    }
    let saved = false

    await act(async () => {
      saved = await capturedPreviewProps!.onFormSave(allFields)
    })

    expect(saved).toBe(true)
    await waitFor(() => {
      const stored = JSON.parse(storage.get("test-draft")!)
      expect(stored.state).toEqual(allFields)
    })

    await act(async () => {
      saved = await capturedPreviewProps!.onFormSave({ name: "x".repeat(121) })
    })
    expect(saved).toBe(false)
    expect(JSON.parse(storage.get("test-draft")!).state.name).toBe(
      "Updated Hackathon",
    )
  })

  it("lets WebMCP open the visible review without submitting", async () => {
    const tools: WebMcpTool[] = []
    document.modelContext = {
      registerTool: mock(async (tool) => {
        tools.push(tool)
      }),
    }
    renderEditor()
    await waitForDraftHydration()
    await waitFor(() => {
      expect(
        tools.some((tool) => tool.name === "open_hackathon_review"),
      ).toBe(true)
    })
    const scrollIntoView = mock(() => {})
    const originalQuerySelector = document.querySelector.bind(document)
    const querySelector = mock((selector: string) =>
      selector === "[data-webmcp-draft-review]"
        ? ({ scrollIntoView } as unknown as Element)
        : originalQuerySelector(selector),
    )
    document.querySelector = querySelector as typeof document.querySelector

    try {
      const tool = tools.find(
        (candidate) => candidate.name === "open_hackathon_review",
      )!
      const result = await tool.execute({}, {
        signal: new AbortController().signal,
      })

      expect(result).toEqual(expect.objectContaining({ ok: true }))
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    } finally {
      document.querySelector = originalQuerySelector
    }
  })

  it("submits the forked snapshot when another tab takes the storage key at click time", async () => {
    mockOnSubmit.mockRejectedValueOnce(new Error("Keep the draft open"))
    renderEditor()
    await waitForDraftHydration()
    const firstTab = JSON.parse(storage.get("test-draft")!)
    const otherTab = {
      ...firstTab,
      draftId: "22222222-2222-4222-8222-222222222222",
      state: { ...firstTab.state, name: "Other tab event" },
      savedAt: new Date(Date.now() + 1_000).toISOString(),
    }
    storage.set("test-draft", JSON.stringify(otherTab))

    fireEvent.click(screen.getByText("Create Event"))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
    const forkedEntry = [...storage.entries()].find(([key]) =>
      key.startsWith("test-draft:branch:")
    )
    expect(forkedEntry).toBeDefined()
    const forked = JSON.parse(forkedEntry![1])
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Hackathon" }),
      forked.draftId,
      { kind: "scratch", url: null },
      "org_1",
    )
    expect(storage.get("test-draft")).toBe(JSON.stringify(otherTab))
  })

  it("keeps a link to the created event when navigation does not leave the page", async () => {
    const firstView = renderEditor()
    await waitForDraftHydration()
    fireEvent.click(screen.getByText("Create Event"))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/e/test-hackathon/manage")
    })
    firstView.unmount()
    mockOnSubmit.mockClear()
    mockReplace.mockClear()

    renderEditor()
    await waitForDraftHydration()
    fireEvent.click(screen.getByRole("button", { name: "Open Event" }))

    expect(mockReplace).toHaveBeenCalledWith("/e/test-hackathon/manage")
    expect(mockOnSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Create Event" })).toBeDefined()
  })

  it("keeps the draft when a success response has an unsafe event slug", async () => {
    mockOnSubmit.mockResolvedValueOnce({ slug: "//other-site" })
    renderEditor()
    await waitForDraftHydration()
    const submitted = JSON.parse(storage.get("test-draft")!)

    fireEvent.click(screen.getByText("Create Event"))

    expect(await screen.findByText(/page address was invalid/i)).toBeDefined()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(JSON.parse(storage.get("test-draft")!).draftId).toBe(submitted.draftId)
    expect(screen.getByRole("button", { name: "Create Event" })).toBeDefined()
  })

  it("keeps the page open when a successful create cannot record completion", async () => {
    const originalLocal = globalThis.localStorage
    const originalSession = globalThis.sessionStorage
    const local = createToggleableStorage(originalLocal)
    const session = createToggleableStorage(originalSession)
    const restore = installEditorStorages(
      local.storage,
      session.storage,
    )
    mockOnSubmit.mockImplementationOnce(() => {
      local.blockWrites()
      session.blockWrites()
      return Promise.resolve({ slug: "test-hackathon" })
    })

    try {
      renderEditor()
      await waitForDraftHydration()
      fireEvent.click(screen.getByText("Create Event"))

      expect(
        await screen.findByText(/could(?:n't| not) finish saving that result/i),
      ).toBeDefined()
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
      expect(mockReplace).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it("reports when stale auth finds the draft completed in another tab", async () => {
    mockOnSubmit.mockImplementationOnce((_state, draftId) => {
      const submitted = JSON.parse(storage.get("test-draft")!)
      storage.set(
        `test-draft:completed:${draftId}`,
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
    renderEditor()
    await waitForDraftHydration()

    fireEvent.click(screen.getByText("Create Event"))

    expect(
      await screen.findByText(/created in another tab/i),
    ).toBeDefined()
    expect(screen.queryByTestId("sign-in-dialog")).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("reports when stale auth cannot restore an unsaved draft", async () => {
    const originalLocal = globalThis.localStorage
    const originalSession = globalThis.sessionStorage
    const local = createToggleableStorage(originalLocal)
    const session = createToggleableStorage(originalSession)
    const restore = installEditorStorages(local.storage, session.storage)
    mockOnSubmit.mockImplementationOnce(() => {
      originalLocal.removeItem("test-draft")
      originalSession.removeItem("test-draft")
      local.blockWrites()
      session.blockWrites()
      return Promise.reject(new FetchResponseError({
        message: "Sign in again",
        status: 401,
        code: "unauthorized",
      }))
    })
    renderEditor()
    await waitForDraftHydration()

    try {
      fireEvent.click(screen.getByText("Create Event"))

      expect(
        await screen.findByText(/browser storage couldn't save your draft/i),
      ).toBeDefined()
      expect(screen.queryByTestId("sign-in-dialog")).toBeNull()
    } finally {
      restore()
    }
  })

  it("re-saves an imported draft after stale client auth and waits for another Create Event click", async () => {
    mockOnSubmit.mockImplementationOnce(() => {
      storage.delete("test-draft")
      sessionStorage.removeItem("test-draft")
      return Promise.reject(new FetchResponseError({
        message: "Sign in again to continue.",
        status: 401,
        code: "unauthorized",
      }))
    })
    const staleSessionView = renderEditor({
      sourceUrl: "https://lu.ma/test-event",
      draftSource: { kind: "event_import", url: "https://lu.ma/test-event" },
    })
    await waitForDraftHydration()
    const submitted = JSON.parse(storage.get("test-draft")!)
    fireEvent.click(screen.getByText("Create Event"))

    const dialog = await screen.findByTestId("sign-in-dialog")
    expect(dialog.getAttribute("data-redirect-query")).toBe("review=true")
    const saved = JSON.parse(storage.get("test-draft")!)
    expect(saved.state).toEqual(defaultState)
    expect(saved.draftId).toBe(submitted.draftId)
    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()

    staleSessionView.unmount()
    setSearchParams(new URLSearchParams("review=true"))
    renderEditor({
      sourceUrl: "https://lu.ma/test-event",
      draftSource: { kind: "event_import", url: "https://lu.ma/test-event" },
    })
    await waitForDraftHydration()

    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
  })

  it("keeps the imported draft without explicit proof the event committed", async () => {
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
    renderEditor()
    await waitForDraftHydration()
    const submitted = JSON.parse(storage.get("test-draft")!)

    fireEvent.click(screen.getByText("Create Event"))

    expect(await screen.findByText(/setup could not be scheduled/i)).toBeDefined()
    const preserved = JSON.parse(storage.get("test-draft")!)
    expect(preserved.draftId).toBe(submitted.draftId)
    expect(preserved.state).toEqual(submitted.state)
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByText("Create Event").closest("button")?.disabled).toBe(false)
    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
  })

  it("opens a committed imported event and rotates newer setup edits", async () => {
    let rejectCreate!: (reason: unknown) => void
    mockOnSubmit.mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        rejectCreate = reject
      }),
    )
    renderEditor()
    await waitForDraftHydration()
    const submitted = JSON.parse(storage.get("test-draft")!)

    fireEvent.click(screen.getByText("Create Event"))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
    storage.set("test-draft", JSON.stringify({
      ...submitted,
      revision: submitted.revision + 1,
      state: { ...submitted.state, name: "New imported setup edits" },
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
    const recovered = JSON.parse(storage.get("test-draft")!)
    expect(recovered.state.name).toBe("New imported setup edits")
    expect(recovered.draftId).not.toBe(submitted.draftId)
    expect(recovered.revision).toBe(0)
    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
  })

  it("opens an existing imported event without clearing newer edits", async () => {
    mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This saved draft already created an event.",
      status: 422,
      code: "draft_conflict",
      existingEvent: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Created event",
        slug: "created-event",
      },
    }))
    renderEditor()
    await waitForDraftHydration()
    const consumed = JSON.parse(storage.get("test-draft")!)

    fireEvent.click(screen.getByText("Create Event"))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/e/created-event/manage")
    })
    const recovered = JSON.parse(storage.get("test-draft")!)
    expect(recovered.state).toEqual(consumed.state)
    expect(recovered.draftId).not.toBe(consumed.draftId)
    expect(recovered.revision).toBe(0)
    expect(screen.getByText("Create Event")).toBeDefined()
    expect(screen.getByRole("button", { name: "Open Event" }).hasAttribute("disabled")).toBe(false)
    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
  })

  it("keeps a draft-conflict recovery visible when no event link is returned", async () => {
    mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This saved draft already created an event.",
      status: 422,
      code: "draft_conflict",
    }))
    renderEditor()
    await waitForDraftHydration()

    fireEvent.click(screen.getByText("Create Event"))

    expect(
      await screen.findByText(/already created.*newer edits are saved/i),
    ).toBeDefined()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("keeps draft B when retrying draft A returns a lost-success conflict", async () => {
    mockOnSubmit.mockRejectedValueOnce(new Error("The success response was lost"))
    mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This saved draft already created an event.",
      status: 422,
      code: "draft_conflict",
      existingEvent: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Draft A event",
        slug: "draft-a-event",
      },
    }))
    renderEditor({
      sourceUrl: "https://lu.ma/test-event",
      draftSource: { kind: "event_import", url: "https://lu.ma/test-event" },
    })
    await waitForDraftHydration()
    const draftA = JSON.parse(storage.get("test-draft")!)

    fireEvent.click(screen.getByText("Create Event"))
    expect(await screen.findByText("The success response was lost")).toBeDefined()

    fireEvent.click(screen.getByText("Set Draft B Banner"))
    await waitFor(() => {
      expect(JSON.parse(storage.get("test-draft")!).state.imageUrl).toBe(
        "https://example.com/draft-b.png",
      )
    })
    fireEvent.click(screen.getByText("Create Event"))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/e/draft-a-event/manage")
    })
    const draftB = JSON.parse(storage.get("test-draft")!)
    expect(draftB.state.imageUrl).toBe("https://example.com/draft-b.png")
    expect(draftB.draftId).not.toBe(draftA.draftId)
    expect(draftB.revision).toBe(0)
    expect(screen.getByRole("button", { name: "Open Event" })).toBeDefined()
    expect(screen.getByText("Create Event")).toBeDefined()
    expect(mockOnSubmit).toHaveBeenCalledTimes(2)
  })

  it("keeps an Org A import when a lost-response retry is made under Org B", async () => {
    mockOnSubmit.mockRejectedValueOnce(new Error("The Org A response was lost"))
    mockOnSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This draft was already used with another organization.",
      status: 422,
      code: "draft_organization_conflict",
      retryable: false,
    }))
    const props = {
      sourceUrl: "https://lu.ma/test-event",
      draftSource: {
        kind: "event_import" as const,
        url: "https://lu.ma/test-event",
      },
    }
    const view = renderEditor(props)
    await waitForDraftHydration()
    const orgADraft = JSON.parse(storage.get("test-draft")!)

    fireEvent.click(screen.getByText("Create Event"))
    expect(await screen.findByText("The Org A response was lost")).toBeDefined()

    clerkState.organization = { id: "org_2", name: "Org B" }
    view.rerender(
      <HackathonDraftEditor
        initialState={defaultState}
        storageKey="test-draft"
        onSubmit={mockOnSubmit}
        {...props}
      />,
    )
    fireEvent.click(screen.getByText("Create Event"))

    expect(await screen.findByText(/switch back to the organization you first used/i)).toBeDefined()
    const preserved = JSON.parse(storage.get("test-draft")!)
    expect(preserved.draftId).toBe(orgADraft.draftId)
    expect(preserved.state).toEqual(orgADraft.state)
    expect([...storage.keys()].some((key) => key.startsWith("test-draft:branch:"))).toBe(false)
    expect(mockReplace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/e\//))
    expect(mockOnSubmit).toHaveBeenCalledTimes(2)
  })

  it("keeps edits made while a lost success response is pending", async () => {
    let rejectCreate!: (reason: unknown) => void
    mockOnSubmit.mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        rejectCreate = reject
      }),
    )
    renderEditor()
    await waitForDraftHydration()
    const submitted = JSON.parse(storage.get("test-draft")!)

    fireEvent.click(screen.getByText("Create Event"))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
    storage.set("test-draft", JSON.stringify({
      ...submitted,
      revision: submitted.revision + 1,
      state: { ...submitted.state, name: "Newer imported edits" },
      savedAt: new Date(Date.now() + 1_000).toISOString(),
    }))
    rejectCreate(new FetchResponseError({
      message: "This saved draft already created an event.",
      status: 422,
      code: "draft_conflict",
      existingEvent: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Created event",
        slug: "created-event",
      },
    }))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/e/created-event/manage")
    })
    const recovered = JSON.parse(storage.get("test-draft")!)
    expect(recovered.state.name).toBe("Newer imported edits")
    expect(recovered.draftId).not.toBe(submitted.draftId)
    expect(recovered.revision).toBe(0)
    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
  })

  describe("org gate", () => {
    beforeEach(() => {
      clerkState.organization = null
      clerkState.memberships = [
        { role: "org:admin", organization: { id: "org_1", name: "Alpha Org", imageUrl: null } },
        { role: "org:admin", organization: { id: "org_2", name: "Beta Org", imageUrl: "https://example.com/beta.png" } },
      ]
    })

    it("shows connect organization button when signed in without org", async () => {
      renderEditor()
      await waitForDraftHydration()
      expect(screen.getByText("Connect Organization")).toBeDefined()
    })

    it("shows org gate dialog when clicking connect organization", async () => {
      renderEditor()
      await waitForDraftHydration()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => {
        expect(screen.getByText("Pick an organization")).toBeDefined()
      })
    })

    it("lists existing organizations", async () => {
      renderEditor()
      await waitForDraftHydration()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => {
        expect(screen.getByText("Alpha Org")).toBeDefined()
        expect(screen.getByText("Beta Org")).toBeDefined()
      })
    })

    it("returns to review without submitting after selecting an organization", async () => {
      clerkState.setActive.mockImplementation(async () => {
        clerkState.organization = { id: "org_1", name: "Alpha Org" }
      })
      renderEditor()
      await waitForDraftHydration()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => screen.getByText("Alpha Org"))
      fireEvent.click(screen.getByText("Alpha Org"))

      await waitFor(() => {
        expect(clerkState.setActive).toHaveBeenCalledWith({ organization: "org_1" })
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("returns to review without submitting after creating a new organization", async () => {
      renderEditor()
      await waitForDraftHydration()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => screen.getByText("Create a new organization"))
      fireEvent.click(screen.getByText("Create a new organization"))

      await waitFor(() => screen.getByTestId("simulate-org-created"))
      clerkState.organization = { id: "org_new", name: "New Org" }
      fireEvent.click(screen.getByTestId("simulate-org-created"))

      await waitFor(() => {
        expect(screen.queryByTestId("create-org-dialog")).toBeNull()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("does not submit when org gate is dismissed", async () => {
      renderEditor()
      await waitForDraftHydration()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => screen.getByText("Pick an organization"))

      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("returns from sign-in to review without auto-opening the org gate", async () => {
      setSearchParams(new URLSearchParams("edit=true"))
      renderEditor()

      await waitFor(() => {
        expect(screen.getByText("Connect Organization")).toBeDefined()
      })
      expect(screen.queryByText("Pick an organization")).toBeNull()
    })
  })

  describe("sign in gate", () => {
    beforeEach(() => {
      clerkState.isSignedIn = false
    })

    it("shows sign in dialog when not signed in", async () => {
      renderEditor()
      await waitForDraftHydration()
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(screen.getByTestId("sign-in-dialog")).toBeDefined()
      })
    })

    it("does not open sign in from upload when the draft cannot be saved", async () => {
      const originalGlobalLocalStorage = globalThis.localStorage
      const originalGlobalSessionStorage = globalThis.sessionStorage
      const originalLocalStorage = window.localStorage
      const originalSessionStorage = window.sessionStorage
      const blockedStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error("Storage blocked")
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
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: blockedStorage,
      })
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: blockedStorage,
      })
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: blockedStorage,
      })

      try {
        renderEditor()
        await waitFor(() => {
          expect(screen.getByText(/turn on browser storage/i)).toBeDefined()
        })
        fireEvent.click(screen.getByText("Upload Banner"))
        expect(screen.queryByTestId("sign-in-dialog")).toBeNull()
        expect(screen.getAllByText(/turn on browser storage/i).length).toBeGreaterThan(0)
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
          value: originalLocalStorage,
        })
        Object.defineProperty(window, "sessionStorage", {
          configurable: true,
          value: originalSessionStorage,
        })
      }
    })
  })

  it("fails closed when the active organization role is not admin", async () => {
    clerkState.has.mockImplementation(() => false)
    renderEditor()

    await waitFor(() => {
      expect(screen.getByText("Connect Organization")).toBeDefined()
    })
    fireEvent.click(screen.getByText("Connect Organization"))
    await waitFor(() => {
      expect(screen.getByText("Pick an organization")).toBeDefined()
    })
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it("shows error when name is empty", async () => {
    renderEditor({ initialState: { ...defaultState, name: "" } })
    await waitForDraftHydration()

    const button = screen.getByText("Create Event")
    expect(button.hasAttribute("disabled")).toBe(true)
  })

  it("submits the cleared banner state after removing an imported image", async () => {
    renderEditor({
      initialState: {
        ...defaultState,
        imageUrl: "https://example.com/banner.png",
      },
    })
    await waitForDraftHydration()

    fireEvent.click(screen.getByText("Clear Banner"))
    fireEvent.click(screen.getByText("Create Event"))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: null,
        }),
        expect.any(String),
        { kind: "scratch", url: null },
        "org_1",
      )
    })
  })

  describe("sourceUrl-based localStorage invalidation", () => {
    const STORAGE_KEY = "test-draft"

    it("discards stale localStorage when sourceUrl changes", async () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "Event A" },
          sourceUrl: "https://luma.com/event-a",
          savedAt: Date.now(),
        })
      )

      renderEditor({
        storageKey: STORAGE_KEY,
        sourceUrl: "https://luma.com/event-b",
        initialState: { ...defaultState, name: "Event B" },
      })

      await waitForDraftHydration()
      expect(screen.getByText("Create Event")).toBeDefined()
      await waitFor(() => {
        expect(storage.get(STORAGE_KEY)).toBeDefined()
        const stored = JSON.parse(storage.get(STORAGE_KEY)!)
        expect(stored.state.name).toBe("Event B")
        expect(stored.source.url).toBe("https://luma.com/event-b")
      })
    })

    it("restores localStorage when sourceUrl matches", async () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "Event A Edited" },
          sourceUrl: "https://luma.com/event-a",
          savedAt: Date.now(),
        })
      )

      renderEditor({
        storageKey: STORAGE_KEY,
        sourceUrl: "https://luma.com/event-a",
        initialState: { ...defaultState, name: "Event A" },
      })

      await waitForDraftHydration()
      await waitFor(() => {
        const stored = JSON.parse(storage.get(STORAGE_KEY)!)
        expect(stored.state.name).toBe("Event A Edited")
        expect(stored.version).toBe(1)
      })
    })

    it("restores localStorage when no sourceUrl is provided (create-from-scratch)", async () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "My Draft" },
          savedAt: Date.now(),
        })
      )

      renderEditor({
        storageKey: STORAGE_KEY,
        initialState: { ...defaultState, name: "Default" },
      })

      await waitForDraftHydration()
      await waitFor(() => {
        const stored = JSON.parse(storage.get(STORAGE_KEY)!)
        expect(stored.state.name).toBe("My Draft")
        expect(stored.version).toBe(1)
      })
    })
  })

  describe("loadSavedState migration", () => {
    const STORAGE_KEY = "test-migration"

    it("adds challenges: [] to state missing the field", () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "Legacy Event" },
          savedAt: Date.now(),
        })
      )

      const result = loadSavedState(STORAGE_KEY)
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Legacy Event")
      expect(result!.challenges).toEqual([])
    })

    it("preserves existing challenges field", () => {
      const challenges = [{ title: "Build an AI", description: null, resources: [] }]
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "New Event", challenges },
          savedAt: Date.now(),
        })
      )

      const result = loadSavedState(STORAGE_KEY)
      expect(result).not.toBeNull()
      expect(result!.challenges).toEqual(challenges)
    })

    it("shows a review notice after bounding an old scratch draft", async () => {
      storage.set(STORAGE_KEY, JSON.stringify({
        state: {
          ...defaultState,
          name: "n".repeat(121),
          description: "Keep this description",
        },
        savedAt: Date.now(),
      }))

      renderEditor({
        storageKey: STORAGE_KEY,
        initialState: { ...defaultState, name: "New draft" },
      })

      expect(await screen.findByText(/older draft were too long or unsafe/i)).toBeDefined()
      const migrated = JSON.parse(storage.get(STORAGE_KEY)!)
      expect(migrated.state.name).toHaveLength(120)
      expect(migrated.state.description).toBe("Keep this description")
    })
  })

  it("shows a truncated source URL and copies the full URL", async () => {
    const view = renderEditor({
      sourceUrl: "https://www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158?aff=ebdssbdestsearch",
    })
    await waitForDraftHydration()

    expect(
      screen.getByText("www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158?aff=ebdssbdestsearch")
    ).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Copy source URL" }))

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        "https://www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158?aff=ebdssbdestsearch"
      )
      expect(screen.getByRole("button", { name: "Source URL copied" })).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Source URL copied" }))
    await waitFor(() => expect(mockClipboardWriteText).toHaveBeenCalledTimes(2))
    view.unmount()
  })

  it("shows a safe display label when the source URL cannot be parsed", async () => {
    renderEditor({ sourceUrl: "https://not a valid url" })
    await waitForDraftHydration()

    expect(screen.getByText("not a valid url")).toBeDefined()
  })

  it("renders its explicit recovery fallback when no saved draft exists", async () => {
    renderEditor({
      createIfMissing: false,
      fallbackWhenNoSavedDraft: <p>No saved import</p>,
    })

    expect(await screen.findByText("No saved import")).toBeDefined()
    expect(screen.queryByText("Create Event")).toBeNull()
  })

  it("opens a recently completed event instead of showing an empty recovery", async () => {
    const completed = createDraftEnvelope(defaultState, {
      draftId: "34343434-3434-4434-8434-343434343434",
    })
    storage.set("test-draft", serializeDraftEnvelope(completed))
    storage.set(
      `test-draft:completed:${completed.draftId}`,
      JSON.stringify({
        completedDraft: {
          draftId: completed.draftId,
          revision: completed.revision,
          savedAt: completed.savedAt,
          completedAt: new Date().toISOString(),
          eventSlug: "recent-event",
        },
      }),
    )
    renderEditor({
      createIfMissing: false,
      fallbackWhenNoSavedDraft: <p>No saved import</p>,
    })

    expect(await screen.findByText("Your event was created")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Open Event" }))

    expect(mockReplace).toHaveBeenCalledWith("/e/recent-event/manage")
    expect(screen.queryByText("No saved import")).toBeNull()
  })

  describe("failed import re-scrape recovery", () => {
    const sourceUrl = "https://events.example.com/hackathon"
    const baseStorageKey = "test-import-recovery"
    const sourceStorageKey = `${baseStorageKey}:${encodeURIComponent(sourceUrl)}`

    it("renders the saved source-specific draft when the source cannot be read again", async () => {
      globalThis.localStorage.setItem(sourceStorageKey, JSON.stringify({
        version: 1,
        draftId: "1d065280-8f46-41d0-a271-8474c26f1fb8",
        revision: 3,
        state: { ...defaultState, name: "Recovered Hackathon" },
        source: { kind: "event_import", url: sourceUrl },
        savedAt: new Date().toISOString(),
      }))

      render(
        <EventImportRecovery
          sourceUrl={sourceUrl}
          storageKey={baseStorageKey}
          submitPath="/api/dashboard/import/event"
          fallback={<p>Import failed</p>}
        />,
      )

      await waitFor(() => {
        expect(screen.getByText("Recovered Hackathon")).toBeDefined()
      })
      expect(screen.queryByText("Import failed")).toBeNull()
    })

    it("migrates an old secret-bearing import through reload and auth resume", async () => {
      const redactedSourceUrl = "https://events.example.com/hackathon"
      const legacySourceUrl = `${redactedSourceUrl}?invite=secret#private`
      const resumedStorageKey = "oatmeal:external-import:opaque-reference"
      globalThis.localStorage.setItem("oatmeal:external-import", JSON.stringify({
        state: {
          ...defaultState,
          name: "Legacy resumed import",
          description: "d".repeat(5_001),
          rules: "Keep these imported rules",
        },
        sourceUrl: legacySourceUrl,
        savedAt: Date.now(),
      }))
      const resumePath = createAuthResumeTarget(
        "/import?review=true",
        { sourceUrl: redactedSourceUrl, storageKey: resumedStorageKey },
      )
      const token = new URL(
        resumePath!,
        "https://app.example",
      ).searchParams.get("token")!
      const target = restoreAuthResumeTarget(token)
      expect(target).toEqual({
        kind: "import",
        sourceUrl: redactedSourceUrl,
        storageKey: resumedStorageKey,
      })
      if (!target || target.kind !== "import") return

      const firstView = render(
        <EventImportRecovery
          sourceUrl={target.sourceUrl}
          storageKey={target.storageKey}
          submitPath="/api/dashboard/import/event"
          fallback={<p>Import failed</p>}
        />,
      )
      expect(await screen.findByText("Legacy resumed import")).toBeDefined()
      expect(screen.getByText(/older draft were too long or unsafe/i)).toBeDefined()
      const migrated = JSON.parse(
        globalThis.localStorage.getItem(resumedStorageKey)!,
      )
      expect(migrated.source).toEqual({
        kind: "event_import",
        url: redactedSourceUrl,
      })
      expect(migrated.state.description).toHaveLength(5_000)
      expect(migrated.state.rules).toBe("Keep these imported rules")
      expect(globalThis.localStorage.getItem(resumedStorageKey)).not.toContain(
        "invite=secret",
      )

      firstView.unmount()
      render(
        <EventImportRecovery
          sourceUrl={target.sourceUrl}
          storageKey={target.storageKey}
          submitPath="/api/dashboard/import/event"
          fallback={<p>Import failed</p>}
        />,
      )
      expect(await screen.findByText("Legacy resumed import")).toBeDefined()
      expect(screen.queryByText("Import failed")).toBeNull()
    })

    it("shows the normal failure state when no matching draft exists", async () => {
      render(
        <EventImportRecovery
          sourceUrl={sourceUrl}
          storageKey={baseStorageKey}
          submitPath="/api/dashboard/import/event"
          fallback={<p>Import failed</p>}
        />,
      )

      await waitFor(() => {
        expect(screen.getByText("Import failed")).toBeDefined()
      })
    })

    it("keeps the created event link when import recovery reloads after completion", async () => {
      globalThis.localStorage.setItem(baseStorageKey, JSON.stringify({
        completedDraft: {
          draftId: "1d065280-8f46-41d0-a271-8474c26f1fb8",
          revision: 3,
          savedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          eventSlug: "recovered-hackathon",
        },
      }))

      render(
        <EventImportRecovery
          sourceUrl={sourceUrl}
          storageKey={baseStorageKey}
          submitPath="/api/dashboard/import/event"
          fallback={<p>Import failed</p>}
        />,
      )

      const openEvent = await screen.findByRole("button", { name: "Open Event" })
      expect(screen.queryByText("Import failed")).toBeNull()
      fireEvent.click(openEvent)
      expect(mockReplace).toHaveBeenCalledWith("/e/recovered-hackathon/manage")
    })

    it("switches to the matching saved draft when the import URL changes", async () => {
      const nextSourceUrl = "https://events.example.com/other-hackathon"
      const nextStorageKey = `${baseStorageKey}:${encodeURIComponent(nextSourceUrl)}`
      for (const [key, url, name] of [
        [sourceStorageKey, sourceUrl, "First imported event"],
        [nextStorageKey, nextSourceUrl, "Second imported event"],
      ]) {
        globalThis.localStorage.setItem(key, JSON.stringify({
          version: 1,
          draftId: crypto.randomUUID(),
          revision: 2,
          state: { ...defaultState, name },
          source: { kind: "event_import", url },
          savedAt: new Date().toISOString(),
        }))
      }

      const view = render(
        <EventImportRecovery
          sourceUrl={sourceUrl}
          storageKey={baseStorageKey}
          submitPath="/api/dashboard/import/event"
          fallback={<p>Import failed</p>}
        />,
      )
      expect(await screen.findByText("First imported event")).toBeDefined()

      view.rerender(
        <EventImportRecovery
          sourceUrl={nextSourceUrl}
          storageKey={baseStorageKey}
          submitPath="/api/dashboard/import/event"
          fallback={<p>Import failed</p>}
        />,
      )

      expect(await screen.findByText("Second imported event")).toBeDefined()
      expect(screen.queryByText("First imported event")).toBeNull()
    })
  })
})
