import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { BrowseHackathonGrid } from "@/components/hackathon/browse-hackathon-grid"

const originalFetch = globalThis.fetch
const originalScrollTo = window.scrollTo

beforeEach(() => {
  window.scrollTo = mock(() => {}) as typeof window.scrollTo
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  window.scrollTo = originalScrollTo
})

function makeHackathon(id: string, name: string) {
  return {
    id,
    slug: id,
    name,
    description: "A public event",
    status: "active",
    startsAt: "2026-06-01T08:30:00.000Z",
    endsAt: "2026-06-02T17:00:00.000Z",
    registrationOpensAt: null,
    registrationClosesAt: null,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

describe("BrowseHackathonGrid", () => {
  it("shows skeleton cards while pagination fetches the next page", async () => {
    const pageResponse = deferred<Response>()
    globalThis.fetch = mock(() => pageResponse.promise) as typeof fetch

    render(
      <BrowseHackathonGrid
        initialHackathons={[makeHackathon("hack-one", "Hack One")]}
        initialPage={1}
        initialTotalPages={2}
      />,
    )

    expect(screen.getByText("Hack One")).toBeDefined()

    fireEvent.click(screen.getByLabelText("Go to next page"))

    await waitFor(() => {
      expect(screen.getByLabelText("Loading")).toBeDefined()
    })
    expect(screen.queryByText("Hack One")).toBeNull()
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/public/hackathons?page=2&limit=9")

    await act(async () => {
      pageResponse.resolve(
        new Response(
          JSON.stringify({
            hackathons: [makeHackathon("hack-two", "Hack Two")],
            page: 2,
            totalPages: 2,
          }),
        ),
      )
      await pageResponse.promise
    })

    await waitFor(() => {
      expect(screen.getByText("Hack Two")).toBeDefined()
    })
    expect(screen.queryByLabelText("Loading")).toBeNull()
  })
})
