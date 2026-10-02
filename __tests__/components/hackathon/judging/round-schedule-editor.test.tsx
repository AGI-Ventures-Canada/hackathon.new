import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"
import { RoundScheduleEditor } from "@/components/hackathon/judging/round-schedule-editor"
import type { JudgingSetup } from "@/lib/judging/setup"
const originalFetch = globalThis.fetch
const fetchMock = mock<typeof fetch>()
const setup = {
  id: "schedule-event",
  submissionDeadline: null,
  settings: {
    timezone: "America/Toronto",
    opensAt: "2026-09-06T14:00:00Z",
    closesAt: "2026-09-06T16:00:00Z",
  },
} as JudgingSetup
const round = {
  id: "round",
  name: "Final review",
  opensAt: null,
  closesAt: null,
} as JudgingSetup["rounds"][number]
describe("round judging dates", () => {
  beforeEach(() => {
    cleanup()
    resetComponentMocks()
    localStorage.clear()
    fetchMock.mockReset()
    globalThis.fetch = fetchMock
  })
  afterEach(() => {
    cleanup()
    globalThis.fetch = originalFetch
  })
  it("saves the selected timezone's instants as a pair", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ round })))
    const saved = mock(() => {})
    render(<RoundScheduleEditor setup={setup} round={round} onSaved={saved} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Use the event's judging dates" }))
    expect((screen.getByLabelText("Judging opens") as HTMLInputElement).value).toBe(
      "2026-09-06T10:00",
    )
    fireEvent.change(screen.getByLabelText("Judging deadline"), {
      target: { value: "2026-09-06T13:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save round dates" }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      opensAt: "2026-09-06T14:00:00.000Z",
      closesAt: "2026-09-06T17:00:00.000Z",
    })
  })
  it("preserves inheritance with both dates null", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ round })))
    render(<RoundScheduleEditor setup={setup} round={round} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Save round dates" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      opensAt: null,
      closesAt: null,
    })
  })
})
