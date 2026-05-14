import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../../lib/component-mocks"
import type { Challenge } from "@/lib/services/challenges"

const mockRefresh = mock(() => {})
const mockFetch = mock(() =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        challenge: {
          id: "c1",
          hackathonId: "h1",
          title: "X",
          description: null,
          resources: [],
          sortOrder: 0,
          createdAt: "",
          updatedAt: "",
          releasedAt: null,
          scheduledReleaseAt: null,
          releaseLinkedTo: "event_start",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  ),
)

let pickerOnChange: ((value: Date | null) => void) | null = null
mock.module("@/components/ui/date-time-picker", () => ({
  DateTimePicker: ({ value, onChange, id }: { value: Date | null; onChange: (v: Date | null) => void; id?: string }) => {
    pickerOnChange = onChange
    return (
      <button type="button" data-testid="date-time-picker" id={id}>
        {value ? value.toISOString() : "no-date"}
      </button>
    )
  },
}))

let selectOnValueChange: ((value: string) => void) | null = null
let selectCurrentValue: string | null = null
mock.module("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange?: (v: string) => void
    children: React.ReactNode
  }) => {
    selectOnValueChange = onValueChange ?? null
    selectCurrentValue = value
    return <div data-testid="release-mode-select">{children}</div>
  },
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <div data-testid="select-trigger" id={id} aria-label="When should this challenge unlock?">
      {children}
    </div>
  ),
  SelectValue: () => <span data-testid="select-value">{selectCurrentValue}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    children,
    value,
    disabled,
  }: {
    children: React.ReactNode
    value: string
    disabled?: boolean
  }) => (
    <button
      type="button"
      role="option"
      aria-label={typeof children === "string" ? children : undefined}
      aria-selected={selectCurrentValue === value}
      data-disabled={disabled ? "true" : undefined}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        selectOnValueChange?.(value)
      }}
    >
      {children}
    </button>
  ),
}))

const { ChallengeEditorDialog } = await import("@/components/hackathon/manage/challenge-editor-dialog")

const eventStartIso = "2030-06-01T13:00:00.000Z"
const eventEndIso = "2030-06-02T22:00:00.000Z"

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "c-existing",
    hackathonId: "h1",
    title: "Existing",
    description: null,
    resources: [],
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    releasedAt: null,
    scheduledReleaseAt: null,
    releaseLinkedTo: "event_start",
    ...overrides,
  }
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof ChallengeEditorDialog>> = {}) {
  return render(
    <ChallengeEditorDialog
      open
      onOpenChange={() => {}}
      hackathonId="h1"
      challenge={null}
      onSaved={() => {}}
      hackathonStartsAt={eventStartIso}
      hackathonEndsAt={eventEndIso}
      hackathonStatus="draft"
      {...overrides}
    />
  )
}

beforeEach(() => {
  resetComponentMocks()
  setRouter({ refresh: mockRefresh })
  mockRefresh.mockClear()
  mockFetch.mockClear()
  pickerOnChange = null
  selectOnValueChange = null
  selectCurrentValue = null
  mockFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          challenge: {
            id: "c1",
            hackathonId: "h1",
            title: "X",
            description: null,
            resources: [],
            sortOrder: 0,
            createdAt: "",
            updatedAt: "",
            releasedAt: null,
            scheduledReleaseAt: null,
            releaseLinkedTo: "event_start",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  )
  globalThis.fetch = mockFetch as typeof fetch
})

afterEach(() => {
  cleanup()
})

function getOption(container: HTMLElement, label: string): HTMLButtonElement {
  return within(container).getByRole("option", { name: label }) as HTMLButtonElement
}

function selectOption(container: HTMLElement, label: string) {
  fireEvent.click(getOption(container, label))
}

describe("ChallengeEditorDialog release timing", () => {
  it("defaults to 'live' for a brand new challenge", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release when the event goes live").getAttribute("aria-selected")).toBe("true")
  })

  it("hides the release section when the challenge has already been released", () => {
    renderDialog({
      challenge: makeChallenge({ releasedAt: "2026-05-14T00:00:00Z" }),
    })
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByRole("option", { name: "Release when the event goes live" })).toBeNull()
  })

  it("shows the date picker and bound message when custom is selected", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    selectOption(dialog, "Release at a custom time")
    expect(within(dialog).getByText("Release time")).toBeDefined()
    expect(within(dialog).getByText(/Pick any time between/)).toBeDefined()
  })

  it("selecting publish deselects live", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    selectOption(dialog, "Release when you publish the event")
    expect(getOption(dialog, "Release when the event goes live").getAttribute("aria-selected")).toBe("false")
    expect(getOption(dialog, "Release when you publish the event").getAttribute("aria-selected")).toBe("true")
  })

  it("disables save when custom is selected without a time", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "My challenge" } })
    selectOption(dialog, "Release at a custom time")
    const submit = within(dialog).getByRole("button", { name: /Save challenge/ })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it("starts in custom mode when the existing challenge has a scheduled custom time", () => {
    renderDialog({
      challenge: makeChallenge({
        releaseLinkedTo: null,
        scheduledReleaseAt: "2030-06-01T18:00:00.000Z",
      }),
    })
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release at a custom time").getAttribute("aria-selected")).toBe("true")
    expect(within(dialog).getByText("Release time")).toBeDefined()
  })

  it("starts with publish selected when the existing challenge is linked to event_publish", () => {
    renderDialog({
      challenge: makeChallenge({ releaseLinkedTo: "event_publish", scheduledReleaseAt: null }),
    })
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release when you publish the event").getAttribute("aria-selected")).toBe("true")
  })

  it("shows draft-specific copy for the publish option when event is in draft", () => {
    renderDialog({ hackathonStatus: "draft" })
    const dialog = screen.getByRole("dialog")
    selectOption(dialog, "Release when you publish the event")
    expect(within(dialog).getByText("Unlocks as soon as you publish the event.")).toBeDefined()
  })

  it("shows already-published copy when event is published", () => {
    renderDialog({ hackathonStatus: "published" })
    const dialog = screen.getByRole("dialog")
    selectOption(dialog, "Release when you publish the event")
    expect(
      within(dialog).getByText("Your event is already published — saving will unlock this challenge right away."),
    ).toBeDefined()
  })

  it("disables the publish option when event is past publishing", () => {
    renderDialog({ hackathonStatus: "active" })
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release when you publish the event").disabled).toBe(true)
  })

  it("keeps the publish option enabled when status is registration_open", () => {
    renderDialog({ hackathonStatus: "registration_open" })
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release when you publish the event").disabled).toBe(false)
  })

  it("blocks save when publish is already selected on a past-publish event", () => {
    renderDialog({
      hackathonStatus: "active",
      challenge: makeChallenge({ releaseLinkedTo: "event_publish" }),
    })
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "My challenge" } })
    const submit = within(dialog).getByRole("button", { name: /Save challenge/ })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it("submits a single POST with releaseLinkedTo='event_start' when creating with 'live' selected", async () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const url = mockFetch.mock.calls[0][0] as string
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(url).toBe("/api/dashboard/hackathons/h1/challenges")
    expect(init.method).toBe("POST")
    const body = JSON.parse(init.body as string)
    expect(body.releaseLinkedTo).toBe("event_start")
    expect(body.scheduledReleaseAt).toBeNull()
  })

  it("submits with releaseLinkedTo='event_publish' when publish is selected", async () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    selectOption(dialog, "Release when you publish the event")
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.releaseLinkedTo).toBe("event_publish")
    expect(body.scheduledReleaseAt).toBeNull()
  })

  it("submits with scheduledReleaseAt and releaseLinkedTo=null when custom is selected with a time", async () => {
    const customIso = "2030-06-02T10:30:00.000Z"
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    selectOption(dialog, "Release at a custom time")

    expect(pickerOnChange).not.toBeNull()
    act(() => {
      pickerOnChange!(new Date(customIso))
    })

    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.releaseLinkedTo).toBeNull()
    expect(body.scheduledReleaseAt).toBe(customIso)
  })

  it("PUTs to the per-challenge URL when editing an existing challenge", async () => {
    renderDialog({ challenge: makeChallenge({ id: "c-existing" }) })
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Renamed" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const url = mockFetch.mock.calls[0][0] as string
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(url).toBe("/api/dashboard/hackathons/h1/challenges/c-existing")
    expect(init.method).toBe("PUT")
  })

  it("omits release fields from the body when the challenge is already released", async () => {
    renderDialog({
      challenge: makeChallenge({ id: "c-existing", releasedAt: "2026-05-14T00:00:00Z" }),
    })
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Renamed" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect("releaseLinkedTo" in body).toBe(false)
    expect("scheduledReleaseAt" in body).toBe(false)
  })
})
