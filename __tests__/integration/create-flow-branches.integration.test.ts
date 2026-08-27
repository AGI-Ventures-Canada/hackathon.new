import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import type { DraftEnvelope, DraftState } from "@/lib/hackathon-draft"
import { FetchResponseError } from "@/lib/utils/fetch"

type DraftSnapshot = {
  state: DraftState
  envelope: DraftEnvelope
  hydrated: boolean
  persistenceStatus: "saved" | "completed" | "conflict" | "unavailable"
  updateState: ReturnType<typeof mock>
  patchState: ReturnType<typeof mock>
  ensureSavedDraft: ReturnType<typeof mock>
  getCurrentEnvelope: ReturnType<typeof mock>
  preserveDraftAfterConflict: ReturnType<typeof mock>
  clearSavedDraft: ReturnType<typeof mock>
  conflictMessage: string | null
  hasStoredDraft: boolean | null
  recentCompletedEventSlug: string | null
}

type SignInProps = {
  open: boolean
  beforeNavigate: () => true | string
}

type WebMcpProps = {
  onOpenSignIn: () => void
}

type PreviewProps = {
  onAuthRequired?: () => void
}

type KeyboardProps = {
  onPrimary?: () => void
}

const eventState: DraftState = {
  name: "Branch Test Event",
  description: null,
  startsAt: null,
  endsAt: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  locationType: null,
  locationName: null,
  locationUrl: null,
  imageUrl: null,
  sponsors: [],
  rules: null,
  prizes: [],
  challenges: [],
  agendaItems: [],
}

const eventEnvelope: DraftEnvelope = {
  version: 1,
  draftId: "11111111-1111-4111-8111-111111111111",
  revision: 2,
  state: eventState,
  source: { kind: "scratch", url: null },
  savedAt: "2026-08-26T16:00:00.000Z",
}

let ensureResult: "saved" | "completed" | "conflict" | "unavailable"
let preserveResult:
  | "preserved"
  | "already_rotated"
  | "completed"
  | "preservation_failed"
  | "completion_failed"
let clearResult:
  | "cleared"
  | "preserved"
  | "preservation_failed"
  | "completion_failed"
  | "cleanup_failed"
let draftSnapshot: DraftSnapshot
let signInProps: SignInProps | null
let webMcpProps: WebMcpProps | null
let previewProps: PreviewProps | null
let keyboardProps: KeyboardProps | null
let clerkLoaded: boolean
let clerkSignedIn: boolean
let clerkAdmin: boolean
let searchParams: URLSearchParams

const replace = mock((_url: string) => {})
const onSubmit = mock(async () => ({ id: "event-1", slug: "created-event" }))
const ensureSavedDraft = mock(() => ensureResult)
const preserveDraftAfterConflict = mock(() => preserveResult)
const clearSavedDraft = mock(() => clearResult)
const useHackathonDraft = mock(() => draftSnapshot)

mock.module("next/navigation", () => ({
  usePathname: () => "/create",
  useRouter: () => ({
    back: mock(() => {}),
    push: mock((_url: string) => {}),
    replace,
  }),
  useSearchParams: () => searchParams,
}))
mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({
    has: () => clerkAdmin,
    isLoaded: clerkLoaded,
    isSignedIn: clerkSignedIn,
    orgId: clerkSignedIn ? "org-1" : null,
  }),
  useOrganization: () => ({
    isLoaded: clerkLoaded,
    organization: { id: "org-1", name: "Test Org" },
  }),
}))
mock.module("@/hooks/use-hackathon-draft", () => ({
  browserDraftStorages: () => [],
  useHackathonDraft,
}))
mock.module("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled: _disabled,
    onClick,
    type,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
    type?: "button" | "submit" | "reset"
    "aria-label"?: string
  }) => createElement("button", {
    "aria-label": ariaLabel,
    onClick,
    type: type ?? "button",
  }, children),
}))
mock.module("@/components/ui/kbd", () => ({
  Kbd: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}))
mock.module("lucide-react", () => ({
  ArrowLeft: () => createElement("span"),
  Check: () => createElement("span"),
  Copy: () => createElement("span"),
  Loader2: () => createElement("span"),
  X: () => createElement("span"),
}))
mock.module("@/components/hackathon/preview/hackathon-preview-client", () => ({
  HackathonPreviewClient: (props: PreviewProps) => {
    previewProps = props
    return createElement("div", null, "Preview marker")
  },
}))
mock.module("@/components/sign-in-required-dialog", () => ({
  SignInRequiredDialog: (props: SignInProps) => {
    signInProps = props
    return props.open ? createElement("div", { "data-testid": "sign-in" }) : null
  },
}))
mock.module("@/components/org-gate-dialog", () => ({
  OrgGateDialog: () => null,
}))
mock.module("@/components/hackathon/create-draft-webmcp-tools", () => ({
  CreateDraftWebMcpTools: (props: WebMcpProps) => {
    webMcpProps = props
    return null
  },
}))
mock.module("@/components/hackathon/draft-review", () => ({
  DraftReview: () => createElement("div", null, "Review marker"),
}))
mock.module("@/components/hackathon/create-flow/create-flow-progress", () => ({
  CreateFlowProgress: () => null,
}))
mock.module("@/components/hackathon/create-flow/create-flow-step", () => ({
  CreateFlowStep: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}))
mock.module("@/components/hackathon/create-flow/step-import", () => ({
  StepImport: () => createElement("div", null, "Import marker"),
}))
mock.module("@/components/hackathon/create-flow/step-name", () => ({ StepName: () => null }))
mock.module("@/components/hackathon/create-flow/step-dates", () => ({ StepDates: () => null }))
mock.module("@/components/hackathon/create-flow/step-location", () => ({ StepLocation: () => null }))
mock.module("@/components/hackathon/create-flow/step-description", () => ({ StepDescription: () => null }))
mock.module("@/components/hackathon/create-flow/use-create-flow-keyboard", () => ({
  useCreateFlowKeyboard: (props: KeyboardProps) => {
    keyboardProps = props
  },
}))

const { CreateFlow } = await import("@/components/hackathon/create-flow/create-flow")
const { HackathonDraftEditor } = await import(
  "@/components/hackathon/hackathon-draft-editor"
)

function resetDraftSnapshot() {
  ensureResult = "saved"
  preserveResult = "preserved"
  clearResult = "cleared"
  draftSnapshot = {
    state: eventState,
    envelope: eventEnvelope,
    hydrated: true,
    persistenceStatus: "saved",
    updateState: mock(() => {}),
    patchState: mock(() => {}),
    ensureSavedDraft,
    getCurrentEnvelope: mock(() => eventEnvelope),
    preserveDraftAfterConflict,
    clearSavedDraft,
    conflictMessage: null,
    hasStoredDraft: true,
    recentCompletedEventSlug: null,
  }
}

function renderFlow() {
  return render(createElement(CreateFlow, {
    initialState: eventState,
    onSubmit,
  }))
}

function renderEditor() {
  return render(createElement(HackathonDraftEditor, {
    initialState: eventState,
    storageKey: "branch-test-draft",
    onSubmit,
  }))
}

async function openReview() {
  renderFlow()
  await screen.findByText("Review marker")
}

async function submitFromReview() {
  fireEvent.click(screen.getByRole("button", { name: "Create Event" }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
}

beforeEach(() => {
  sessionStorage.clear()
  clerkLoaded = true
  clerkSignedIn = true
  clerkAdmin = true
  searchParams = new URLSearchParams("review=true")
  signInProps = null
  webMcpProps = null
  previewProps = null
  keyboardProps = null
  replace.mockClear()
  onSubmit.mockReset()
  onSubmit.mockResolvedValue({ id: "event-1", slug: "created-event" })
  ensureSavedDraft.mockClear()
  preserveDraftAfterConflict.mockClear()
  clearSavedDraft.mockClear()
  resetDraftSnapshot()
})

afterEach(cleanup)

describe("creation flow recovery branches", () => {
  it("keeps the draft open when a successful create cannot preserve newer edits", async () => {
    clearResult = "preservation_failed"
    await openReview()

    await submitFromReview()

    expect(await screen.findByText(/newer edits aren't saved yet/i)).toBeDefined()
    expect(replace).not.toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("warns but opens an event when only obsolete draft cleanup fails", async () => {
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn
    clearResult = "cleanup_failed"
    await openReview()

    try {
      await submitFromReview()
      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith("/e/created-event/manage")
      })
      expect(warn).toHaveBeenCalledWith(
        "The completed draft could not be cleared from browser storage.",
      )
    } finally {
      console.warn = originalWarn
    }
  })

  it("opens a committed event when its completion cannot be recorded", async () => {
    preserveResult = "completion_failed"
    onSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "Setup could not be scheduled.",
      status: 503,
      code: "finalization_unscheduled",
      retryable: true,
      committed: true,
      existingEvent: {
        id: "event-1",
        name: "Created event",
        slug: "created-event",
      },
    }))
    await openReview()

    await submitFromReview()

    expect(await screen.findByText(/event was created.*opening it now/i)).toBeDefined()
    expect(replace).toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("does not navigate a lost-success conflict when newer edits cannot be saved", async () => {
    preserveResult = "preservation_failed"
    onSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This draft already created an event.",
      status: 422,
      code: "draft_conflict",
      existingEvent: {
        id: "event-1",
        name: "Created event",
        slug: "created-event",
      },
    }))
    await openReview()

    await submitFromReview()

    expect(await screen.findByText(/open \/e\/created-event\/manage in another tab/i)).toBeDefined()
    expect(replace).not.toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("uses the plain conflict message when no event or rotated draft is available", async () => {
    preserveResult = "completed"
    onSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This draft already created an event.",
      status: 422,
      code: "draft_conflict",
    }))
    await openReview()

    await submitFromReview()

    expect(await screen.findByText("This event was already created.")).toBeDefined()
    expect(replace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/e\//))
  })

  it("keeps a stale-auth draft visible when storage is unavailable", async () => {
    ensureSavedDraft
      .mockImplementationOnce(() => "saved")
      .mockImplementationOnce(() => "unavailable")
    onSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "Sign in again.",
      status: 401,
      code: "unauthorized",
    }))
    await openReview()

    await submitFromReview()

    expect(await screen.findByText(/browser storage couldn't save your draft/i)).toBeDefined()
  })

  it("opens committed results that need no draft rotation", async () => {
    preserveResult = "completed"
    onSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "Setup could not be scheduled.",
      status: 503,
      code: "finalization_unscheduled",
      committed: true,
      existingEvent: {
        id: "event-1",
        name: "Created event",
        slug: "created-event",
      },
    }))
    await openReview()

    await submitFromReview()

    expect(await screen.findByText(/event was created.*opening it now/i)).toBeDefined()
    expect(replace).toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("opens existing conflict results that need no draft rotation", async () => {
    preserveResult = "completed"
    onSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This draft already created an event.",
      status: 422,
      code: "draft_conflict",
      existingEvent: {
        id: "event-1",
        name: "Created event",
        slug: "created-event",
      },
    }))
    await openReview()

    await submitFromReview()

    expect(await screen.findByText(/event was already created.*opening it now/i)).toBeDefined()
    expect(replace).toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("rechecks every browser-draft state before auth navigation", async () => {
    await openReview()
    expect(signInProps).not.toBeNull()

    ensureResult = "saved"
    expect(signInProps!.beforeNavigate()).toBe(true)
    ensureResult = "conflict"
    expect(signInProps!.beforeNavigate()).toBe(true)
    ensureResult = "completed"
    expect(signInProps!.beforeNavigate()).toMatch(/created in another tab/i)
    ensureResult = "unavailable"
    expect(signInProps!.beforeNavigate()).toMatch(/couldn't save your draft/i)
  })

  it("maps agent sign-in continuation failures without opening auth", async () => {
    await openReview()
    expect(webMcpProps).not.toBeNull()

    for (const [result, message] of [
      ["completed", /created in another tab/i],
      ["conflict", /review the newest draft/i],
      ["unavailable", /turn on browser storage/i],
    ] as const) {
      ensureResult = result
      act(() => webMcpProps!.onOpenSignIn())
      expect(await screen.findByText(message)).toBeDefined()
      expect(screen.queryByTestId("sign-in")).toBeNull()
    }

    ensureResult = "saved"
    act(() => webMcpProps!.onOpenSignIn())
    expect(await screen.findByTestId("sign-in")).toBeDefined()
  })

  it("waits instead of creating if Clerk unloads while review is open", async () => {
    const view = renderFlow()
    await screen.findByText("Review marker")
    clerkLoaded = false
    view.rerender(createElement(CreateFlow, {
      initialState: eventState,
      onSubmit,
    }))

    act(() => keyboardProps!.onPrimary?.())

    expect(await screen.findByText(/wait a moment while we restore your draft/i)).toBeDefined()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("automatically opens a completed event from the review", async () => {
    draftSnapshot = {
      ...draftSnapshot,
      persistenceStatus: "completed",
      recentCompletedEventSlug: "completed-event",
    }
    await openReview()

    expect(replace).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenLastCalledWith("/e/completed-event/manage")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("opens a recent event while preserving the current saved draft", async () => {
    draftSnapshot = {
      ...draftSnapshot,
      recentCompletedEventSlug: "previous-event",
    }
    await openReview()

    fireEvent.click(screen.getByRole("button", { name: "Open Event" }))

    expect(replace).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenLastCalledWith("/e/previous-event/manage")
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("draft editor recovery branches", () => {
  async function submitEditor() {
    renderEditor()
    await screen.findByText("Preview marker")
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }))
  }

  function committedError(code: "finalization_unscheduled" | "draft_conflict") {
    return new FetchResponseError({
      message: code === "draft_conflict"
        ? "This draft already created an event."
        : "Setup could not be scheduled.",
      status: code === "draft_conflict" ? 422 : 503,
      code,
      retryable: code === "finalization_unscheduled",
      committed: code === "finalization_unscheduled",
      existingEvent: {
        id: "event-1",
        name: "Created event",
        slug: "created-event",
      },
    })
  }

  it("rejects a stale empty submission envelope", async () => {
    draftSnapshot.getCurrentEnvelope = mock(() => ({
      ...eventEnvelope,
      state: { ...eventState, name: "" },
    }))

    await submitEditor()

    expect(await screen.findByText("Hackathon name is required")).toBeDefined()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("warns when only completed-draft cleanup fails", async () => {
    const originalWarn = console.warn
    const warn = mock(() => {})
    console.warn = warn
    clearResult = "cleanup_failed"

    try {
      await submitEditor()
      await waitFor(() => expect(replace).toHaveBeenCalledWith(
        "/e/created-event/manage",
      ))
      expect(warn).toHaveBeenCalledWith(
        "The completed draft could not be cleared from browser storage.",
      )
    } finally {
      console.warn = originalWarn
    }
  })

  it("opens committed finalization failures when completion storage is unavailable", async () => {
    preserveResult = "completion_failed"
    onSubmit.mockRejectedValueOnce(committedError("finalization_unscheduled"))

    await submitEditor()

    expect(await screen.findByText(/event was created.*opening it now/i)).toBeDefined()
    expect(replace).toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("opens committed finalization results without a rotated draft", async () => {
    preserveResult = "completed"
    onSubmit.mockRejectedValueOnce(committedError("finalization_unscheduled"))

    await submitEditor()

    expect(await screen.findByText(/event was created.*opening it now/i)).toBeDefined()
    expect(replace).toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("keeps a conflicting event visible when newer edits cannot be preserved", async () => {
    preserveResult = "preservation_failed"
    onSubmit.mockRejectedValueOnce(committedError("draft_conflict"))

    await submitEditor()

    expect(await screen.findByText(/open \/e\/created-event\/manage in another tab/i)).toBeDefined()
    expect(replace).not.toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("opens a conflicting event without a rotated draft", async () => {
    preserveResult = "completed"
    onSubmit.mockRejectedValueOnce(committedError("draft_conflict"))

    await submitEditor()

    expect(await screen.findByText(/event was already created.*opening it now/i)).toBeDefined()
    expect(replace).toHaveBeenCalledWith("/e/created-event/manage")
  })

  it("uses the plain conflict result when no event can be opened", async () => {
    preserveResult = "completed"
    onSubmit.mockRejectedValueOnce(new FetchResponseError({
      message: "This draft already created an event.",
      status: 422,
      code: "draft_conflict",
    }))

    await submitEditor()

    expect(await screen.findByText("This event was already created.")).toBeDefined()
    expect(replace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/e\//))
  })

  it("checks loading and every saved-draft state before creating", async () => {
    const view = renderEditor()
    await screen.findByText("Preview marker")
    clerkLoaded = false
    view.rerender(createElement(HackathonDraftEditor, {
      initialState: eventState,
      storageKey: "branch-test-draft",
      onSubmit,
    }))
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }))
    expect(await screen.findByText(/wait a moment while we restore your draft/i)).toBeDefined()

    clerkLoaded = true
    view.rerender(createElement(HackathonDraftEditor, {
      initialState: eventState,
      storageKey: "branch-test-draft",
      onSubmit,
    }))
    for (const [result, message] of [
      ["completed", /created in another tab/i],
      ["conflict", /review the newest draft/i],
      ["unavailable", /turn on browser storage/i],
    ] as const) {
      ensureResult = result
      fireEvent.click(screen.getByRole("button", { name: "Create Event" }))
      expect(await screen.findByText(message)).toBeDefined()
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("maps preview auth preparation and sign-in continuation states", async () => {
    clerkSignedIn = false
    renderEditor()
    await screen.findByText("Preview marker")
    expect(previewProps?.onAuthRequired).toBeDefined()

    for (const [result, message] of [
      ["completed", /created in another tab/i],
      ["conflict", /review the newest draft/i],
      ["unavailable", /turn on browser storage/i],
    ] as const) {
      ensureResult = result
      act(() => previewProps!.onAuthRequired!())
      expect(await screen.findByText(message)).toBeDefined()
    }

    ensureResult = "saved"
    act(() => previewProps!.onAuthRequired!())
    expect(await screen.findByTestId("sign-in")).toBeDefined()
    expect(signInProps).not.toBeNull()

    ensureResult = "saved"
    expect(signInProps!.beforeNavigate()).toBe(true)
    ensureResult = "conflict"
    expect(signInProps!.beforeNavigate()).toBe(true)
    ensureResult = "completed"
    expect(signInProps!.beforeNavigate()).toMatch(/created in another tab/i)
    ensureResult = "unavailable"
    expect(signInProps!.beforeNavigate()).toMatch(/couldn't save your draft/i)
  })

  it("maps every agent sign-in preparation state", async () => {
    clerkSignedIn = false
    renderEditor()
    await screen.findByText("Preview marker")
    expect(webMcpProps).not.toBeNull()

    for (const [result, message] of [
      ["completed", /created in another tab/i],
      ["conflict", /review the newest draft/i],
      ["unavailable", /turn on browser storage/i],
    ] as const) {
      ensureResult = result
      act(() => webMcpProps!.onOpenSignIn())
      expect(await screen.findByText(message)).toBeDefined()
    }

    ensureResult = "saved"
    act(() => webMcpProps!.onOpenSignIn())
    expect(await screen.findByTestId("sign-in")).toBeDefined()
  })

  it("automatically opens a completed event from the editor", async () => {
    draftSnapshot = {
      ...draftSnapshot,
      persistenceStatus: "completed",
      recentCompletedEventSlug: "completed-event",
    }
    renderEditor()
    await screen.findByText("Preview marker")

    expect(replace).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenLastCalledWith("/e/completed-event/manage")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("falls back safely when the source display URL is malformed", async () => {
    render(createElement(HackathonDraftEditor, {
      initialState: eventState,
      storageKey: "branch-test-draft",
      onSubmit,
      sourceUrl: "://not-a-url",
    }))

    expect(await screen.findByText("Preview marker")).toBeDefined()
  })
})
