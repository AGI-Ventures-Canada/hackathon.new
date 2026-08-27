import { afterEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { WebMcpTool } from "@/lib/webmcp/types"

const { SponsorFulfillmentView } = await import(
  "@/components/hackathon/prizes/sponsor-fulfillment-view"
)

afterEach(() => {
  cleanup()
  delete document.modelContext
})

const baseFulfillment = {
  fulfillmentId: "f-1",
  prizeName: "Grand Prize",
  prizeValue: "$1000",
  submissionTitle: "Cool Project",
  teamName: "Team Alpha",
  trackingNumber: null,
  claimedAt: null,
  paymentMethod: null,
  paymentDetail: null,
}

describe("SponsorFulfillmentView", () => {
  it("renders empty state when no fulfillments", () => {
    render(
      <SponsorFulfillmentView hackathonId="h1" fulfillments={[]} />
    )
    expect(screen.getByText("No prize assignments for your sponsored tracks yet.")).toBeTruthy()
  })

  it("renders fulfillment table with prize data", () => {
    render(
      <SponsorFulfillmentView
        hackathonId="h1"
        fulfillments={[
          {
            ...baseFulfillment,
            status: "assigned",
            recipientName: null,
            recipientEmail: null,
            shippingAddress: null,
          },
        ]}
      />
    )
    expect(screen.getByText("Grand Prize")).toBeTruthy()
    expect(screen.getByText("$1000")).toBeTruthy()
    expect(screen.getByText("Awaiting Claim")).toBeTruthy()
  })

  it("shows Mark Fulfilled button only for claimed fulfillments", () => {
    render(
      <SponsorFulfillmentView
        hackathonId="h1"
        fulfillments={[
          {
            ...baseFulfillment,
            status: "claimed",
            recipientName: "Alice",
            recipientEmail: "alice@example.com",
            shippingAddress: "123 Main St",
            claimedAt: "2026-04-01T00:00:00Z",
          },
        ]}
      />
    )
    expect(screen.getByText("Mark Fulfilled")).toBeTruthy()
    expect(screen.getByText("Alice")).toBeTruthy()
  })

  it("does not show Mark Fulfilled button for assigned fulfillments", () => {
    render(
      <SponsorFulfillmentView
        hackathonId="h1"
        fulfillments={[
          {
            ...baseFulfillment,
            status: "assigned",
            recipientName: null,
            recipientEmail: null,
            shippingAddress: null,
          },
        ]}
      />
    )
    expect(screen.queryByText("Mark Fulfilled")).toBeNull()
  })

  it("shows Fulfilled label for shipped fulfillments", () => {
    render(
      <SponsorFulfillmentView
        hackathonId="h1"
        fulfillments={[
          {
            ...baseFulfillment,
            status: "shipped",
            recipientName: "Bob",
            recipientEmail: "bob@example.com",
            shippingAddress: null,
            trackingNumber: "TRACK123",
          },
        ]}
      />
    )
    expect(screen.getAllByText("Fulfilled").length).toBeGreaterThanOrEqual(1)
  })

  it("lets WebMCP prepare a human review and rolls back a failed optimistic save", async () => {
    const registered = new Map<string, WebMcpTool>()
    document.modelContext = {
      registerTool: mock(async (tool, options) => {
        registered.set(tool.name, tool)
        options?.signal?.addEventListener("abort", () => {
          if (registered.get(tool.name) === tool) registered.delete(tool.name)
        })
      }),
    }
    const originalFetch = globalThis.fetch
    let finishRequest: ((response: Response) => void) | undefined
    globalThis.fetch = mock(() => new Promise<Response>((resolve) => {
      finishRequest = resolve
    })) as typeof fetch

    try {
      render(
        <SponsorFulfillmentView
          hackathonId="h1"
          fulfillments={[{
            ...baseFulfillment,
            status: "claimed",
            recipientName: "Alice",
            recipientEmail: "alice@example.com",
            shippingAddress: "123 Main St",
            claimedAt: "2026-04-01T00:00:00Z",
          }]}
        />,
      )
      await waitFor(() => expect(registered.has("prepare_fulfillment")).toBe(true))

      let preparation: unknown
      await act(async () => {
        preparation = await registered.get("prepare_fulfillment")!.execute({
          fulfillmentRef: "fulfillment-1",
          trackingNumber: "TRACK-1",
        }, { signal: new AbortController().signal })
      })
      expect(preparation).toMatchObject({
        ok: true,
        requiresHumanAction: true,
      })
      expect((screen.getByLabelText("Tracking number (optional)") as HTMLInputElement).value)
        .toBe("TRACK-1")
      expect(globalThis.fetch).not.toHaveBeenCalled()

      fireEvent.click(screen.getByText("Confirm Fulfilled"))
      expect(screen.getAllByText("Fulfilled").length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText("Confirm Fulfilled")).toBeNull()

      finishRequest?.(new Response(null, { status: 500 }))
      await waitFor(() => {
        expect(screen.getByText("We couldn't mark that prize fulfilled. Try again.")).toBeTruthy()
        expect(screen.getByText("Mark Fulfilled")).toBeTruthy()
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
