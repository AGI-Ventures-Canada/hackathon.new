import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"
import { JudgeAssignmentControls, JudgeProjectAssignments, ManualJudgingAssignments } from "@/components/hackathon/judging/manual-judging-assignments"

const originalFetch = globalThis.fetch
const fetchMock = mock<typeof fetch>()
const project = { submissionId: "project", projectTitle: "Smart garden", teamId: null, teamName: null, isAssigned: false, isComplete: false, isOwnTeam: false, canAssign: true, prizeNames: ["Best overall"], blockedReason: null }
const response = (submissions: unknown[]) => new Response(JSON.stringify({ submissions }), { status: 200 })

describe("manual judging assignments", () => {
  beforeEach(() => { cleanup(); resetComponentMocks(); fetchMock.mockReset(); globalThis.fetch = fetchMock })
  afterEach(() => { cleanup(); globalThis.fetch = originalFetch })

  it("explains when no accepted judges are available", () => {
    render(<ManualJudgingAssignments hackathonId="event" judges={[]} />)
    expect(screen.getByText(/Once a judge accepts/)).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows project loading placeholders", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<JudgeProjectAssignments hackathonId="event" judgeParticipantId="judge" />)
    expect(screen.getByLabelText("Loading projects")).toBeDefined()
  })

  it("adds a project optimistically and rolls back a failed change", async () => {
    let fail: ((value: Response) => void) | undefined
    fetchMock.mockResolvedValueOnce(response([project]))
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { fail = resolve }))
    render(<JudgeProjectAssignments hackathonId="event" judgeParticipantId="judge" />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Assign Smart garden" })).toBeDefined())
    fireEvent.click(screen.getByRole("button", { name: "Assign Smart garden" }))
    expect(screen.getByRole("button", { name: "Remove Smart garden" })).toBeDefined()
    fail?.(new Response(JSON.stringify({ error: "This prize changed" }), { status: 409 }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This prize changed"))
    expect(screen.getByRole("button", { name: "Assign Smart garden" })).toBeDefined()
  })

  it("keeps submitted reviews and blocks projects outside the judge's scope", async () => {
    fetchMock.mockResolvedValueOnce(response([{ ...project, isAssigned: true, isComplete: true, blockedReason: "Review submitted" }, { ...project, submissionId: "other", projectTitle: "Other project", canAssign: false, blockedReason: "Outside this judge's prizes or rooms" }]))
    render(<JudgeProjectAssignments hackathonId="event" judgeParticipantId="judge" />)
    await waitFor(() => expect(screen.getAllByText("Review submitted").length).toBeGreaterThan(0))
    expect(screen.queryByRole("button", { name: "Remove Smart garden" })).toBeNull()
    expect((screen.getByRole("button", { name: "Assign Other project" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("Find a project"), { target: { value: "Other project" } })
    expect(screen.queryByText("Smart garden")).toBeNull()
  })

  it("uses the selected advanced prize for project reads and assignments", async () => {
    fetchMock.mockResolvedValueOnce(response([project])).mockResolvedValueOnce(new Response("{}", { status: 200 }))
    render(<JudgeProjectAssignments hackathonId="event" judgeParticipantId="judge" prizeId="gate" />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Assign Smart garden" })).toBeDefined())
    expect(fetchMock.mock.calls[0][0]).toContain("/submissions?prizeId=gate")
    fireEvent.click(screen.getByRole("button", { name: "Assign Smart garden" }))
    await waitFor(() => expect(fetchMock.mock.calls[1][0]).toContain("/submissions/project?prizeId=gate"))
  })

  it("makes prize and room controls reachable while locking submitted scope", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ options: { version: "v1", prizeScope: "selected", prizeIds: ["gate"], roomIds: ["room"], prizes: [{ id: "gate", name: "Working demo", style: "gate_check" }], rooms: [{ id: "room", name: "Main hall" }], locked: true } }), { status: 200 })).mockResolvedValueOnce(response([]))
    render(<JudgeAssignmentControls hackathonId="event" judgeParticipantId="judge" />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit prizes and rooms" })).toBeDefined())
    fireEvent.click(screen.getByRole("button", { name: "Edit prizes and rooms" }))
    expect(screen.getByRole("checkbox", { name: "Working demo" })).toBeDefined()
    expect(screen.getByText("Main hall")).toBeDefined()
    expect((screen.getByRole("button", { name: "Save prizes and rooms" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
