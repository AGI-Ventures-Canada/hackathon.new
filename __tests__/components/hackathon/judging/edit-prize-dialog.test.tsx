import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"
import type { EditablePrize } from "@/components/hackathon/judging/edit-prize-dialog"

const originalFetch = globalThis.fetch
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = async () =>
  new Response("{}", { status: 200 })

const { EditPrizeDialog } = await import(
  "@/components/hackathon/judging/edit-prize-dialog"
)

const UNCONFIGURED_PRIZE: EditablePrize = {
  id: "prize-1",
  name: "Imported Prize",
  description: "From Luma",
  value: "$500",
  judgingStyle: null,
  maxPicks: null,
  criteria: null,
  buckets: null,
}

const JUDGES_PICK_PRIZE: EditablePrize = {
  ...UNCONFIGURED_PRIZE,
  judgingStyle: "judges_pick",
  maxPicks: 3,
}

describe("EditPrizeDialog null-style picker", () => {
  beforeEach(() => {
    cleanup()
    resetComponentMocks()
    fetchImpl = async () =>
      new Response(JSON.stringify({ prize: { id: "prize-1" } }), { status: 200 })
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
      fetchImpl(String(url), init)) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("shows the style picker when the prize has no judging style", () => {
    render(
      <EditPrizeDialog
        hackathonId="h1"
        prize={UNCONFIGURED_PRIZE}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText("How should judges score this prize?")).toBeDefined()
    expect(screen.getByRole("button", { name: /Sort into groups/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /Pass or fail/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /Everyone votes/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /Judge's picks/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /Weighted scoring/i })).toBeDefined()
  })

  it("hides the picker and shows bucket inputs after picking 'Sort into groups'", () => {
    render(
      <EditPrizeDialog
        hackathonId="h1"
        prize={UNCONFIGURED_PRIZE}
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Sort into groups/i }))

    expect(screen.queryByText("How should judges score this prize?")).toBeNull()
    expect(screen.getByText("Sort groups")).toBeDefined()
    expect(screen.getAllByPlaceholderText(/Group name/i).length).toBeGreaterThanOrEqual(2)
  })

  it("sends judgingStyle and buckets in the PATCH body when saving a newly-picked style", async () => {
    let capturedBody: Record<string, unknown> | null = null
    fetchImpl = async (_url, init) => {
      if (init?.method === "PATCH" && init.body) {
        capturedBody = JSON.parse(String(init.body))
      }
      return new Response(JSON.stringify({ prize: { id: "prize-1" } }), { status: 200 })
    }

    render(
      <EditPrizeDialog
        hackathonId="h1"
        prize={UNCONFIGURED_PRIZE}
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Sort into groups/i }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })

    expect(capturedBody?.judgingStyle).toBe("bucket_sort")
    expect(Array.isArray(capturedBody?.buckets)).toBe(true)
    expect((capturedBody?.buckets as unknown[]).length).toBeGreaterThanOrEqual(2)
  })

  it("does not show the picker when the prize already has a judging style", () => {
    render(
      <EditPrizeDialog
        hackathonId="h1"
        prize={JUDGES_PICK_PRIZE}
        onClose={() => {}}
      />,
    )

    expect(screen.queryByText("How should judges score this prize?")).toBeNull()
    expect(screen.getByLabelText(/How many can each judge pick/i)).toBeDefined()
  })

  it("hides the picker after picking 'Everyone votes' without showing style-specific inputs", () => {
    render(
      <EditPrizeDialog
        hackathonId="h1"
        prize={UNCONFIGURED_PRIZE}
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Everyone votes/i }))

    expect(screen.queryByText("How should judges score this prize?")).toBeNull()
    expect(screen.queryByText("Sort groups")).toBeNull()
    expect(screen.queryByLabelText(/How many can each judge pick/i)).toBeNull()
  })

  it("sends judgingStyle=crowd_vote with no criteria or buckets in the PATCH body", async () => {
    let capturedBody: Record<string, unknown> | null = null
    fetchImpl = async (_url, init) => {
      if (init?.method === "PATCH" && init.body) {
        capturedBody = JSON.parse(String(init.body))
      }
      return new Response(JSON.stringify({ prize: { id: "prize-1" } }), { status: 200 })
    }

    render(
      <EditPrizeDialog
        hackathonId="h1"
        prize={UNCONFIGURED_PRIZE}
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Everyone votes/i }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })

    expect(capturedBody?.judgingStyle).toBe("crowd_vote")
    expect(capturedBody?.buckets).toBeUndefined()
    expect(capturedBody?.criteria).toBeUndefined()
    expect(capturedBody?.maxPicks).toBeUndefined()
  })
})
