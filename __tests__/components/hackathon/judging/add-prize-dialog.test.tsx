import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
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
    localStorage.clear()
    resetComponentMocks()
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
      prize: { id: "created-prize", name: "Best overall", judging_style: "weighted_score", description: null, value: "$500", type: "score", round_id: null },
    }), { status: 200 }))) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("starts with prize details, focused name, and a simple next step", () => {
    render(<AddPrizeDialog hackathonId="h1" open onOpenChange={() => {}} rounds={STABLE_ROUNDS} />)

    expect(document.activeElement).toBe(screen.getByLabelText("Name"))
    expect(screen.getByLabelText("Reward")).toBeTruthy()
    expect(screen.getByText("Score projects")).toBeTruthy()
    expect(screen.getByText("Save this prize, then set up the scorecard.")).toBeTruthy()
    expect(screen.queryByText("Weighted scoring")).toBeNull()
    expect(screen.queryByText(/Bonus categories for this prize/)).toBeNull()
    expect(screen.queryByText(/Score categories 0%/)).toBeNull()
    expect(screen.getByRole("button", { name: "More judging options" }).getAttribute("aria-expanded")).toBe("false")
  })

  it("saves the first prize with an unfinished scorecard and closes immediately", async () => {
    const onOpenChange = mock(() => {})
    render(<AddPrizeDialog hackathonId="h1" open onOpenChange={onOpenChange} rounds={STABLE_ROUNDS} />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Best overall" } })
    fireEvent.change(screen.getByLabelText("Reward"), { target: { value: "$500" } })

    fireEvent.click(screen.getByRole("button", { name: "Create Prize" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
    const [url, init] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/dashboard/hackathons/h1/prizes")
    expect(JSON.parse(init.body as string)).toMatchObject({ name: "Best overall", value: "$500", judgingStyle: "weighted_score", criteria: [] })
  })

  it("keeps bonus weights and all judging methods in the expanded options", () => {
    render(<AddPrizeDialog hackathonId="h1" open onOpenChange={() => {}} rounds={STABLE_ROUNDS} coreCriteriaCount={4} coreWeightSum={100} />)
    expect(screen.getByText("Judges use the shared scorecard for this prize.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "More judging options" }))
    fireEvent.click(screen.getByRole("button", { name: "Add bonus category" }))
    fireEvent.change(screen.getByLabelText("Weight for bonus category 1"), { target: { value: "20" } })
    expect(screen.getByText(/Score categories 100%.*120%/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Create Prize" }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText("Lowest score for bonus category 1") as HTMLInputElement).value).toBe("0")

    fireEvent.click(screen.getByRole("button", { name: "Change judging method" }))
    for (const name of [/Sort into groups/, /Pass or fail/, /Everyone votes/, /Judge's picks/, /Score projects/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole("button", { name: /Pass or fail/ }))
    expect(screen.getByText("What should each project pass?")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Safety prize" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Prize" }))
    expect(screen.getByText("Add at least one check")).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("reveals an invalid bonus field when saving collapsed options", () => {
    render(<AddPrizeDialog hackathonId="h1" open onOpenChange={() => {}} rounds={STABLE_ROUNDS} />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bonus prize" } })
    fireEvent.click(screen.getByRole("button", { name: "More judging options" }))
    fireEvent.click(screen.getByRole("button", { name: "Add bonus category" }))
    fireEvent.change(screen.getByPlaceholderText("e.g. Use of sponsor API"), { target: { value: "API use" } })
    fireEvent.change(screen.getByLabelText("Lowest score for bonus category 1"), { target: { value: "11" } })
    fireEvent.click(screen.getByRole("button", { name: "More judging options" }))

    fireEvent.click(screen.getByRole("button", { name: "Create Prize" }))

    expect(screen.getByRole("button", { name: "More judging options" }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(/min must be 0 or higher and less than max/)).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
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
