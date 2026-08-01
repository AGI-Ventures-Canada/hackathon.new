import { describe, it, expect, beforeEach, mock } from "bun:test"
import { renderHook, act } from "@testing-library/react"

const mockRefresh = mock(() => {})
const navigationState = (globalThis as typeof globalThis & {
  __nextNavState: { router: { refresh: typeof mockRefresh } }
}).__nextNavState
navigationState.router.refresh = mockRefresh

const { useOptimisticMutation } = await import(
  "@/hooks/use-optimistic-mutation"
)

describe("useOptimisticMutation", () => {
  beforeEach(() => {
    mockRefresh.mockClear()
  })

  it("calls onOptimistic before the API call", async () => {
    const order: string[] = []
    const fn = mock(async () => {
      order.push("api")
      return { ok: true }
    })
    const onOptimistic = mock(() => order.push("optimistic"))

    const { result } = renderHook(() =>
      useOptimisticMutation({ fn, onOptimistic })
    )

    await act(() => result.current.execute("input"))

    expect(order).toEqual(["optimistic", "api"])
    expect(onOptimistic).toHaveBeenCalledWith("input")
  })

  it("calls onSuccess and router.refresh on success", async () => {
    const fn = mock(async (input: string) => ({ id: input }))
    const onSuccess = mock(() => {})

    const { result } = renderHook(() =>
      useOptimisticMutation({ fn, onSuccess })
    )

    await act(() => result.current.execute("test"))

    expect(onSuccess).toHaveBeenCalledWith({ id: "test" }, "test")
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(result.current.isPending).toBe(false)
  })

  it("skips router.refresh when refreshOnSuccess is false", async () => {
    const fn = mock(async () => ({}))

    const { result } = renderHook(() =>
      useOptimisticMutation({ fn, refreshOnSuccess: false })
    )

    await act(() => result.current.execute("input"))

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("calls onRevert and sets error on failure", async () => {
    const fn = mock(async () => {
      throw new Error("Network error")
    })
    const onRevert = mock(() => {})
    const onError = mock(() => {})

    const { result } = renderHook(() =>
      useOptimisticMutation({ fn, onRevert, onError })
    )

    await act(() => result.current.execute("input"))

    expect(onRevert).toHaveBeenCalledWith("input")
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].message).toBe("Network error")
    expect(result.current.error).toBe("Network error")
    expect(result.current.isPending).toBe(false)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("sets fallback error message for non-Error throws", async () => {
    const fn = mock(async () => {
      throw "string error"
    })

    const { result } = renderHook(() => useOptimisticMutation({ fn }))

    await act(() => result.current.execute("input"))

    expect(result.current.error).toBe("Something went wrong")
  })

  it("clears error via clearError", async () => {
    const fn = mock(async () => {
      throw new Error("fail")
    })

    const { result } = renderHook(() => useOptimisticMutation({ fn }))

    await act(() => result.current.execute("input"))
    expect(result.current.error).toBe("fail")

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it("sets isPending during execution", async () => {
    let resolveFn: () => void
    const fn = mock(
      () => new Promise<void>((resolve) => { resolveFn = resolve })
    )

    const { result } = renderHook(() => useOptimisticMutation({ fn }))

    expect(result.current.isPending).toBe(false)

    let executePromise: Promise<void>
    act(() => {
      executePromise = result.current.execute("input")
    })

    expect(result.current.isPending).toBe(true)

    await act(async () => {
      resolveFn!()
      await executePromise!
    })

    expect(result.current.isPending).toBe(false)
  })
})
