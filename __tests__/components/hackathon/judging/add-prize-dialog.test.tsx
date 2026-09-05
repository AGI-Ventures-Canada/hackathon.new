import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"
import type { RoundData } from "@/components/hackathon/judging/rounds-types"

const originalFetch = globalThis.fetch
const STABLE_ROUNDS: RoundData[] = []
const STABLE_EXISTING = [{ id: "p1", name: "Grand Prize" }]

const { AddPrizeDialog } = await import(
  "@/components/hackathon/judging/add-prize-dialog"
)

function openToDetailsStep() {
  expect(screen.getByLabelText("Name")).toBeTruthy()
}

describe("AddPrizeDialog duplicate detection", () => {
  beforeEach(() => {
    cleanup()
    resetComponentMocks()
    globalThis.fetch = mock(() => Promise.resolve(new Response("{}", { status: 200 }))) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("shows an inline hint when the typed name matches an existing prize (case-insensitive)", () => {
    render(
      <AddPrizeDialog
        hackathonId="h1"
        open={true}
        onOpenChange={() => {}}
        existingPrizes={STABLE_EXISTING} rounds={STABLE_ROUNDS}
      />,
    )

    openToDetailsStep()

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: "  grand prize  " } })

    expect(
      screen.getByText(/You already have a prize called/i).textContent,
    ).toContain("Grand Prize")
  })

  it("does not show the hint when no existing prize matches", () => {
    render(
      <AddPrizeDialog
        hackathonId="h1"
        open={true}
        onOpenChange={() => {}}
        existingPrizes={STABLE_EXISTING} rounds={STABLE_ROUNDS}
      />,
    )

    openToDetailsStep()

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: "Other Prize" } })

    expect(screen.queryByText(/You already have a prize called/i)).toBeNull()
  })

  it("does not show the hint for an empty/whitespace-only name", () => {
    render(
      <AddPrizeDialog
        hackathonId="h1"
        open={true}
        onOpenChange={() => {}}
        existingPrizes={STABLE_EXISTING} rounds={STABLE_ROUNDS}
      />,
    )

    openToDetailsStep()

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: "   " } })

    expect(screen.queryByText(/You already have a prize called/i)).toBeNull()
  })

  it("calls onEditExisting with the matched id and closes the dialog when 'Edit it instead' is clicked", () => {
    const onEditExisting = mock(() => {})
    const onOpenChange = mock(() => {})

    render(
      <AddPrizeDialog
        hackathonId="h1"
        open={true}
        onOpenChange={onOpenChange}
        existingPrizes={STABLE_EXISTING} rounds={STABLE_ROUNDS}
        onEditExisting={onEditExisting}
      />,
    )

    openToDetailsStep()

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Grand Prize" },
    })

    fireEvent.click(screen.getByRole("button", { name: /Edit it instead/i }))

    expect(onEditExisting).toHaveBeenCalledWith("p1")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("omits the 'Edit it instead' button when no onEditExisting handler is supplied", () => {
    render(
      <AddPrizeDialog
        hackathonId="h1"
        open={true}
        onOpenChange={() => {}}
        existingPrizes={STABLE_EXISTING} rounds={STABLE_ROUNDS}
      />,
    )

    openToDetailsStep()

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Grand Prize" },
    })

    expect(screen.getByText(/You already have a prize called/i)).toBeDefined()
    expect(screen.queryByRole("button", { name: /Edit it instead/i })).toBeNull()
  })
})
