import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"

const mockRefresh = mock(() => {})
const navigationState = (globalThis as typeof globalThis & {
  __nextNavState: { router: { refresh: typeof mockRefresh } }
}).__nextNavState
navigationState.router.refresh = mockRefresh

const mockFetch = mock<(url: string, init?: RequestInit) => Promise<Response>>(
  () => Promise.resolve(new Response(null, { status: 200 })),
)
globalThis.fetch = mockFetch as unknown as typeof fetch

const { usePrizeJudgeAssignments } = await import(
  "@/hooks/use-prize-judge-assignments"
)

type TestJudge = {
  participantId: string
  displayName: string
  prizeIds: string[]
}

function judge(id: string, prizeIds: string[] = []): TestJudge {
  return { participantId: id, displayName: `Judge ${id}`, prizeIds }
}

function ok() {
  return new Response(null, { status: 200 })
}

function fail(status = 500) {
  return new Response(JSON.stringify({ error: "boom" }), { status })
}

function setup(initialJudges: TestJudge[]) {
  return renderHook(
    ({ judges }: { judges: TestJudge[] }) =>
      usePrizeJudgeAssignments({ hackathonId: "h1", judges }),
    { initialProps: { judges: initialJudges } },
  )
}

describe("usePrizeJudgeAssignments", () => {
  beforeEach(() => {
    cleanup()
    mockFetch.mockReset()
    mockRefresh.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it("returns server judges unchanged when no toggles have happened", () => {
    const { result } = setup([judge("j1", ["p1"])])
    expect(result.current.optimisticJudges).toEqual([
      { participantId: "j1", displayName: "Judge j1", prizeIds: ["p1"] },
    ])
  })

  it("optimistically adds a prize on assign, before the API resolves", async () => {
    let resolveFetch!: (r: Response) => void
    mockFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )

    const { result } = setup([judge("j1", [])])

    let assignPromise!: Promise<void>
    act(() => {
      assignPromise = result.current.assignJudgeToPrize("p1", "j1")
    })

    expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])
    expect(mockRefresh).not.toHaveBeenCalled()

    await act(async () => {
      resolveFetch(ok())
      await assignPromise
    })

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("calls the assign-judge endpoint with the right body", async () => {
    mockFetch.mockResolvedValue(ok())

    const { result } = setup([judge("j1", [])])

    await act(() => result.current.assignJudgeToPrize("p1", "j1"))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("/api/dashboard/hackathons/h1/prizes/p1/assign-judge")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toEqual({ judgeParticipantId: "j1" })
  })

  it("reverts the optimistic add and rethrows on assign failure", async () => {
    mockFetch.mockResolvedValue(fail())

    const { result } = setup([judge("j1", [])])

    let caught: unknown
    await act(async () => {
      try {
        await result.current.assignJudgeToPrize("p1", "j1")
      } catch (err) {
        caught = err
      }
    })

    expect(caught).toBeInstanceOf(Error)
    expect(result.current.optimisticJudges[0].prizeIds).toEqual([])
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("optimistically removes a prize on unassign", async () => {
    let resolveFetch!: (r: Response) => void
    mockFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )

    const { result } = setup([judge("j1", ["p1"])])

    let unassignPromise!: Promise<void>
    act(() => {
      unassignPromise = result.current.unassignJudgeFromPrize("p1", "j1")
    })

    expect(result.current.optimisticJudges[0].prizeIds).toEqual([])

    await act(async () => {
      resolveFetch(ok())
      await unassignPromise
    })

    expect(mockFetch.mock.calls[0][0]).toBe(
      "/api/dashboard/hackathons/h1/prizes/p1/judges/j1",
    )
    expect(mockFetch.mock.calls[0][1]?.method).toBe("DELETE")
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("restores the prize and rethrows on unassign failure", async () => {
    mockFetch.mockResolvedValue(fail())

    const { result } = setup([judge("j1", ["p1"])])

    let caught: unknown
    await act(async () => {
      try {
        await result.current.unassignJudgeFromPrize("p1", "j1")
      } catch (err) {
        caught = err
      }
    })

    expect(caught).toBeInstanceOf(Error)
    expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("reconciles addedPrizeJudges when server data catches up", async () => {
    mockFetch.mockResolvedValue(ok())

    const { result, rerender } = setup([judge("j1", [])])

    await act(() => result.current.assignJudgeToPrize("p1", "j1"))
    expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])

    rerender({ judges: [judge("j1", ["p1"])] })
    await waitFor(() => {
      expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])
    })

    rerender({ judges: [judge("j1", [])] })
    await waitFor(() => {
      expect(result.current.optimisticJudges[0].prizeIds).toEqual([])
    })
  })

  it("drops stale optimistic add when the judge disappears from server data", async () => {
    mockFetch.mockResolvedValue(ok())

    const { result, rerender } = setup([judge("j1", [])])

    await act(() => result.current.assignJudgeToPrize("p1", "j1"))
    expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])

    rerender({ judges: [] })
    await waitFor(() => {
      expect(result.current.optimisticJudges).toEqual([])
    })

    rerender({ judges: [judge("j1", [])] })
    expect(result.current.optimisticJudges[0].prizeIds).toEqual([])
  })

  it("does not duplicate when the same prize is in both server data and optimistic adds", async () => {
    mockFetch.mockResolvedValue(ok())

    const { result, rerender } = setup([judge("j1", [])])

    await act(() => result.current.assignJudgeToPrize("p1", "j1"))
    rerender({ judges: [judge("j1", ["p1"])] })

    await waitFor(() => {
      expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])
    })
  })

  it("supports rapid assign-then-unassign without leaving a phantom prize", async () => {
    mockFetch.mockResolvedValue(ok())

    const { result } = setup([judge("j1", [])])

    await act(() => result.current.assignJudgeToPrize("p1", "j1"))
    expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])

    await act(() => result.current.unassignJudgeFromPrize("p1", "j1"))
    expect(result.current.optimisticJudges[0].prizeIds).toEqual([])
  })

  it("restores the optimistic add when unassign fails after a pending assign", async () => {
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount++
      return Promise.resolve(callCount === 1 ? ok() : fail())
    })

    const { result } = setup([judge("j1", [])])

    await act(() => result.current.assignJudgeToPrize("p1", "j1"))
    expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])

    let caught: unknown
    await act(async () => {
      try {
        await result.current.unassignJudgeFromPrize("p1", "j1")
      } catch (err) {
        caught = err
      }
    })

    expect(caught).toBeInstanceOf(Error)
    expect(result.current.optimisticJudges[0].prizeIds).toEqual(["p1"])
  })

  it("restores the optimistic hide when assign fails after a pending unassign", async () => {
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount++
      return Promise.resolve(callCount === 1 ? ok() : fail())
    })

    const { result } = setup([judge("j1", ["p1"])])

    await act(() => result.current.unassignJudgeFromPrize("p1", "j1"))
    expect(result.current.optimisticJudges[0].prizeIds).toEqual([])

    let caught: unknown
    await act(async () => {
      try {
        await result.current.assignJudgeToPrize("p1", "j1")
      } catch (err) {
        caught = err
      }
    })

    expect(caught).toBeInstanceOf(Error)
    expect(result.current.optimisticJudges[0].prizeIds).toEqual([])
  })

  it("preserves non-prize fields on each judge", () => {
    const { result } = setup([judge("j1", ["p1"])])
    expect(result.current.optimisticJudges[0].displayName).toBe("Judge j1")
  })
})
