import { describe, it, expect, beforeEach, mock } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import type { AssignmentDetail } from "@/hooks/use-prefetch-assignment"

const mockFetch = mock<(url: string) => Promise<Response>>(() =>
  Promise.resolve(new Response(null, { status: 404 }))
)
globalThis.fetch = mockFetch as unknown as typeof fetch

const { usePrefetchAssignment } = await import(
  "@/hooks/use-prefetch-assignment"
)

function fakeDetail(id: string): AssignmentDetail {
  return {
    id,
    submissionId: `sub-${id}`,
    submissionTitle: `Title ${id}`,
    submissionDescription: null,
    submissionGithubUrl: null,
    submissionLiveAppUrl: null,
    submissionScreenshotUrl: null,
    teamName: null,
    isComplete: false,
    notes: "",
    criteria: [],
  }
}

function okResponse(data: AssignmentDetail) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("usePrefetchAssignment", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("fetches and caches an assignment", async () => {
    const detail = fakeDetail("a1")
    mockFetch.mockResolvedValue(okResponse(detail))

    const { result } = renderHook(() =>
      usePrefetchAssignment("my-hack", "a1")
    )

    await waitFor(() => {
      expect(result.current["a1"]).toBeDefined()
    })
    expect(result.current["a1"].id).toBe("a1")
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("does not fetch when nextAssignmentId is null", async () => {
    renderHook(() => usePrefetchAssignment("my-hack", null))

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("does not refetch the same assignment id", async () => {
    const detail = fakeDetail("a1")
    mockFetch.mockResolvedValue(okResponse(detail))

    const { result, rerender } = renderHook(
      ({ id }) => usePrefetchAssignment("my-hack", id),
      { initialProps: { id: "a1" as string | null } }
    )

    await waitFor(() => {
      expect(result.current["a1"]).toBeDefined()
    })

    rerender({ id: "a1" })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("evicts oldest entries when cache exceeds MAX_CACHE_SIZE", async () => {
    const ids = ["a1", "a2", "a3", "a4"]

    mockFetch.mockResolvedValue(okResponse(fakeDetail(ids[0])))

    const { result, rerender } = renderHook(
      ({ id }) => usePrefetchAssignment("my-hack", id),
      { initialProps: { id: ids[0] as string | null } }
    )

    await waitFor(() => {
      expect(result.current[ids[0]]).toBeDefined()
    })

    for (const id of ids.slice(1)) {
      mockFetch.mockResolvedValue(okResponse(fakeDetail(id)))
      rerender({ id })
      await waitFor(() => {
        expect(result.current[id]).toBeDefined()
      })
    }

    expect(result.current["a1"]).toBeUndefined()
    expect(result.current["a2"]).toBeDefined()
    expect(result.current["a3"]).toBeDefined()
    expect(result.current["a4"]).toBeDefined()
  })

  it("does not update cache after unmount", async () => {
    let resolvePromise: (value: Response) => void
    mockFetch.mockImplementation(
      () => new Promise<Response>((resolve) => { resolvePromise = resolve })
    )

    const { result, unmount } = renderHook(() =>
      usePrefetchAssignment("my-hack", "a1")
    )

    unmount()

    await act(async () => {
      resolvePromise!(okResponse(fakeDetail("a1")))
    })

    expect(result.current["a1"]).toBeUndefined()
  })

  it("returns empty cache on non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }))

    const { result } = renderHook(() =>
      usePrefetchAssignment("my-hack", "a1")
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current).toEqual({})
  })
})
