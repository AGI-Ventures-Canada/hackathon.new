import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../../lib/component-mocks"

const mockRefresh = mock(() => {})
const mockFetch = mock(() =>
  Promise.resolve(
    new Response(JSON.stringify({ challenge: { id: "c1", hackathonId: "h1", title: "X", description: null, resources: [], sortOrder: 0, createdAt: "", updatedAt: "" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
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
    <div data-testid="select-trigger" id={id} aria-label="When should challenges unlock?">
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

const baseTriggerItem = {
  id: "schedule-1",
  hackathon_id: "h1",
  title: "Challenge Release",
  description: null,
  starts_at: eventStartIso,
  ends_at: null,
  location: null,
  sort_order: 0,
  trigger_type: "challenge_release" as const,
  linked_to: "event_start" as const,
  created_at: "",
  updated_at: "",
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof ChallengeEditorDialog>> = {}) {
  return render(
    <ChallengeEditorDialog
      open
      onOpenChange={() => {}}
      hackathonId="h1"
      challenge={null}
      onSaved={() => {}}
      releaseScheduleItem={baseTriggerItem}
      hackathonStartsAt={eventStartIso}
      hackathonEndsAt={eventEndIso}
      hackathonStatus="draft"
      alreadyReleased={false}
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
      new Response(JSON.stringify({ challenge: { id: "c1", hackathonId: "h1", title: "X", description: null, resources: [], sortOrder: 0, createdAt: "", updatedAt: "" } }), {
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

function getOption(container: HTMLElement, label: string): HTMLButtonElement {
  return within(container).getByRole("option", { name: label }) as HTMLButtonElement
}

function selectOption(container: HTMLElement, label: string) {
  fireEvent.click(getOption(container, label))
}

describe("ChallengeEditorDialog release timing", () => {
  it("selects the live option by default when item is linked to event start", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release when the event goes live").getAttribute("aria-selected")).toBe("true")
    expect(getOption(dialog, "Release when you publish the event").getAttribute("aria-selected")).toBe("false")
    expect(getOption(dialog, "Release at a custom time").getAttribute("aria-selected")).toBe("false")
    expect(within(dialog).queryByText("Release time")).toBeNull()
  })

  it("hides the release section when challenges are already released", () => {
    renderDialog({ alreadyReleased: true })
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
    expect(getOption(dialog, "Release when the event goes live").getAttribute("aria-selected")).toBe("true")
    selectOption(dialog, "Release when you publish the event")
    expect(getOption(dialog, "Release when the event goes live").getAttribute("aria-selected")).toBe("false")
    expect(getOption(dialog, "Release when you publish the event").getAttribute("aria-selected")).toBe("true")
    expect(within(dialog).queryByText("Release time")).toBeNull()
  })

  it("disables save when custom is selected without a time", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "My challenge" } })
    selectOption(dialog, "Release at a custom time")
    const submit = within(dialog).getByRole("button", { name: /Save challenge/ })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it("starts in custom mode when item is unlinked", () => {
    renderDialog({
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: null,
        starts_at: "2030-06-01T18:00:00.000Z",
      },
    })
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release when the event goes live").getAttribute("aria-selected")).toBe("false")
    expect(getOption(dialog, "Release when you publish the event").getAttribute("aria-selected")).toBe("false")
    expect(getOption(dialog, "Release at a custom time").getAttribute("aria-selected")).toBe("true")
    expect(within(dialog).getByText("Release time")).toBeDefined()
  })

  it("shows draft-specific copy for the publish option when event is in draft", () => {
    renderDialog({ hackathonStatus: "draft" })
    const dialog = screen.getByRole("dialog")
    selectOption(dialog, "Release when you publish the event")
    expect(within(dialog).getByText("Challenges unlock as soon as you publish the event.")).toBeDefined()
  })

  it("shows already-published copy for the publish option when event is published", () => {
    renderDialog({ hackathonStatus: "published" })
    const dialog = screen.getByRole("dialog")
    selectOption(dialog, "Release when you publish the event")
    expect(
      within(dialog).getByText("Your event is already published — saving will unlock challenges right away."),
    ).toBeDefined()
  })

  it("shows past-publish copy when the publish option is already selected on a past-publish event", () => {
    renderDialog({
      hackathonStatus: "active",
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: "event_publish",
      },
    })
    const dialog = screen.getByRole("dialog")
    expect(
      within(dialog).getByText("Your event is past publishing — pick another option to auto-release."),
    ).toBeDefined()
  })

  it("keeps the publish option enabled when status is registration_open", () => {
    renderDialog({ hackathonStatus: "registration_open" })
    const dialog = screen.getByRole("dialog")
    const publishOption = getOption(dialog, "Release when you publish the event")
    expect(publishOption.disabled).toBe(false)
    selectOption(dialog, "Release when you publish the event")
    expect(within(dialog).getByText("Challenges unlock as soon as you publish the event.")).toBeDefined()
  })

  it("disables the publish option when event is past publishing", () => {
    renderDialog({ hackathonStatus: "active" })
    const dialog = screen.getByRole("dialog")
    const publishOption = getOption(dialog, "Release when you publish the event")
    expect(publishOption.disabled).toBe(true)
  })

  it("blocks save when publish is selected on a past-publish event", () => {
    renderDialog({
      hackathonStatus: "active",
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: "event_publish",
      },
    })
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "My challenge" } })
    const submit = within(dialog).getByRole("button", { name: /Save challenge/ })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it("starts with publish selected when item is linked to event_publish", () => {
    renderDialog({
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: "event_publish",
      },
    })
    const dialog = screen.getByRole("dialog")
    expect(getOption(dialog, "Release when the event goes live").getAttribute("aria-selected")).toBe("false")
    expect(getOption(dialog, "Release when you publish the event").getAttribute("aria-selected")).toBe("true")
  })

  it("saves only the challenge when release timing is unchanged", async () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toBe("/api/dashboard/hackathons/h1/challenges")
  })

  it("saves the challenge AND patches the schedule item when the custom time changes", async () => {
    const initialCustomIso = "2030-06-01T18:00:00.000Z"
    const newCustomIso = "2030-06-02T10:30:00.000Z"
    renderDialog({
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: null,
        starts_at: initialCustomIso,
      },
    })
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })

    expect(pickerOnChange).not.toBeNull()
    act(() => {
      pickerOnChange!(new Date(newCustomIso))
    })

    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    const patchUrl = mockFetch.mock.calls[0][0] as string
    const patchInit = mockFetch.mock.calls[0][1] as RequestInit
    const challengeUrl = mockFetch.mock.calls[1][0] as string
    expect(patchUrl).toBe("/api/dashboard/hackathons/h1/schedule/schedule-1")
    expect(patchInit.method).toBe("PATCH")
    expect(challengeUrl).toBe("/api/dashboard/hackathons/h1/challenges")
    const body = JSON.parse(patchInit.body as string)
    expect(body).toEqual({ startsAt: newCustomIso, linkedTo: null })
  })

  it("saves the challenge AND patches the schedule item when changing from custom to live", async () => {
    renderDialog({
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: null,
        starts_at: "2030-06-01T18:00:00.000Z",
      },
    })
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    selectOption(dialog, "Release when the event goes live")
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    const patchUrl = mockFetch.mock.calls[0][0] as string
    const patchInit = mockFetch.mock.calls[0][1] as RequestInit
    const challengeUrl = mockFetch.mock.calls[1][0] as string
    expect(patchUrl).toBe("/api/dashboard/hackathons/h1/schedule/schedule-1")
    expect(patchInit.method).toBe("PATCH")
    expect(challengeUrl).toBe("/api/dashboard/hackathons/h1/challenges")
    const body = JSON.parse(patchInit.body as string)
    expect(body).toEqual({ startsAt: eventStartIso, linkedTo: "event_start" })
  })

  it("saves the challenge AND patches the schedule item with event_publish (no startsAt) when publish is selected", async () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    selectOption(dialog, "Release when you publish the event")
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    const patchUrl = mockFetch.mock.calls[0][0] as string
    const patchInit = mockFetch.mock.calls[0][1] as RequestInit
    expect(patchUrl).toBe("/api/dashboard/hackathons/h1/schedule/schedule-1")
    expect(patchInit.method).toBe("PATCH")
    const body = JSON.parse(patchInit.body as string)
    expect(body).toEqual({ linkedTo: "event_publish" })
  })

  it("hides the release section and saves only the challenge when releaseScheduleItem is null", async () => {
    renderDialog({ releaseScheduleItem: null })
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByRole("option", { name: "Release when the event goes live" })).toBeNull()

    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toBe("/api/dashboard/hackathons/h1/challenges")
  })
})
