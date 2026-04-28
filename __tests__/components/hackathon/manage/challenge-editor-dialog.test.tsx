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

describe("ChallengeEditorDialog release timing", () => {
  it("shows the auto-release toggle on by default when item is linked to event start", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Release when the event goes live")).toBeDefined()
    const liveToggle = within(dialog).getByLabelText("Release when the event goes live")
    const publishToggle = within(dialog).getByLabelText("Release when you publish the event")
    expect(liveToggle.getAttribute("aria-checked")).toBe("true")
    expect(publishToggle.getAttribute("aria-checked")).toBe("false")
    expect(within(dialog).queryByLabelText("Release time")).toBeNull()
  })

  it("hides the release section when challenges are already released", () => {
    renderDialog({ alreadyReleased: true })
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByText("Release when the event goes live")).toBeNull()
  })

  it("shows the date picker and bound message when both toggles are off", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.click(within(dialog).getByLabelText("Release when the event goes live"))
    expect(within(dialog).getByText("Release time")).toBeDefined()
    expect(within(dialog).getByText(/Pick any time between/)).toBeDefined()
  })

  it("turning on publish toggle turns off live toggle", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    const liveToggle = within(dialog).getByLabelText("Release when the event goes live")
    const publishToggle = within(dialog).getByLabelText("Release when you publish the event")
    expect(liveToggle.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(publishToggle)
    expect(liveToggle.getAttribute("aria-checked")).toBe("false")
    expect(publishToggle.getAttribute("aria-checked")).toBe("true")
    expect(within(dialog).queryByText("Release time")).toBeNull()
  })

  it("disables save when both toggles are off without a custom time selected", () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "My challenge" } })
    fireEvent.click(within(dialog).getByLabelText("Release when the event goes live"))
    const submit = within(dialog).getByRole("button", { name: /Save challenge/ })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it("starts with both toggles off when item is unlinked", () => {
    renderDialog({
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: null,
        starts_at: "2030-06-01T18:00:00.000Z",
      },
    })
    const dialog = screen.getByRole("dialog")
    const liveToggle = within(dialog).getByLabelText("Release when the event goes live")
    const publishToggle = within(dialog).getByLabelText("Release when you publish the event")
    expect(liveToggle.getAttribute("aria-checked")).toBe("false")
    expect(publishToggle.getAttribute("aria-checked")).toBe("false")
    expect(within(dialog).getByText("Release time")).toBeDefined()
  })

  it("starts with publish toggle on when item is linked to event_publish", () => {
    renderDialog({
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: "event_publish",
      },
    })
    const dialog = screen.getByRole("dialog")
    const liveToggle = within(dialog).getByLabelText("Release when the event goes live")
    const publishToggle = within(dialog).getByLabelText("Release when you publish the event")
    expect(liveToggle.getAttribute("aria-checked")).toBe("false")
    expect(publishToggle.getAttribute("aria-checked")).toBe("true")
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

  it("saves the challenge AND patches the schedule item when toggle changes from custom to live", async () => {
    renderDialog({
      releaseScheduleItem: {
        ...baseTriggerItem,
        linked_to: null,
        starts_at: "2030-06-01T18:00:00.000Z",
      },
    })
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    fireEvent.click(within(dialog).getByLabelText("Release when the event goes live"))
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

  it("saves the challenge AND patches the schedule item with event_publish when publish toggle turned on", async () => {
    renderDialog()
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    fireEvent.click(within(dialog).getByLabelText("Release when you publish the event"))
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    const patchUrl = mockFetch.mock.calls[0][0] as string
    const patchInit = mockFetch.mock.calls[0][1] as RequestInit
    expect(patchUrl).toBe("/api/dashboard/hackathons/h1/schedule/schedule-1")
    expect(patchInit.method).toBe("PATCH")
    const body = JSON.parse(patchInit.body as string)
    expect(body).toEqual({ startsAt: eventStartIso, linkedTo: "event_publish" })
  })

  it("hides the release section and saves only the challenge when releaseScheduleItem is null", async () => {
    renderDialog({ releaseScheduleItem: null })
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByText("Release when the event goes live")).toBeNull()

    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Theme" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Save challenge/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toBe("/api/dashboard/hackathons/h1/challenges")
  })
})
